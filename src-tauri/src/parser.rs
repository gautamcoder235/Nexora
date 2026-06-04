pub struct AnsiParser {
    byte_buffer: Vec<u8>,
}

impl AnsiParser {
    pub fn new() -> Self {
        Self {
            byte_buffer: Vec::new(),
        }
    }

    /// Appends raw PTY output bytes, parses completed UTF-8 characters and ANSI sequences,
    /// and returns a valid UTF-8 String. Retains trailing incomplete sequences.
    pub fn parse(&mut self, new_bytes: &[u8]) -> String {
        self.byte_buffer.extend_from_slice(new_bytes);

        // 1. Resolve UTF-8 boundaries
        let valid_utf8_len = match std::str::from_utf8(&self.byte_buffer) {
            Ok(_) => self.byte_buffer.len(),
            Err(e) => e.valid_up_to(),
        };

        if valid_utf8_len == 0 {
            return String::new();
        }

        // Extract valid UTF-8 string bytes
        let valid_utf8_bytes = self.byte_buffer[..valid_utf8_len].to_vec();
        
        // Save the invalid UTF-8 tail for next iteration
        let invalid_tail = self.byte_buffer[valid_utf8_len..].to_vec();
        self.byte_buffer = invalid_tail;

        // 2. Scan valid UTF-8 string for partial ANSI escape sequences at the end
        let valid_str = match std::str::from_utf8(&valid_utf8_bytes) {
            Ok(s) => s,
            Err(_) => return String::new(),
        };

        // Find the last ESC (0x1B) character
        if let Some(esc_idx) = valid_str.rfind('\x1b') {
            let escape_slice = &valid_str[esc_idx..];
            if is_incomplete_escape_sequence(escape_slice) {
                let prefix = &valid_str[..esc_idx];
                
                // Prepend the incomplete escape sequence bytes back into self.byte_buffer
                let incomplete_bytes = escape_slice.as_bytes();
                let mut new_byte_buffer = incomplete_bytes.to_vec();
                new_byte_buffer.extend_from_slice(&self.byte_buffer);
                self.byte_buffer = new_byte_buffer;

                return prefix.to_string();
            }
        }

        valid_str.to_string()
    }
}

/// Checks if an escape sequence slice starting at ESC is incomplete
fn is_incomplete_escape_sequence(s: &str) -> bool {
    let bytes = s.as_bytes();
    if bytes.is_empty() || bytes[0] != 0x1b {
        return false;
    }

    if bytes.len() == 1 {
        return true;
    }

    let second_byte = bytes[1];
    match second_byte {
        // CSI (Control Sequence Introducer): ESC [
        0x5b => {
            for &b in &bytes[2..] {
                if b >= 0x40 && b <= 0x7e {
                    return false; // Found terminator, complete
                }
            }
            true // Incomplete
        }
        // OSC (Operating System Command): ESC ]
        0x5d => {
            for i in 2..bytes.len() {
                if bytes[i] == 0x07 {
                    return false; // Found BEL, complete
                }
                if bytes[i] == 0x5c && bytes[i - 1] == 0x1b {
                    return false; // Found ESC \, complete
                }
            }
            true // Incomplete
        }
        // Fe Escape Sequence (ESC 0x40-0x5F)
        b if b >= 0x40 && b <= 0x5f => {
            false // 2-byte escape sequence complete
        }
        _ => {
            false
        }
    }
}
