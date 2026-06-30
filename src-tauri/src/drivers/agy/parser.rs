pub fn parse_output(clean_text: &str) -> Vec<String> {
    let mut logs = Vec::new();
    for line in clean_text.lines() {
        let trimmed = line.trim();
        if trimmed.contains("Saved file:") || trimmed.contains("Saved change to") {
            let file = trimmed.split("Saved file:").last().unwrap_or("").split("Saved change to").last().unwrap_or("").trim();
            if !file.is_empty() {
                logs.push(format!("Antigravity: Saved file changes: {}", file));
            }
        } else if trimmed.contains("Invoking subagent:") || trimmed.contains("Spawning subagent") {
            let agent = trimmed.split("Invoking subagent:").last().unwrap_or("").split("Spawning subagent").last().unwrap_or("").trim();
            if !agent.is_empty() {
                logs.push(format!("Antigravity: Spawned subagent: {}", agent));
            }
        }
    }
    logs
}
