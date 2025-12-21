use chrono::Utc;
use quick_xml::events::{BytesDecl, BytesEnd, BytesStart, BytesText, Event};
use quick_xml::{Reader, Writer};
use regex::Regex;
use std::io::Cursor;
use uuid::Uuid;

use crate::data::Node;

/// Extract title from OPML content
pub fn get_opml_title(content: &str) -> Option<String> {
    let mut reader = Reader::from_str(content);
    reader.config_mut().trim_text(true);

    let mut buf = Vec::new();
    let mut in_head = false;
    let mut in_title = false;

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(ref e)) => {
                let name = e.name();
                let tag_name = String::from_utf8_lossy(name.as_ref());
                if tag_name == "head" {
                    in_head = true;
                } else if tag_name == "title" && in_head {
                    in_title = true;
                }
            }
            Ok(Event::Text(ref e)) if in_title => {
                if let Ok(text) = e.unescape() {
                    return Some(text.to_string());
                }
            }
            Ok(Event::End(ref e)) => {
                let name = e.name();
                let tag_name = String::from_utf8_lossy(name.as_ref());
                if tag_name == "head" {
                    return None; // Title not found in head
                } else if tag_name == "title" {
                    in_title = false;
                }
            }
            Ok(Event::Eof) => return None,
            Err(_) => return None,
            _ => {}
        }
        buf.clear();
    }
}

/// Parse OPML content and return a list of nodes
pub fn parse_opml(content: &str) -> Result<Vec<Node>, String> {
    let mut reader = Reader::from_str(content);
    reader.config_mut().trim_text(true);

    let mut nodes = Vec::new();
    // Stack of (parent_id, next_child_position)
    let mut parent_stack: Vec<(Option<Uuid>, i32)> = vec![(None, 0)];
    let mut in_body = false;
    let mut buf = Vec::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(ref e)) => {
                let name = e.name();
                let tag_name = String::from_utf8_lossy(name.as_ref());

                if tag_name == "body" {
                    in_body = true;
                } else if tag_name == "outline" && in_body {
                    let node = parse_outline_element(e, &mut parent_stack)?;
                    let node_id = node.id;
                    nodes.push(node);

                    // Push this node as parent for children
                    parent_stack.push((Some(node_id), 0));
                }
            }
            Ok(Event::Empty(ref e)) => {
                let name = e.name();
                let tag_name = String::from_utf8_lossy(name.as_ref());

                if tag_name == "outline" && in_body {
                    let node = parse_outline_element(e, &mut parent_stack)?;
                    nodes.push(node);
                    // Empty element has no children, no stack push needed
                }
            }
            Ok(Event::End(ref e)) => {
                let name = e.name();
                let tag_name = String::from_utf8_lossy(name.as_ref());
                if tag_name == "body" {
                    in_body = false;
                } else if tag_name == "outline" && in_body {
                    parent_stack.pop();
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => return Err(format!("XML parse error: {}", e)),
            _ => {}
        }
        buf.clear();
    }

    Ok(nodes)
}

fn parse_outline_element(
    e: &BytesStart,
    parent_stack: &mut Vec<(Option<Uuid>, i32)>,
) -> Result<Node, String> {
    let mut text = String::new();
    let mut note: Option<String> = None;
    let mut is_checked = false;
    let mut color: Option<String> = None;
    let mut heading_level: Option<u8> = None;

    for attr in e.attributes().flatten() {
        let key = String::from_utf8_lossy(attr.key.as_ref());
        let value = attr
            .unescape_value()
            .map_err(|e| format!("Attribute decode error: {}", e))?
            .to_string();

        match key.as_ref() {
            "text" => text = value,
            "_note" => note = Some(value),
            // Dynalist uses "complete" attribute for checked items
            "complete" => is_checked = value == "true",
            // Dynalist color labels: 1=red, 2=orange, 3=yellow, 4=green, 5=blue, 6=purple
            "colorLabel" => {
                color = match value.as_str() {
                    "1" => Some("red".to_string()),
                    "2" => Some("orange".to_string()),
                    "3" => Some("yellow".to_string()),
                    "4" => Some("green".to_string()),
                    "5" => Some("blue".to_string()),
                    "6" => Some("purple".to_string()),
                    _ => None,
                };
            }
            // Dynalist headings (1-6)
            "heading" => {
                heading_level = value.parse::<u8>().ok().filter(|&h| h >= 1 && h <= 6);
            }
            _ => {}
        }
    }

    // Get parent_id and position from stack
    let (parent_id, position) = if let Some((pid, pos)) = parent_stack.last_mut() {
        let current_pos = *pos;
        *pos += 1;
        (*pid, current_pos)
    } else {
        (None, 0)
    };

    // Process text to extract dates and convert special syntax
    let (processed_text, date, date_recurrence) = process_dynalist_content(&text);

    // Convert special syntax in notes too
    let processed_note = note.map(|n| convert_dynalist_syntax(&n));

    // Determine node type
    let node_type = if heading_level.is_some() {
        crate::data::NodeType::Heading
    } else if is_checked {
        crate::data::NodeType::Checkbox
    } else {
        crate::data::NodeType::Bullet
    };

    let now = Utc::now();
    Ok(Node {
        id: Uuid::now_v7(),
        parent_id,
        position,
        content: processed_text,
        note: processed_note,
        node_type,
        heading_level,
        is_checked,
        color,
        tags: Vec::new(),
        date,
        date_recurrence,
        collapsed: false,
        mirror_source_id: None,
        created_at: now,
        updated_at: now,
    })
}

