#[derive(Clone, Copy, serde::Serialize)]
pub struct Cell {
    pub ch: char,
    pub fg: Option<u32>,
    pub bg: Option<u32>,
    pub flags: u8,
}

impl Default for Cell {
    fn default() -> Self {
        Self {
            ch: ' ', // Standard empty cell character
            fg: None,
            bg: None,
            flags: 0,
        }
    }
}
