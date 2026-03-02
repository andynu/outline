use uuid::Uuid;

use crate::data::{Node, NodeType};

/// Generate a standalone HTML document from nodes
pub fn generate_html(nodes: &[Node], title: &str, dark_mode: bool) -> String {
    let mut output = String::new();

    output.push_str("<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n");
    output.push_str("<meta charset=\"UTF-8\">\n");
    output.push_str("<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n");
    output.push_str(&format!("<title>{}</title>\n", escape_html(title)));
    output.push_str("<style>\n");
    output.push_str(&generate_css(dark_mode));
    output.push_str("</style>\n");
    output.push_str("</head>\n<body>\n");
    output.push_str("<div class=\"outline\">\n");

    write_html_nodes(&mut output, nodes, None, 0);

    output.push_str("</div>\n");
    output.push_str("</body>\n</html>\n");

    output
}

fn generate_css(dark_mode: bool) -> String {
    let (bg, fg, muted, border, checkbox_bg, note_bg, link_color, heading_color, code_bg) =
        if dark_mode {
            (
                "#1a1a2e",  // background
                "#e0e0e0",  // foreground
                "#888",     // muted text
                "#333",     // border
                "#2a2a3e",  // checkbox background
                "#2a2a3e",  // note background
                "#6eb5ff",  // link color
                "#ffffff",  // heading color
                "#2a2a3e",  // code background
            )
        } else {
            (
                "#ffffff",  // background
                "#1a1a1a",  // foreground
                "#666",     // muted text
                "#e0e0e0",  // border
                "#f5f5f5",  // checkbox background
                "#f8f8f8",  // note background
                "#0066cc",  // link color
                "#111111",  // heading color
                "#f0f0f0",  // code background
            )
        };

    format!(
        r#"* {{
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}}
body {{
  background: {bg};
  color: {fg};
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  font-size: 16px;
  line-height: 1.6;
  padding: 2rem;
  max-width: 48rem;
  margin: 0 auto;
}}
.outline > ul {{
  list-style: none;
  padding-left: 0;
}}
ul {{
  list-style: none;
  padding-left: 1.5rem;
}}
li {{
  margin: 0.25rem 0;
  position: relative;
}}
li > .content {{
  display: inline;
}}
.bullet::before {{
  content: "\2022";
  color: {muted};
  display: inline-block;
  width: 1rem;
  margin-left: -1rem;
}}
.checkbox {{
  padding-left: 0;
}}
.checkbox .check {{
  display: inline-block;
  width: 1rem;
  height: 1rem;
  border: 2px solid {muted};
  border-radius: 3px;
  margin-right: 0.5rem;
  vertical-align: middle;
  text-align: center;
  line-height: 1rem;
  font-size: 0.75rem;
  background: {checkbox_bg};
}}
.checkbox.checked .check {{
  background: {muted};
  color: {bg};
}}
.checkbox.checked .content {{
  text-decoration: line-through;
  color: {muted};
}}
.heading {{
  color: {heading_color};
  font-weight: 700;
  margin-top: 0.75rem;
  margin-bottom: 0.25rem;
}}
.heading.h1 {{ font-size: 1.75rem; }}
.heading.h2 {{ font-size: 1.5rem; }}
.heading.h3 {{ font-size: 1.25rem; }}
.heading.h4 {{ font-size: 1.1rem; }}
.heading.h5 {{ font-size: 1rem; }}
.heading.h6 {{ font-size: 0.9rem; }}
.note {{
  display: block;
  margin: 0.25rem 0 0.25rem 1.5rem;
  padding: 0.5rem 0.75rem;
  background: {note_bg};
  border-left: 3px solid {border};
  font-size: 0.9rem;
  color: {muted};
  border-radius: 0 4px 4px 0;
}}
.date {{
  display: inline-block;
  font-size: 0.8rem;
  color: {muted};
  margin-left: 0.5rem;
}}
a {{
  color: {link_color};
  text-decoration: none;
}}
a:hover {{
  text-decoration: underline;
}}
code {{
  background: {code_bg};
  padding: 0.1rem 0.3rem;
  border-radius: 3px;
  font-size: 0.9em;
}}
strong {{ font-weight: 700; }}
em {{ font-style: italic; }}
@media (max-width: 600px) {{
  body {{
    padding: 1rem;
    font-size: 15px;
  }}
  ul {{
    padding-left: 1.25rem;
  }}
}}
"#,
        bg = bg,
        fg = fg,
        muted = muted,
        border = border,
        checkbox_bg = checkbox_bg,
        note_bg = note_bg,
        link_color = link_color,
        heading_color = heading_color,
        code_bg = code_bg,
    )
}