/// Process Dynalist-specific content, extracting dates and converting syntax
fn process_dynalist_content(text: &str) -> (String, Option<String>, Option<String>) {
    // Extract Dynalist dates: !(2024-09-01) or !(2024-09-01 | 1y)
    // Capture: date part, optional recurrence part
    let date_re = Regex::new(r"!\((\d{4}-\d{2}-\d{2})(?:\s*\|\s*([^)]+))?\)\s*").unwrap();

    let mut date: Option<String> = None;
    let mut recurrence: Option<String> = None;

    // Extract the first date found
    if let Some(caps) = date_re.captures(text) {
        date = Some(caps.get(1).unwrap().as_str().to_string());
        if let Some(rec) = caps.get(2) {
            recurrence = convert_dynalist_recurrence(rec.as_str().trim());
        }
    }

    // Remove date patterns from text
    let text_without_dates = date_re.replace_all(text, "").to_string();

    // Convert other Dynalist syntax
    let converted = convert_dynalist_syntax(&text_without_dates);

    (converted, date, recurrence)
}

/// Convert Dynalist recurrence format to iCal RRULE
fn convert_dynalist_recurrence(rec: &str) -> Option<String> {
    // Dynalist uses formats like: 1d, 1w, 1m, 1y, ~1y
    // The ~ prefix means "from completion" but we'll treat it the same
    let rec = rec.trim_start_matches('~');

    // Parse number and unit
    let re = Regex::new(r"^(\d+)([dwmy])$").unwrap();
    if let Some(caps) = re.captures(rec) {
        let interval: u32 = caps.get(1).unwrap().as_str().parse().unwrap_or(1);
        let unit = caps.get(2).unwrap().as_str();

        let freq = match unit {
            "d" => "DAILY",
            "w" => "WEEKLY",
            "m" => "MONTHLY",
            "y" => "YEARLY",
            _ => return None,
        };

        if interval == 1 {
            return Some(format!("FREQ={}", freq));
        } else {
            return Some(format!("FREQ={};INTERVAL={}", freq, interval));
        }
    }

    None
}

/// Convert Dynalist-specific syntax to our format
fn convert_dynalist_syntax(text: &str) -> String {
    let mut result = text.to_string();

    // Convert Obsidian links: [@ob](obsidian://open?vault=...&file=...) -> [[page-name]]
    let obsidian_re = Regex::new(r"\[@ob\]\(obsidian://open\?vault=[^&]+&file=([^)]+)\)").unwrap();
    result = obsidian_re
        .replace_all(&result, |caps: &regex::Captures| {
            // URL decode the file path and convert to wiki link
            let file = caps.get(1).unwrap().as_str();
            let decoded = urlencoding::decode(file).unwrap_or_else(|_| file.into());
            // Take just the filename, not the full path
            let name = decoded.rsplit('/').next().unwrap_or(&decoded);
            format!("[[{}]]", name)
        })
        .to_string();

    // Convert ==highlighted text== to <mark>text</mark>
    let highlight_re = Regex::new(r"==([^=]+)==").unwrap();
    result = highlight_re.replace_all(&result, "<mark>$1</mark>").to_string();

    result
}


