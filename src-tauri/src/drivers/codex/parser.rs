pub fn parse_output(clean_text: &str) -> Vec<String> {
    let mut logs = Vec::new();
    for line in clean_text.lines() {
        let trimmed = line.trim();
        if trimmed.contains("Ran tests:") {
            if let Some(m) = trimmed.split("Ran tests:").last() {
                logs.push(format!("Codex: Executed tests: {}", m.trim()));
            }
        } else if trimmed.contains("Test failed:") {
            if let Some(m) = trimmed.split("Test failed:").last() {
                logs.push(format!("Codex: Assertion Error: {}", m.trim()));
            }
        } else if trimmed.contains("Test passed") || trimmed.contains("All tests passed") {
            logs.push("Codex: All unit tests passed successfully.".to_string());
        }
    }
    logs
}
