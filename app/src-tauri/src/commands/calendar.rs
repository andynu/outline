use tauri::State;

use super::{AppState};
use super::document::strip_html_for_title;

/// Generate iCalendar feed for all dated items in a document
#[tauri::command]
pub fn generate_ical_feed(state: State<AppState>) -> Result<String, String> {
    let current = state.current_document.lock().unwrap();
    let doc = current.as_ref().ok_or("No document loaded")?;

    // Build iCalendar content
    let mut ical = String::new();
    ical.push_str("BEGIN:VCALENDAR\r\n");
    ical.push_str("VERSION:2.0\r\n");
    ical.push_str("PRODID:-//Outline//NONSGML v1.0//EN\r\n");
    ical.push_str("CALSCALE:GREGORIAN\r\n");
    ical.push_str("METHOD:PUBLISH\r\n");
    ical.push_str("X-WR-CALNAME:Outline Tasks\r\n");

    for node in &doc.state.nodes {
        if let Some(ref date) = node.date {
            // Create VEVENT for each dated item
            ical.push_str("BEGIN:VEVENT\r\n");

            // UID - unique identifier
            ical.push_str(&format!("UID:{}@outline.local\r\n", node.id));

            // DTSTAMP - creation timestamp
            ical.push_str(&format!(
                "DTSTAMP:{}\r\n",
                node.created_at.format("%Y%m%dT%H%M%SZ")
            ));

            // DTSTART - all-day event format
            let date_compact = date.replace("-", "");
            ical.push_str(&format!("DTSTART;VALUE=DATE:{}\r\n", date_compact));

            // DTEND - end date for date ranges (exclusive, so add 1 day per iCal spec)
            if let Some(ref date_end) = node.date_end {
                // Parse end date and add 1 day (iCal DTEND for all-day events is exclusive)
                if let Ok(end_date) = chrono::NaiveDate::parse_from_str(date_end, "%Y-%m-%d") {
                    let end_exclusive = end_date + chrono::Duration::days(1);
                    ical.push_str(&format!("DTEND;VALUE=DATE:{}\r\n", end_exclusive.format("%Y%m%d")));
                }
            }

            // SUMMARY - strip HTML from content
            let summary = strip_html_for_title(&node.content);
            let escaped_summary = escape_ical_text(&summary);
            ical.push_str(&format!("SUMMARY:{}\r\n", escaped_summary));

            // STATUS - based on is_checked
            if node.is_checked {
                ical.push_str("STATUS:COMPLETED\r\n");
            } else {
                ical.push_str("STATUS:CONFIRMED\r\n");
            }

            // RRULE - if recurring
            if let Some(ref rrule) = node.date_recurrence {
                ical.push_str(&format!("RRULE:{}\r\n", rrule));
            }

            // DESCRIPTION - note field if present
            if let Some(ref note) = node.note {
                let escaped_note = escape_ical_text(note);
                ical.push_str(&format!("DESCRIPTION:{}\r\n", escaped_note));
            }

            ical.push_str("END:VEVENT\r\n");
        }
    }

    ical.push_str("END:VCALENDAR\r\n");

    Ok(ical)
}

/// Escape text for iCalendar format
fn escape_ical_text(text: &str) -> String {
    text.replace('\\', "\\\\")
        .replace('\n', "\\n")
        .replace(',', "\\,")
        .replace(';', "\\;")
}

/// Calculate the next occurrence date given an RRULE and start date
#[tauri::command]
pub fn get_next_occurrence(
    rrule_str: String,
    after_date: String,
) -> Result<Option<String>, String> {
    use chrono::NaiveDate;
    use rrule::RRuleSet;

    // Parse the after_date (ISO format: YYYY-MM-DD)
    let after = NaiveDate::parse_from_str(&after_date, "%Y-%m-%d")
        .map_err(|e| format!("Invalid date format: {}", e))?;

    // Format date for DTSTART (next day after the completion date)
    let next_day = after + chrono::Duration::days(1);
    let dtstart = format!(
        "{}{}{}T000000Z",
        next_day.format("%Y"),
        next_day.format("%m"),
        next_day.format("%d")
    );

    // Build the full RRULE string with DTSTART
    // rrule_str format: FREQ=DAILY;INTERVAL=1 or FREQ=WEEKLY;BYDAY=MO,WE,FR etc.
    let full_rrule = format!("DTSTART:{}\nRRULE:{}", dtstart, rrule_str);

    // Parse the RRuleSet
    let rrule_set: RRuleSet = full_rrule.parse()
        .map_err(|e| format!("Invalid RRULE: {}", e))?;

    // Get the first occurrence
    let result = rrule_set.all(1);

    if let Some(dt) = result.dates.first() {
        // Format as ISO date
        let date_str = dt.format("%Y-%m-%d").to_string();
        Ok(Some(date_str))
    } else {
        Ok(None)
    }
}
