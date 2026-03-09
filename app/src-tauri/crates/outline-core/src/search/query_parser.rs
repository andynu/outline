/// Search query parser that extracts structured operators from query strings.
///
/// Supports Dynalist-style operators:
/// - `is:completed`, `is:heading` -- filter by node type/state
/// - `has:date`, `has:note`, `has:children`, `has:color` -- filter by field presence
/// - `color:red` (etc.) -- filter by specific color
/// - `in:title`, `in:note` -- scope search to specific field
/// - `edited:RANGE`, `created:RANGE` -- date range filters
/// - Boolean: `OR`, `-term` (exclude)
/// - Exact phrase: `"quoted text"`

/// A parsed search query with operators extracted from the raw text.
#[derive(Debug, Clone, Default)]
pub struct ParsedQuery {
    /// Plain text terms to pass to FTS5
    pub text_terms: Vec<TextTerm>,
    /// Structured filter operators
    pub filters: Vec<SearchFilter>,
    /// Which field to scope FTS search to (None = all fields)
    pub search_scope: Option<SearchScope>,
}

/// A text term with optional boolean modifiers.
#[derive(Debug, Clone)]
pub enum TextTerm {
    /// A required term (default)
    Required(String),
    /// An excluded term (prefixed with `-`)
    Excluded(String),
    /// An exact phrase (wrapped in quotes)
    Phrase(String),
    /// OR operator between the previous and next term
    Or,
}

/// Structured filters extracted from operator syntax.
#[derive(Debug, Clone)]
pub enum SearchFilter {
    /// `is:completed` -- checked items only
    IsCompleted,
    /// `is:not-completed` -- unchecked items only
    IsNotCompleted,
    /// `is:heading` -- heading nodes only
    IsHeading,
    /// `is:checkbox` -- checkbox nodes only
    IsCheckbox,
    /// `has:date` -- items with a date set
    HasDate,
    /// `has:note` -- items with a note
    HasNote,
    /// `has:children` -- items with child nodes
    HasChildren,
    /// `has:color` -- items with any color
    HasColor,
    /// `color:VALUE` -- items with a specific color
    ColorIs(String),
    /// `edited:RANGE` -- edited within date range
    EditedInRange(DateRange),
    /// `created:RANGE` -- created within date range
    CreatedInRange(DateRange),
}

/// Scope for text search.
#[derive(Debug, Clone)]
pub enum SearchScope {
    /// `in:title` -- only search content/title
    Title,
    /// `in:note` -- only search notes
    Note,
}

/// Date range for `edited:` and `created:` operators.
#[derive(Debug, Clone)]
pub struct DateRange {
    /// ISO date string for start of range (inclusive), or None for open start
    pub from: Option<String>,
    /// ISO date string for end of range (inclusive), or None for open end
    pub to: Option<String>,
}

impl ParsedQuery {
    /// Returns true if there are no text terms (only filters).
    pub fn has_text(&self) -> bool {
        self.text_terms.iter().any(|t| !matches!(t, TextTerm::Or))
    }

    /// Build an FTS5 query string from the text terms.
    pub fn to_fts_query(&self) -> String {
        if self.text_terms.is_empty() {
            return String::new();
        }

        let mut parts: Vec<String> = Vec::new();
        let mut pending_or = false;

        for term in &self.text_terms {
            match term {
                TextTerm::Required(t) => {
                    let escaped = t.replace('"', "\"\"");
                    let fts_term = format!("\"{}\"*", escaped);
                    if pending_or {
                        if let Some(last) = parts.last_mut() {
                            *last = format!("{} OR {}", last, fts_term);
                        }
                        pending_or = false;
                    } else {
                        parts.push(fts_term);
                    }
                }
                TextTerm::Excluded(t) => {
                    let escaped = t.replace('"', "\"\"");
                    parts.push(format!("NOT \"{}\"*", escaped));
                }
                TextTerm::Phrase(p) => {
                    let escaped = p.replace('"', "\"\"");
                    let fts_term = format!("\"{}\"", escaped);
                    if pending_or {
                        if let Some(last) = parts.last_mut() {
                            *last = format!("{} OR {}", last, fts_term);
                        }
                        pending_or = false;
                    } else {
                        parts.push(fts_term);
                    }
                }
                TextTerm::Or => {
                    pending_or = true;
                }
            }
        }

        // Apply search scope if specified
        if let Some(ref scope) = self.search_scope {
            let column = match scope {
                SearchScope::Title => "content",
                SearchScope::Note => "note",
            };
            // FTS5 column filter syntax: {column : terms}
            let terms = parts.join(" ");
            format!("{} : {}", column, terms)
        } else {
            parts.join(" ")
        }
    }

