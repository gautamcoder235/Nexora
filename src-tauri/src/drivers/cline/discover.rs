/// Discover a Cline session ID from stdout.
/// Cline session IDs use the format `timestamp_randomstring` (e.g. `1781725269172_jmuoc`).
/// We also scan for a "Session:" or "session id:" label followed by the ID.
pub fn discover(stdout_line: &str) -> Option<String> {
    let line = stdout_line.trim();

    // Pattern 1: Explicit label like "Session: 1781725269172_jmuoc"
    let lower = line.to_lowercase();
    for prefix in &["session:", "session id:", "resuming session"] {
        if let Some(pos) = lower.find(prefix) {
            let after = &line[pos + prefix.len()..].trim();
            if let Some(id) = extract_cline_id(after) {
                return Some(id);
            }
        }
    }

    // Pattern 2: Scan the line for a standalone `digits_alphanum` pattern
    // Cline IDs are like `1781725269172_jmuoc` (13-digit timestamp + underscore + 5-char random)
    extract_cline_id(line)
}

/// Try to extract a Cline session ID (digits_alphanum) from a string.
fn extract_cline_id(s: &str) -> Option<String> {
    let chars: Vec<char> = s.chars().collect();
    let len = chars.len();
    let mut i = 0;

    while i < len {
        // Find start of digit sequence (at least 10 digits for a timestamp)
        if chars[i].is_ascii_digit() {
            let start = i;
            while i < len && chars[i].is_ascii_digit() {
                i += 1;
            }
            let digit_count = i - start;

            // Check for underscore followed by alphanumeric (at least 3 chars)
            if digit_count >= 10 && i < len && chars[i] == '_' {
                let underscore_pos = i;
                i += 1; // skip underscore
                let alpha_start = i;
                while i < len && chars[i].is_ascii_alphanumeric() {
                    i += 1;
                }
                let alpha_count = i - alpha_start;

                if alpha_count >= 3 {
                    let id: String = chars[start..i].iter().collect();
                    return Some(id);
                }
                // Reset to after underscore if no match
                i = underscore_pos + 1;
            }
        } else {
            i += 1;
        }
    }
    None
}
