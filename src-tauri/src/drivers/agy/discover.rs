pub fn discover(stdout_line: &str) -> Option<String> {
    // AGY uses UUID-format conversation IDs (e.g., 3b4a1d20-3968-4ed2-90b3-00eea3060b02).
    // The CLI may print "Conversation ID: <uuid>" or embed the UUID in status output.
    // We scan for any valid UUID pattern in the line.
    let chars: Vec<char> = stdout_line.chars().collect();
    if chars.len() < 36 {
        return None;
    }
    for i in 0..=(chars.len() - 36) {
        let sub = &chars[i..i + 36];
        let mut is_uuid = true;
        for (idx, &c) in sub.iter().enumerate() {
            if idx == 8 || idx == 13 || idx == 18 || idx == 23 {
                if c != '-' {
                    is_uuid = false;
                    break;
                }
            } else if !c.is_ascii_hexdigit() {
                is_uuid = false;
                break;
            }
        }
        if is_uuid {
            let uuid_str: String = sub.iter().collect();
            return Some(uuid_str);
        }
    }
    None
}