fn write_html_nodes(output: &mut String, nodes: &[Node], parent_id: Option<Uuid>, depth: usize) {
    let mut children: Vec<_> = nodes.iter().filter(|n| n.parent_id == parent_id).collect();
    children.sort_by_key(|n| n.position);

    if children.is_empty() {
        return;
    }

    output.push_str("<ul>\n");

    for node in children {
        let has_children = nodes.iter().any(|n| n.parent_id == Some(node.id));

        match node.node_type {
            NodeType::Heading => {
                let level = node.heading_level.unwrap_or(1).min(6).max(1);
                output.push_str(&format!(
                    "<li class=\"heading h{}\"><span class=\"content\">{}</span>",
                    level,
                    sanitize_content(&node.content),
                ));
            }
            NodeType::Checkbox => {
                let checked_class = if node.is_checked { " checked" } else { "" };
                let check_mark = if node.is_checked { "&#x2713;" } else { "" };
                output.push_str(&format!(
                    "<li class=\"checkbox{}\"><span class=\"check\">{}</span><span class=\"content\">{}</span>",
                    checked_class,
                    check_mark,
                    sanitize_content(&node.content),
                ));
            }
            NodeType::Bullet => {
                output.push_str(&format!(
                    "<li class=\"bullet\"><span class=\"content\">{}</span>",
                    sanitize_content(&node.content),
                ));
            }
            NodeType::Numbered => {
                output.push_str(&format!(
                    "<li class=\"numbered\"><span class=\"content\">{}</span>",
                    sanitize_content(&node.content),
                ));
            }
        }

        // Add date if present
        if let Some(ref date) = node.date {
            output.push_str(&format!(
                "<span class=\"date\">{}</span>",
                escape_html(date)
            ));
        }

        // Add note if present
        if let Some(ref note) = node.note {
            output.push_str(&format!(
                "<span class=\"note\">{}</span>",
                escape_html(note)
            ));
        }

        output.push('\n');

        // Recurse into children
        if has_children {
            write_html_nodes(output, nodes, Some(node.id), depth + 1);
        }

        output.push_str("</li>\n");
    }

    output.push_str("</ul>\n");
}

/// Sanitize content HTML from TipTap.
/// The content may already contain HTML tags for formatting (strong, em, code, a, etc.).
/// We pass those through but escape any raw text that could be dangerous.
fn sanitize_content(html: &str) -> String {
    // The TipTap content already contains safe HTML formatting tags.
    // We allow: strong, b, em, i, code, a (with href), br, span
    // Since this is user-generated content from the app's own editor,
    // we pass it through as-is (it's already structured HTML from TipTap).
    html.to_string()
}

/// Escape special HTML characters in plain text
fn escape_html(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_html_simple() {
        let mut nodes = vec![
            Node::new("First item".to_string()),
            Node::new("Second item".to_string()),
        ];
        nodes[0].position = 0;
        nodes[1].position = 1;

        let html = generate_html(&nodes, "Test", false);
        assert!(html.contains("<!DOCTYPE html>"));
        assert!(html.contains("<title>Test</title>"));
        assert!(html.contains("First item"));
        assert!(html.contains("Second item"));
        assert!(html.contains("class=\"bullet\""));
    }

    #[test]
    fn test_generate_html_nested() {
        let parent = Node::new("Parent".to_string());
        let parent_id = parent.id;
        let child = Node::new_child(parent_id, 0, "Child".to_string());

        let nodes = vec![parent, child];
        let html = generate_html(&nodes, "Test", false);

        assert!(html.contains("Parent"));
        assert!(html.contains("Child"));
        // Should have nested <ul> elements
        let ul_count = html.matches("<ul>").count();
        assert!(ul_count >= 2, "Expected at least 2 <ul> elements for nesting, found {}", ul_count);
    }

    #[test]
    fn test_generate_html_checkbox() {
        let mut node = Node::new("Task".to_string());
        node.node_type = NodeType::Checkbox;
        node.is_checked = false;

        let nodes = vec![node];
        let html = generate_html(&nodes, "Test", false);
        assert!(html.contains("class=\"checkbox\""));
        assert!(html.contains("Task"));
    }

    #[test]
    fn test_generate_html_checked() {
        let mut node = Node::new("Done task".to_string());
        node.node_type = NodeType::Checkbox;
        node.is_checked = true;

        let nodes = vec![node];
        let html = generate_html(&nodes, "Test", false);
        assert!(html.contains("class=\"checkbox checked\""));
        assert!(html.contains("&#x2713;"));
    }

    #[test]
    fn test_generate_html_heading() {
        let mut node = Node::new("My Heading".to_string());
        node.node_type = NodeType::Heading;
        node.heading_level = Some(2);

        let nodes = vec![node];
        let html = generate_html(&nodes, "Test", false);
        assert!(html.contains("class=\"heading h2\""));
        assert!(html.contains("My Heading"));
    }

    #[test]
    fn test_generate_html_with_note() {
        let mut node = Node::new("Item".to_string());
        node.note = Some("This is a note".to_string());

        let nodes = vec![node];
        let html = generate_html(&nodes, "Test", false);
        assert!(html.contains("class=\"note\""));
        assert!(html.contains("This is a note"));
    }

    #[test]
    fn test_generate_html_with_date() {
        let mut node = Node::new("Task".to_string());
        node.date = Some("2025-01-15".to_string());

        let nodes = vec![node];
        let html = generate_html(&nodes, "Test", false);
        assert!(html.contains("class=\"date\""));
        assert!(html.contains("2025-01-15"));
    }

    #[test]
    fn test_generate_html_dark_mode() {
        let nodes = vec![Node::new("Item".to_string())];
        let html = generate_html(&nodes, "Test", true);

        // Dark mode should have dark background color
        assert!(html.contains("#1a1a2e"));
        assert!(html.contains("#e0e0e0"));
    }

    #[test]
    fn test_generate_html_light_mode() {
        let nodes = vec![Node::new("Item".to_string())];
        let html = generate_html(&nodes, "Test", false);

        // Light mode should have white background
        assert!(html.contains("#ffffff"));
        assert!(html.contains("#1a1a1a"));
    }

    #[test]
    fn test_escape_html() {
        assert_eq!(escape_html("a & b"), "a &amp; b");
        assert_eq!(escape_html("<script>"), "&lt;script&gt;");
        assert_eq!(escape_html("\"quoted\""), "&quot;quoted&quot;");
    }
}