    /// Build SQL WHERE clauses for the structured filters.
    /// Returns (clause_string, params) where clause_string uses ? placeholders.
    pub fn to_sql_filters(&self) -> (Vec<String>, Vec<String>) {
        let mut clauses = Vec::new();
        let mut params: Vec<String> = Vec::new();

        for filter in &self.filters {
            match filter {
                SearchFilter::IsCompleted => {
                    clauses.push("n.is_checked = 1".to_string());
                }
                SearchFilter::IsNotCompleted => {
                    clauses.push("n.is_checked = 0".to_string());
                }
                SearchFilter::IsHeading => {
                    clauses.push("n.node_type = 'heading'".to_string());
                }
                SearchFilter::IsCheckbox => {
                    clauses.push("n.node_type = 'checkbox'".to_string());
                }
                SearchFilter::HasDate => {
                    clauses.push("n.date IS NOT NULL".to_string());
                }
                SearchFilter::HasNote => {
                    clauses.push("n.note IS NOT NULL AND n.note != ''".to_string());
                }
                SearchFilter::HasChildren => {
                    clauses.push("n.children_count > 0".to_string());
                }
                SearchFilter::HasColor => {
                    clauses.push("n.color IS NOT NULL".to_string());
                }
                SearchFilter::ColorIs(color) => {
                    clauses.push("n.color = ?".to_string());
                    params.push(color.clone());
                }
                SearchFilter::EditedInRange(range) => {
                    if let Some(ref from) = range.from {
                        clauses.push("n.updated_at >= ?".to_string());
                        params.push(from.clone());
                    }
                    if let Some(ref to) = range.to {
                        clauses.push("n.updated_at <= ?".to_string());
                        params.push(to.clone());
                    }
                }
                SearchFilter::CreatedInRange(range) => {
                    if let Some(ref from) = range.from {
                        clauses.push("n.created_at >= ?".to_string());
                        params.push(from.clone());
                    }
                    if let Some(ref to) = range.to {
                        clauses.push("n.created_at <= ?".to_string());
                        params.push(to.clone());
                    }
                }
            }
        }

        (clauses, params)
    }
}

/// Parse a raw search query string into structured components.
pub fn parse_query(input: &str) -> ParsedQuery {
    let mut query = ParsedQuery::default();
    let mut chars = input.chars().peekable();
    let mut current_token = String::new();

    while let Some(&ch) = chars.peek() {
        match ch {
            '"' => {
                // Quoted phrase
                chars.next(); // consume opening quote
                let mut phrase = String::new();
                while let Some(&c) = chars.peek() {
                    if c == '"' {
                        chars.next(); // consume closing quote
                        break;
                    }
                    phrase.push(c);
                    chars.next();
                }
                if !phrase.is_empty() {
                    query.text_terms.push(TextTerm::Phrase(phrase));
                }
            }
            ' ' | '\t' => {
                // Whitespace: flush current token
                chars.next();
                if !current_token.is_empty() {
                    process_token(&current_token, &mut query);
                    current_token.clear();
                }
            }
            _ => {
                current_token.push(ch);
                chars.next();
            }
        }
    }

    // Flush any remaining token
    if !current_token.is_empty() {
        process_token(&current_token, &mut query);
    }

    query
}

