use chrono::Utc;
use quick_xml::events::{BytesDecl, BytesEnd, BytesStart, BytesText, Event};
use quick_xml::{Reader, Writer};
use std::io::Cursor;
use uuid::Uuid;

use crate::data::Node;

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

    for attr in e.attributes().flatten() {
        let key = String::from_utf8_lossy(attr.key.as_ref());
        let value = attr
            .unescape_value()
            .map_err(|e| format!("Attribute decode error: {}", e))?
            .to_string();

        match key.as_ref() {
            "text" => text = value,
            "_note" => note = Some(value),
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

    let now = Utc::now();
    Ok(Node {
        id: Uuid::now_v7(),
        parent_id,
        position,
        content: text,
        note,
        node_type: crate::data::NodeType::Bullet,
        heading_level: None,
        is_checked: false,
        color: None,
        tags: Vec::new(),
        date: None,
        date_recurrence: None,
        collapsed: false,
        mirror_source_id: None,
        created_at: now,
        updated_at: now,
    })
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
}