/// Generate OPML content from nodes
pub fn generate_opml(nodes: &[Node], title: &str) -> Result<String, String> {
    let mut writer = Writer::new(Cursor::new(Vec::new()));

    // XML declaration
    writer
        .write_event(Event::Decl(BytesDecl::new("1.0", Some("UTF-8"), None)))
        .map_err(|e| format!("Write error: {}", e))?;

    // OPML root
    let mut opml = BytesStart::new("opml");
    opml.push_attribute(("version", "2.0"));
    writer
        .write_event(Event::Start(opml))
        .map_err(|e| format!("Write error: {}", e))?;

    // Head
    writer
        .write_event(Event::Start(BytesStart::new("head")))
        .map_err(|e| format!("Write error: {}", e))?;

    writer
        .write_event(Event::Start(BytesStart::new("title")))
        .map_err(|e| format!("Write error: {}", e))?;
    writer
        .write_event(Event::Text(BytesText::new(title)))
        .map_err(|e| format!("Write error: {}", e))?;
    writer
        .write_event(Event::End(BytesEnd::new("title")))
        .map_err(|e| format!("Write error: {}", e))?;

    writer
        .write_event(Event::End(BytesEnd::new("head")))
        .map_err(|e| format!("Write error: {}", e))?;

    // Body
    writer
        .write_event(Event::Start(BytesStart::new("body")))
        .map_err(|e| format!("Write error: {}", e))?;

    // Write nodes recursively
    write_opml_nodes(&mut writer, nodes, None)?;

    writer
        .write_event(Event::End(BytesEnd::new("body")))
        .map_err(|e| format!("Write error: {}", e))?;

    writer
        .write_event(Event::End(BytesEnd::new("opml")))
        .map_err(|e| format!("Write error: {}", e))?;

    let result = writer.into_inner().into_inner();
    String::from_utf8(result).map_err(|e| format!("UTF-8 error: {}", e))
}

fn write_opml_nodes<W: std::io::Write>(
    writer: &mut Writer<W>,
    nodes: &[Node],
    parent_id: Option<Uuid>,
) -> Result<(), String> {
    // Get children of this parent, sorted by position
    let mut children: Vec<_> = nodes.iter().filter(|n| n.parent_id == parent_id).collect();
    children.sort_by_key(|n| n.position);

    for node in children {
        let mut outline = BytesStart::new("outline");

        // Strip HTML tags from content for OPML text
        let text = strip_html(&node.content);
        outline.push_attribute(("text", text.as_str()));

        // Add note if present
        if let Some(ref note) = node.note {
            outline.push_attribute(("_note", note.as_str()));
        }

        // Check if has children
        let has_children = nodes.iter().any(|n| n.parent_id == Some(node.id));

        if has_children {
            writer
                .write_event(Event::Start(outline))
                .map_err(|e| format!("Write error: {}", e))?;
            write_opml_nodes(writer, nodes, Some(node.id))?;
            writer
                .write_event(Event::End(BytesEnd::new("outline")))
                .map_err(|e| format!("Write error: {}", e))?;
        } else {
            writer
                .write_event(Event::Empty(outline))
                .map_err(|e| format!("Write error: {}", e))?;
        }
    }

    Ok(())
}