/// Process a single whitespace-delimited token.
fn process_token(token: &str, query: &mut ParsedQuery) {
    // Check for OR operator
    if token == "OR" {
        query.text_terms.push(TextTerm::Or);
        return;
    }

    // Check for exclusion prefix
    if let Some(rest) = token.strip_prefix('-') {
        if rest.is_empty() {
            return;
        }
        // Could be -operator:value or -term
        if let Some(filter) = try_parse_negated_operator(rest) {
            query.filters.push(filter);
        } else {
            query.text_terms.push(TextTerm::Excluded(rest.to_string()));
        }
        return;
    }

    // Check for operator:value syntax
    if let Some(colon_pos) = token.find(':') {
        let (op, value) = token.split_at(colon_pos);
        let value = &value[1..]; // skip the colon
        let op_lower = op.to_lowercase();

        match op_lower.as_str() {
            "is" => {
                match value.to_lowercase().as_str() {
                    "completed" | "checked" | "done" => {
                        query.filters.push(SearchFilter::IsCompleted);
                    }
                    "not-completed" | "unchecked" | "not-done" => {
                        query.filters.push(SearchFilter::IsNotCompleted);
                    }
                    "heading" => {
                        query.filters.push(SearchFilter::IsHeading);
                    }
                    "checkbox" | "task" => {
                        query.filters.push(SearchFilter::IsCheckbox);
                    }
                    _ => {
                        // Unknown is: value, treat as plain text
                        query.text_terms.push(TextTerm::Required(token.to_string()));
                    }
                }
                return;
            }
            "has" => {
                match value.to_lowercase().as_str() {
                    "date" => {
                        query.filters.push(SearchFilter::HasDate);
                    }
                    "note" | "notes" => {
                        query.filters.push(SearchFilter::HasNote);
                    }
                    "children" | "child" => {
                        query.filters.push(SearchFilter::HasChildren);
                    }
                    "color" | "colour" => {
                        query.filters.push(SearchFilter::HasColor);
                    }
                    _ => {
                        query.text_terms.push(TextTerm::Required(token.to_string()));
                    }
                }
                return;
            }
            "color" | "colour" => {
                if !value.is_empty() {
                    query.filters.push(SearchFilter::ColorIs(value.to_lowercase()));
                }
                return;
            }
            "in" => {
                match value.to_lowercase().as_str() {
                    "title" | "content" => {
                        query.search_scope = Some(SearchScope::Title);
                    }
                    "note" | "notes" => {
                        query.search_scope = Some(SearchScope::Note);
                    }
                    _ => {
                        query.text_terms.push(TextTerm::Required(token.to_string()));
                    }
                }
                return;
            }
            "edited" => {
                if let Some(range) = parse_date_range(value) {
                    query.filters.push(SearchFilter::EditedInRange(range));
                    return;
                }
            }
            "created" => {
                if let Some(range) = parse_date_range(value) {
                    query.filters.push(SearchFilter::CreatedInRange(range));
                    return;
                }
            }
            _ => {}
        }
    }

    // Plain text term
    query.text_terms.push(TextTerm::Required(token.to_string()));
}

/// Try to parse a negated operator (e.g., `-is:completed` -> `is:not-completed`).
fn try_parse_negated_operator(token: &str) -> Option<SearchFilter> {
    if let Some(colon_pos) = token.find(':') {
        let (op, value) = token.split_at(colon_pos);
        let value = &value[1..];
        let op_lower = op.to_lowercase();

        match op_lower.as_str() {
            "is" => match value.to_lowercase().as_str() {
                "completed" | "checked" | "done" => Some(SearchFilter::IsNotCompleted),
                "heading" => None, // -is:heading doesn't have a simple negation
                _ => None,
            },
            "has" => match value.to_lowercase().as_str() {
                // For has: operators, negation doesn't make as much sense as a filter,
                // but we could support it. For now, return None and treat as excluded text.
                _ => None,
            },
            _ => None,
        }
    } else {
        None
    }
}

/// Parse a date range value (used for `edited:` and `created:` operators).
///
/// Supported formats:
/// - `2024-01-15` -- exact date
/// - `2024-01-15..2024-02-15` -- date range
/// - `..2024-02-15` -- before date
/// - `2024-01-15..` -- after date
/// - `-7d` -- last 7 days (relative)
/// - `-1w` -- last 1 week
/// - `-1m` -- last 1 month
/// - `today` -- today only
/// - `yesterday` -- yesterday only
fn parse_date_range(value: &str) -> Option<DateRange> {
    let value = value.trim();

    if value.is_empty() {
        return None;
    }

    // Relative date shortcuts
    match value.to_lowercase().as_str() {
        "today" => {
            let today = chrono::Utc::now().format("%Y-%m-%d").to_string();
            return Some(DateRange {
                from: Some(format!("{}T00:00:00Z", today)),
                to: Some(format!("{}T23:59:59Z", today)),
            });
        }
        "yesterday" => {
            let yesterday = (chrono::Utc::now() - chrono::Duration::days(1))
                .format("%Y-%m-%d")
                .to_string();
            return Some(DateRange {
                from: Some(format!("{}T00:00:00Z", yesterday)),
                to: Some(format!("{}T23:59:59Z", yesterday)),
            });
        }
        _ => {}
    }

    // Relative duration: -7d, -1w, -1m
    if value.starts_with('-') && value.len() >= 3 {
        let num_str = &value[1..value.len() - 1];
        let unit = value.chars().last().unwrap();

        if let Ok(num) = num_str.parse::<i64>() {
            let duration = match unit {
                'd' => Some(chrono::Duration::days(num)),
                'w' => Some(chrono::Duration::weeks(num)),
                'm' => Some(chrono::Duration::days(num * 30)), // approximate
                _ => None,
            };

            if let Some(dur) = duration {
                let from = (chrono::Utc::now() - dur).format("%Y-%m-%dT%H:%M:%SZ").to_string();
                return Some(DateRange {
                    from: Some(from),
                    to: None,
                });
            }
        }
    }

    // Range with .. separator
    if value.contains("..") {
        let parts: Vec<&str> = value.splitn(2, "..").collect();
        let from = if parts[0].is_empty() {
            None
        } else {
            Some(normalize_date(parts[0], true))
        };
        let to = if parts.len() < 2 || parts[1].is_empty() {
            None
        } else {
            Some(normalize_date(parts[1], false))
        };
        return Some(DateRange { from, to });
    }

    // Exact date
    if value.len() >= 10 && value.chars().take(4).all(|c| c.is_ascii_digit()) {
        return Some(DateRange {
            from: Some(normalize_date(value, true)),
            to: Some(normalize_date(value, false)),
        });
    }

    None
}

