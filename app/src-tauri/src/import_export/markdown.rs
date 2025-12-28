use uuid::Uuid;

use crate::data::Node;

/// Generate Markdown content from nodes (Obsidian Tasks compatible)
pub fn generate_markdown(nodes: &[Node]) -> String {
    let mut output = String::new();
    write_markdown_nodes(&mut output, nodes, None, 0);
    output
}

fn write_markdown_nodes(output: &mut String, nodes: &[Node], parent_id: Option<Uuid>, depth: usize) {
    // Get children of this parent, sorted by position
    let mut children: Vec<_> = nodes.iter().filter(|n| n.parent_id == parent_id).collect();
    children.sort_by_key(|n| n.position);

    for node in children {
        let indent = "  ".repeat(depth);
        let content = html_to_markdown(&node.content);

        // Determine bullet type
        let bullet = if node.is_checked {
            "- [x]"
        } else if matches!(node.node_type, crate::data::NodeType::Checkbox) {
            "- [ ]"
        } else {
            "-"
        };

        // Build the line with Obsidian Tasks metadata
        let mut line = format!("{}{} {}", indent, bullet, content);

        // Add due date emoji (📅)
        if let Some(ref date) = node.date {
            line.push_str(&format!(" 📅 {}", date));
        }

        // Add recurrence emoji (🔁) - convert RRULE to human-readable
        if let Some(ref rrule) = node.date_recurrence {
            if let Some(human_readable) = rrule_to_human_readable(rrule) {
                line.push_str(&format!(" 🔁 {}", human_readable));
            }
        }

        // Add completion date emoji (✅) for checked items
        if node.is_checked {
            // Use the updated_at date as completion date
            let completion_date = node.updated_at.format("%Y-%m-%d").to_string();
            line.push_str(&format!(" ✅ {}", completion_date));
        }

        output.push_str(&line);
        output.push('\n');

        // Add note if present (as indented paragraph)
        if let Some(ref note) = node.note {
            let note_indent = "  ".repeat(depth + 1);
            for line in note.lines() {
                output.push_str(&format!("{}{}\n", note_indent, line));
            }
        }

        // Recurse to children
        write_markdown_nodes(output, nodes, Some(node.id), depth + 1);
    }
}

/// Convert RRULE format to Obsidian Tasks human-readable format
fn rrule_to_human_readable(rrule: &str) -> Option<String> {
    // Parse the RRULE string
    // Examples:
    //   FREQ=DAILY;INTERVAL=1 -> "every day"
    //   FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,WE,FR -> "every week on Monday, Wednesday, Friday"
    //   FREQ=MONTHLY;INTERVAL=2 -> "every 2 months"

    let mut freq = "";
    let mut interval = 1;
    let mut byday: Vec<&str> = Vec::new();

    for part in rrule.split(';') {
        if let Some((key, value)) = part.split_once('=') {
            match key {
                "FREQ" => freq = value,
                "INTERVAL" => interval = value.parse().unwrap_or(1),
                "BYDAY" => byday = value.split(',').collect(),
                _ => {}
            }
        }
    }

    let freq_word = match freq {
        "DAILY" => if interval == 1 { "day" } else { "days" },
        "WEEKLY" => if interval == 1 { "week" } else { "weeks" },
        "MONTHLY" => if interval == 1 { "month" } else { "months" },
        "YEARLY" => if interval == 1 { "year" } else { "years" },
        _ => return None,
    };

    let mut result = if interval == 1 {
        format!("every {}", freq_word)
    } else {
        format!("every {} {}", interval, freq_word)
    };

    // Add days for weekly recurrence
    if freq == "WEEKLY" && !byday.is_empty() {
        let day_names: Vec<&str> = byday.iter().map(|d| match *d {
            "MO" => "Monday",
            "TU" => "Tuesday",
            "WE" => "Wednesday",
            "TH" => "Thursday",
            "FR" => "Friday",
            "SA" => "Saturday",
            "SU" => "Sunday",
            _ => *d,
        }).collect();

        if !day_names.is_empty() {
            result.push_str(" on ");
            result.push_str(&day_names.join(", "));
        }
    }

    Some(result)
}

