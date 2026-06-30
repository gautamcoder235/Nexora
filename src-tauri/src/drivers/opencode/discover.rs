pub fn discover(stdout_line: &str) -> Option<String> {
    if let Some(idx) = stdout_line.find("ses_") {
        let rest = &stdout_line[idx..];
        let id_part: String = rest.chars().take_while(|c| c.is_alphanumeric() || *c == '_').collect();
        if id_part.len() > 10 {
            return Some(id_part);
        }
    }
    None
}