/// Normalize a date string to an ISO datetime.
/// If `start` is true, normalizes to start of day; otherwise end of day.
fn normalize_date(date: &str, start: bool) -> String {
    let date = date.trim();
    if date.contains('T') {
        // Already has time component
        date.to_string()
    } else if start {
        format!("{}T00:00:00Z", date)
    } else {
        format!("{}T23:59:59Z", date)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_plain_text_query() {
        let parsed = parse_query("hello world");
        assert_eq!(parsed.text_terms.len(), 2);
        assert!(matches!(&parsed.text_terms[0], TextTerm::Required(t) if t == "hello"));
        assert!(matches!(&parsed.text_terms[1], TextTerm::Required(t) if t == "world"));
        assert!(parsed.filters.is_empty());
    }

    #[test]
    fn test_quoted_phrase() {
        let parsed = parse_query("\"hello world\" test");
        assert_eq!(parsed.text_terms.len(), 2);
        assert!(matches!(&parsed.text_terms[0], TextTerm::Phrase(t) if t == "hello world"));
        assert!(matches!(&parsed.text_terms[1], TextTerm::Required(t) if t == "test"));
    }

    #[test]
    fn test_exclusion() {
        let parsed = parse_query("hello -world");
        assert_eq!(parsed.text_terms.len(), 2);
        assert!(matches!(&parsed.text_terms[0], TextTerm::Required(t) if t == "hello"));
        assert!(matches!(&parsed.text_terms[1], TextTerm::Excluded(t) if t == "world"));
    }

    #[test]
    fn test_or_operator() {
        let parsed = parse_query("hello OR world");
        assert_eq!(parsed.text_terms.len(), 3);
        assert!(matches!(&parsed.text_terms[0], TextTerm::Required(t) if t == "hello"));
        assert!(matches!(&parsed.text_terms[1], TextTerm::Or));
        assert!(matches!(&parsed.text_terms[2], TextTerm::Required(t) if t == "world"));
    }

    #[test]
    fn test_is_completed_filter() {
        let parsed = parse_query("is:completed todo");
        assert_eq!(parsed.text_terms.len(), 1);
        assert_eq!(parsed.filters.len(), 1);
        assert!(matches!(&parsed.filters[0], SearchFilter::IsCompleted));
    }

    #[test]
    fn test_is_heading_filter() {
        let parsed = parse_query("is:heading");
        assert!(parsed.text_terms.is_empty());
        assert_eq!(parsed.filters.len(), 1);
        assert!(matches!(&parsed.filters[0], SearchFilter::IsHeading));
    }

    #[test]
    fn test_has_date_filter() {
        let parsed = parse_query("has:date meeting");
        assert_eq!(parsed.text_terms.len(), 1);
        assert_eq!(parsed.filters.len(), 1);
        assert!(matches!(&parsed.filters[0], SearchFilter::HasDate));
    }

    #[test]
    fn test_has_note_filter() {
        let parsed = parse_query("has:note");
        assert_eq!(parsed.filters.len(), 1);
        assert!(matches!(&parsed.filters[0], SearchFilter::HasNote));
    }

    #[test]
    fn test_has_children_filter() {
        let parsed = parse_query("has:children");
        assert_eq!(parsed.filters.len(), 1);
        assert!(matches!(&parsed.filters[0], SearchFilter::HasChildren));
    }

    #[test]
    fn test_has_color_filter() {
        let parsed = parse_query("has:color");
        assert_eq!(parsed.filters.len(), 1);
        assert!(matches!(&parsed.filters[0], SearchFilter::HasColor));
    }

    #[test]
    fn test_color_specific_filter() {
        let parsed = parse_query("color:red");
        assert_eq!(parsed.filters.len(), 1);
        assert!(matches!(&parsed.filters[0], SearchFilter::ColorIs(c) if c == "red"));
    }

    #[test]
    fn test_in_title_scope() {
        let parsed = parse_query("in:title hello");
        assert!(matches!(&parsed.search_scope, Some(SearchScope::Title)));
        assert_eq!(parsed.text_terms.len(), 1);
    }

    #[test]
    fn test_in_note_scope() {
        let parsed = parse_query("in:note hello");
        assert!(matches!(&parsed.search_scope, Some(SearchScope::Note)));
    }

    #[test]
    fn test_negated_is_completed() {
        let parsed = parse_query("-is:completed todo");
        assert_eq!(parsed.filters.len(), 1);
        assert!(matches!(&parsed.filters[0], SearchFilter::IsNotCompleted));
        assert_eq!(parsed.text_terms.len(), 1);
    }

    #[test]
    fn test_edited_today() {
        let parsed = parse_query("edited:today");
        assert_eq!(parsed.filters.len(), 1);
        match &parsed.filters[0] {
            SearchFilter::EditedInRange(range) => {
                assert!(range.from.is_some());
                assert!(range.to.is_some());
            }
            _ => panic!("Expected EditedInRange"),
        }
    }

    #[test]
    fn test_created_relative() {
        let parsed = parse_query("created:-7d");
        assert_eq!(parsed.filters.len(), 1);
        match &parsed.filters[0] {
            SearchFilter::CreatedInRange(range) => {
                assert!(range.from.is_some());
                assert!(range.to.is_none());
            }
            _ => panic!("Expected CreatedInRange"),
        }
    }

    #[test]
    fn test_date_range() {
        let parsed = parse_query("edited:2024-01-01..2024-12-31");
        assert_eq!(parsed.filters.len(), 1);
        match &parsed.filters[0] {
            SearchFilter::EditedInRange(range) => {
                assert_eq!(range.from.as_deref(), Some("2024-01-01T00:00:00Z"));
                assert_eq!(range.to.as_deref(), Some("2024-12-31T23:59:59Z"));
            }
            _ => panic!("Expected EditedInRange"),
        }
    }

    #[test]
    fn test_fts_query_generation() {
        let parsed = parse_query("hello world");
        assert_eq!(parsed.to_fts_query(), "\"hello\"* \"world\"*");
    }

    #[test]
    fn test_fts_query_with_or() {
        let parsed = parse_query("hello OR world");
        assert_eq!(parsed.to_fts_query(), "\"hello\"* OR \"world\"*");
    }

    #[test]
    fn test_fts_query_with_exclusion() {
        let parsed = parse_query("hello -world");
        assert_eq!(parsed.to_fts_query(), "\"hello\"* NOT \"world\"*");
    }

    #[test]
    fn test_fts_query_with_phrase() {
        let parsed = parse_query("\"hello world\"");
        assert_eq!(parsed.to_fts_query(), "\"hello world\"");
    }

    #[test]
    fn test_fts_query_with_scope() {
        let parsed = parse_query("in:note hello");
        assert_eq!(parsed.to_fts_query(), "note : \"hello\"*");
    }

    #[test]
    fn test_complex_query() {
        let parsed = parse_query("is:completed has:date \"meeting notes\" project -draft");
        assert_eq!(parsed.filters.len(), 2);
        assert!(matches!(&parsed.filters[0], SearchFilter::IsCompleted));
        assert!(matches!(&parsed.filters[1], SearchFilter::HasDate));
        assert_eq!(parsed.text_terms.len(), 3); // phrase + project + -draft
    }

    #[test]
    fn test_sql_filters() {
        let parsed = parse_query("is:completed color:red has:note");
        let (clauses, params) = parsed.to_sql_filters();
        assert_eq!(clauses.len(), 3);
        assert!(clauses[0].contains("is_checked"));
        assert!(clauses[1].contains("color"));
        assert!(clauses[2].contains("note"));
        assert_eq!(params.len(), 1); // only color:red has a param
        assert_eq!(params[0], "red");
    }
}
