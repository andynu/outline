/// Controls whether output is human-readable or JSON
pub struct OutputMode {
    json: bool,
}

impl OutputMode {
    pub fn new(json: bool) -> Self {
        Self { json }
    }

    pub fn is_json(&self) -> bool {
        self.json
    }

    /// Print a JSON value to stdout
    pub fn print_json(&self, value: &serde_json::Value) {
        println!("{}", serde_json::to_string_pretty(value).unwrap_or_else(|_| "null".to_string()));
    }

    /// Print an error to stderr (and as JSON if in JSON mode)
    pub fn error(&self, msg: &str) {
        if self.json {
            let err = serde_json::json!({ "error": msg });
            eprintln!("{}", serde_json::to_string(&err).unwrap_or_else(|_| format!("{{\"error\":\"{}\"}}", msg)));
        } else {
            eprintln!("Error: {}", msg);
        }
    }
}
