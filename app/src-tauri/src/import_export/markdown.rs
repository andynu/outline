use uuid::Uuid;

use crate::data::Node;

/// Generate Markdown content from nodes
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
        let content = strip_html(&node.content);

        // Determine bullet type
        let bullet = if node.is_checked {
            "- [x]"
        } else if matches!(node.node_type, crate::data::NodeType::Checkbox) {
            "- [ ]"
        } else {
            "-"
        };

        output.push_str(&format!("{}{} {}\n", indent, bullet, content));

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
}