/// Strip HTML tags from content
fn strip_html(html: &str) -> String {
    let mut result = String::with_capacity(html.len());
    let mut in_tag = false;

    for c in html.chars() {
        match c {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => result.push(c),
            _ => {}
        }
    }

    result
        .replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .trim()
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_simple_opml() {
        let opml = r#"<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
    <head><title>Test</title></head>
    <body>
        <outline text="First item"/>
        <outline text="Second item">
            <outline text="Child item"/>
        </outline>
    </body>
</opml>"#;

        let nodes = parse_opml(opml).unwrap();
        assert_eq!(nodes.len(), 3);

        // Check hierarchy
        let first = &nodes[0];
        assert_eq!(strip_html(&first.content), "First item");
        assert!(first.parent_id.is_none());
        assert_eq!(first.position, 0);

        let second = &nodes[1];
        assert_eq!(strip_html(&second.content), "Second item");
        assert!(second.parent_id.is_none());
        assert_eq!(second.position, 1);

        let child = &nodes[2];
        assert_eq!(strip_html(&child.content), "Child item");
        assert_eq!(child.parent_id, Some(second.id));
        assert_eq!(child.position, 0);
    }

    #[test]
    fn test_parse_dynalist_opml() {
        // Dynalist export format
        let opml = r#"<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
<head>
<title>My Document</title>
</head>
<body>
<outline text="Project Tasks">
  <outline text="Task 1" _note="Some notes here"/>
  <outline text="Task 2">
    <outline text="Subtask A"/>
    <outline text="Subtask B"/>
  </outline>
</outline>
</body>
</opml>"#;

        let nodes = parse_opml(opml).unwrap();
        assert_eq!(nodes.len(), 5);

        // Find task with note
        let task1 = nodes.iter().find(|n| n.content == "Task 1").unwrap();
        assert_eq!(task1.note, Some("Some notes here".to_string()));
    }

    #[test]
    fn test_generate_opml() {
        let mut nodes = vec![
            Node::new("First item".to_string()),
            Node::new("Second item".to_string()),
        ];
        nodes[0].position = 0;
        nodes[1].position = 1;

        let opml = generate_opml(&nodes, "Test Document").unwrap();
        assert!(opml.contains("First item"));
        assert!(opml.contains("Second item"));
        assert!(opml.contains("opml version"));
        assert!(opml.contains("<title>Test Document</title>"));
    }

    #[test]
    fn test_roundtrip() {
        let original = r#"<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
<head><title>Roundtrip Test</title></head>
<body>
<outline text="Root">
  <outline text="Child 1"/>
  <outline text="Child 2">
    <outline text="Grandchild"/>
  </outline>
</outline>
</body>
</opml>"#;

        let nodes = parse_opml(original).unwrap();
        let regenerated = generate_opml(&nodes, "Roundtrip Test").unwrap();

        // Parse the regenerated OPML
        let nodes2 = parse_opml(&regenerated).unwrap();
        assert_eq!(nodes.len(), nodes2.len());

        // Check content matches
        for (a, b) in nodes.iter().zip(nodes2.iter()) {
            assert_eq!(a.content, b.content);
            assert_eq!(a.position, b.position);
        }
    }

    #[test]
    fn test_parse_dynalist_complete_and_colors() {
        // Dynalist export with complete and colorLabel attributes
        let opml = r#"<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
<head><title>Dynalist Export</title></head>
<body>
<outline text="Meeting Notes">
  <outline text="Completed task" complete="true"/>
  <outline text="Important item" colorLabel="1"/>
  <outline text="Warning" colorLabel="3"/>
  <outline text="Blue highlight" colorLabel="5"/>
</outline>
</body>
</opml>"#;

        let nodes = parse_opml(opml).unwrap();
        assert_eq!(nodes.len(), 5);

        // Find completed task
        let completed = nodes.iter().find(|n| n.content == "Completed task").unwrap();
        assert!(completed.is_checked);
        assert_eq!(completed.node_type, crate::data::NodeType::Checkbox);

        // Find colored items
        let red = nodes.iter().find(|n| n.content == "Important item").unwrap();
        assert_eq!(red.color, Some("red".to_string()));

        let yellow = nodes.iter().find(|n| n.content == "Warning").unwrap();
        assert_eq!(yellow.color, Some("yellow".to_string()));

        let blue = nodes.iter().find(|n| n.content == "Blue highlight").unwrap();
        assert_eq!(blue.color, Some("blue".to_string()));
    }

    #[test]
    fn test_get_opml_title() {
        let opml = r#"<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
<head>
<title>My Document Title</title>
</head>
<body><outline text="Item"/></body>
</opml>"#;

        let title = get_opml_title(opml);
        assert_eq!(title, Some("My Document Title".to_string()));
    }

    #[test]
    fn test_get_opml_title_missing() {
        let opml = r#"<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
<head></head>
<body><outline text="Item"/></body>
</opml>"#;

        let title = get_opml_title(opml);
        assert_eq!(title, None);
    }

    #[test]
    fn test_parse_dynalist_dates() {
        let opml = r#"<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
<head><title>Test</title></head>
<body>
    <outline text="Task with date !(2024-09-01) "/>
    <outline text="Recurring task !(2024-10-15 | 1m) "/>
    <outline text="Yearly task !(2024-01-01 | ~1y) "/>
</body>
</opml>"#;

        let nodes = parse_opml(opml).unwrap();
        assert_eq!(nodes.len(), 3);

        // Check date extraction
        let task1 = &nodes[0];
        assert_eq!(task1.content.trim(), "Task with date");
        assert_eq!(task1.date, Some("2024-09-01".to_string()));
        assert_eq!(task1.date_recurrence, None);

        // Check recurring date
        let task2 = &nodes[1];
        assert_eq!(task2.content.trim(), "Recurring task");
        assert_eq!(task2.date, Some("2024-10-15".to_string()));
        assert_eq!(task2.date_recurrence, Some("FREQ=MONTHLY".to_string()));

        // Check yearly recurrence with ~
        let task3 = &nodes[2];
        assert_eq!(task3.date, Some("2024-01-01".to_string()));
        assert_eq!(task3.date_recurrence, Some("FREQ=YEARLY".to_string()));
    }

    #[test]
    fn test_parse_dynalist_highlights() {
        let opml = r#"<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
<head><title>Test</title></head>
<body>
    <outline text="This has ==highlighted text== in it"/>
    <outline text="==Full highlight=="/>
</body>
</opml>"#;

        let nodes = parse_opml(opml).unwrap();
        assert_eq!(nodes.len(), 2);

        assert_eq!(nodes[0].content, "This has <mark>highlighted text</mark> in it");
        assert_eq!(nodes[1].content, "<mark>Full highlight</mark>");
    }

    #[test]
    fn test_parse_obsidian_links() {
        let opml = r#"<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
<head><title>Test</title></head>
<body>
    <outline text="See [@ob](obsidian://open?vault=notes&amp;file=my-note) for details"/>
    <outline text="Check [@ob](obsidian://open?vault=notes&amp;file=projects%2Fsome-project)"/>
</body>
</opml>"#;

        let nodes = parse_opml(opml).unwrap();
        assert_eq!(nodes.len(), 2);

        assert_eq!(nodes[0].content, "See [[my-note]] for details");
        // Should extract just the filename from path
        assert_eq!(nodes[1].content, "Check [[some-project]]");
    }

    #[test]
    fn test_parse_dynalist_headings() {
        let opml = r#"<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
<head><title>Test</title></head>
<body>
    <outline text="Main Heading" heading="1"/>
    <outline text="Subheading" heading="3"/>
    <outline text="Regular item"/>
</body>
</opml>"#;

        let nodes = parse_opml(opml).unwrap();
        assert_eq!(nodes.len(), 3);

        assert_eq!(nodes[0].node_type, crate::data::NodeType::Heading);
        assert_eq!(nodes[0].heading_level, Some(1));

        assert_eq!(nodes[1].node_type, crate::data::NodeType::Heading);
        assert_eq!(nodes[1].heading_level, Some(3));

        assert_eq!(nodes[2].node_type, crate::data::NodeType::Bullet);
        assert_eq!(nodes[2].heading_level, None);
    }

    #[test]
    fn test_convert_dynalist_recurrence() {
        assert_eq!(convert_dynalist_recurrence("1d"), Some("FREQ=DAILY".to_string()));
        assert_eq!(convert_dynalist_recurrence("1w"), Some("FREQ=WEEKLY".to_string()));
        assert_eq!(convert_dynalist_recurrence("1m"), Some("FREQ=MONTHLY".to_string()));
        assert_eq!(convert_dynalist_recurrence("1y"), Some("FREQ=YEARLY".to_string()));
        assert_eq!(convert_dynalist_recurrence("~1y"), Some("FREQ=YEARLY".to_string()));
        assert_eq!(convert_dynalist_recurrence("2w"), Some("FREQ=WEEKLY;INTERVAL=2".to_string()));
        assert_eq!(convert_dynalist_recurrence("3m"), Some("FREQ=MONTHLY;INTERVAL=3".to_string()));
        assert_eq!(convert_dynalist_recurrence("invalid"), None);
    }

    #[test]
    fn test_note_syntax_conversion() {
        let opml = r#"<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
<head><title>Test</title></head>
<body>
    <outline text="Item" _note="See [@ob](obsidian://open?vault=notes&amp;file=reference) and ==important=="/>
</body>
</opml>"#;

        let nodes = parse_opml(opml).unwrap();
        assert_eq!(nodes.len(), 1);

        let note = nodes[0].note.as_ref().unwrap();
        assert!(note.contains("[[reference]]"));
        assert!(note.contains("<mark>important</mark>"));
    }
}
