pub fn parse_output(clean_text: &str) -> Vec<String> {
    let mut logs = Vec::new();
    for line in clean_text.lines() {
        let trimmed = line.trim();
        if trimmed.contains("Saved change to") {
            if let Some(m) = trimmed.split("Saved change to").last() {
                logs.push(format!("Claude: Saved file changes: {}", m.trim()));
            }
        } else if trimmed.contains("Running:") {
            if let Some(m) = trimmed.split("Running:").last() {
                logs.push(format!("Claude: Executing command: {}", m.trim()));
            }
        }
    }
    logs
}
