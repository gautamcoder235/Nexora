pub fn discover(stdout_line: &str) -> Option<String> {
    let line_lower = stdout_line.to_lowercase();
    if line_lower.contains("conversation id:") || line_lower.contains("session id:") {
        let parts: Vec<&str> = stdout_line.split(':').collect();
        if parts.len() > 1 {
            let id = parts[1].trim().replace("\"", "").replace("'", "");
            if id.len() > 5 {
                return Some(id);
            }
        }
    }
    None
}