/// Convert HTML content to Markdown
fn html_to_markdown(html: &str) -> String {
    let mut result = String::with_capacity(html.len());
    let mut chars = html.chars().peekable();
    let mut tag_stack: Vec<String> = Vec::new();

    while let Some(c) = chars.next() {
        if c == '<' {
            // Parse tag
            let mut tag = String::new();
            let mut is_closing = false;

            while let Some(&next_char) = chars.peek() {
                if next_char == '>' {
                    chars.next();
                    break;
                }
                let next = chars.next().unwrap();
                if next == '/' && tag.is_empty() {
                    is_closing = true;
                } else {
                    tag.push(next);
                }
            }

            // Extract tag name (before space or end)
            let tag_name = tag.split_whitespace().next().unwrap_or("").to_lowercase();

            if is_closing {
                // Closing tag
                match tag_name.as_str() {
                    "strong" | "b" => result.push_str("**"),
                    "em" | "i" => result.push('*'),
                    "code" => result.push('`'),
                    "a" => {
                        // Close markdown link - already handled in opening
                    }
                    _ => {}
                }
                tag_stack.retain(|t| t != &tag_name);
            } else {
                // Opening tag
                match tag_name.as_str() {
                    "strong" | "b" => {
                        result.push_str("**");
                        tag_stack.push(tag_name);
                    }
                    "em" | "i" => {
                        result.push('*');
                        tag_stack.push(tag_name);
                    }
                    "code" => {
                        result.push('`');
                        tag_stack.push(tag_name);
                    }
                    "a" => {
                        // Extract href
                        if let Some(href_start) = tag.find("href=\"") {
                            let href_content = &tag[href_start + 6..];
                            if let Some(href_end) = href_content.find('"') {
                                let href = &href_content[..href_end];
                                // Collect link text until </a>
                                let mut link_text = String::new();
                                while let Some(&next_char) = chars.peek() {
                                    if next_char == '<' {
                                        // Check if this is </a>
                                        let mut peek_chars = chars.clone();
                                        peek_chars.next(); // consume '<'
                                        let mut close_tag = String::new();
                                        for pc in peek_chars.by_ref() {
                                            if pc == '>' {
                                                break;
                                            }
                                            close_tag.push(pc);
                                        }
                                        if close_tag.to_lowercase() == "/a" {
                                            // Skip past </a>
                                            chars.next(); // <
                                            for _ in 0..close_tag.len() + 1 {
                                                chars.next();
                                            }
                                            break;
                                        }
                                    }
                                    link_text.push(chars.next().unwrap());
                                }
                                result.push_str(&format!("[{}]({})", link_text, href));
                            }
                        }
                    }
                    "br" => result.push('\n'),
                    _ => {}
                }
            }
        } else {
            result.push(c);
        }
    }

    // Decode HTML entities
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
    use crate::data::NodeType;

    #[test]
    fn test_generate_markdown_simple() {
        let mut nodes = vec![
            Node::new("First item".to_string()),
            Node::new("Second item".to_string()),
        ];
        nodes[0].position = 0;
        nodes[1].position = 1;

        let md = generate_markdown(&nodes);
        assert!(md.contains("- First item"));
        assert!(md.contains("- Second item"));
    }

    #[test]
    fn test_generate_markdown_nested() {
        let parent = Node::new("Parent".to_string());
        let parent_id = parent.id;
        let child = Node::new_child(parent_id, 0, "Child".to_string());

        let nodes = vec![parent, child];
        let md = generate_markdown(&nodes);

        assert!(md.contains("- Parent"));
        assert!(md.contains("  - Child"));
    }

    #[test]
    fn test_generate_markdown_checkbox() {
        let mut node = Node::new("Task".to_string());
        node.node_type = NodeType::Checkbox;
        node.is_checked = false;

        let nodes = vec![node];
        let md = generate_markdown(&nodes);
        assert!(md.contains("- [ ] Task"));
    }

    #[test]
    fn test_generate_markdown_checked() {
        let mut node = Node::new("Done task".to_string());
        node.node_type = NodeType::Checkbox;
        node.is_checked = true;

        let nodes = vec![node];
        let md = generate_markdown(&nodes);
        assert!(md.contains("- [x] Done task"));
        // Should also have completion date emoji
        assert!(md.contains("✅"));
    }

    #[test]
    fn test_generate_markdown_with_note() {
        let mut node = Node::new("Item".to_string());
        node.note = Some("This is a note".to_string());

        let nodes = vec![node];
        let md = generate_markdown(&nodes);
        assert!(md.contains("- Item"));
        assert!(md.contains("  This is a note"));
    }

    #[test]
    fn test_generate_markdown_with_due_date() {
        let mut node = Node::new("Task with date".to_string());
        node.node_type = NodeType::Checkbox;
        node.date = Some("2025-01-15".to_string());

        let nodes = vec![node];
        let md = generate_markdown(&nodes);
        assert!(md.contains("- [ ] Task with date"));
        assert!(md.contains("📅 2025-01-15"));
    }

    #[test]
    fn test_generate_markdown_with_recurrence() {
        let mut node = Node::new("Recurring task".to_string());
        node.node_type = NodeType::Checkbox;
        node.date_recurrence = Some("FREQ=WEEKLY;INTERVAL=1".to_string());

        let nodes = vec![node];
        let md = generate_markdown(&nodes);
        assert!(md.contains("- [ ] Recurring task"));
        assert!(md.contains("🔁 every week"));
    }

    #[test]
    fn test_generate_markdown_with_weekly_days() {
        let mut node = Node::new("Weekly task".to_string());
        node.node_type = NodeType::Checkbox;
        node.date_recurrence = Some("FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,WE,FR".to_string());

        let nodes = vec![node];
        let md = generate_markdown(&nodes);
        assert!(md.contains("🔁 every week on Monday, Wednesday, Friday"));
    }

    #[test]
    fn test_rrule_to_human_readable() {
        assert_eq!(rrule_to_human_readable("FREQ=DAILY;INTERVAL=1"), Some("every day".to_string()));
        assert_eq!(rrule_to_human_readable("FREQ=DAILY;INTERVAL=2"), Some("every 2 days".to_string()));
        assert_eq!(rrule_to_human_readable("FREQ=WEEKLY;INTERVAL=1"), Some("every week".to_string()));
        assert_eq!(rrule_to_human_readable("FREQ=MONTHLY;INTERVAL=1"), Some("every month".to_string()));
        assert_eq!(rrule_to_human_readable("FREQ=YEARLY;INTERVAL=1"), Some("every year".to_string()));
        assert_eq!(rrule_to_human_readable("FREQ=WEEKLY;INTERVAL=2"), Some("every 2 weeks".to_string()));
    }

    #[test]
    fn test_html_to_markdown_bold() {
        assert_eq!(html_to_markdown("<strong>bold</strong>"), "**bold**");
        assert_eq!(html_to_markdown("<b>bold</b>"), "**bold**");
    }

    #[test]
    fn test_html_to_markdown_italic() {
        assert_eq!(html_to_markdown("<em>italic</em>"), "*italic*");
        assert_eq!(html_to_markdown("<i>italic</i>"), "*italic*");
    }

    #[test]
    fn test_html_to_markdown_code() {
        assert_eq!(html_to_markdown("<code>code</code>"), "`code`");
    }

    #[test]
    fn test_html_to_markdown_link() {
        assert_eq!(
            html_to_markdown("<a href=\"https://example.com\">link text</a>"),
            "[link text](https://example.com)"
        );
    }

    #[test]
    fn test_html_to_markdown_combined() {
        assert_eq!(
            html_to_markdown("Hello <strong>world</strong> and <em>italic</em>"),
            "Hello **world** and *italic*"
        );
    }

    #[test]
    fn test_html_to_markdown_entities() {
        assert_eq!(html_to_markdown("Hello&nbsp;World"), "Hello World");
        assert_eq!(html_to_markdown("A &amp; B"), "A & B");
        assert_eq!(html_to_markdown("&lt;tag&gt;"), "<tag>");
    }
}
