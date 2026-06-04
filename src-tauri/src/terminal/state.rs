use super::{grid::Grid, scrollback::Scrollback, cell::Cell};

pub struct TerminalState {
    pub grid: Grid,
    pub scrollback: Scrollback,
    pub cursor_x: usize,
    pub cursor_y: usize,
    pub current_fg: u32,
    pub current_bg: u32,
    pub scrolled_lines_tick: usize,
}

impl TerminalState {
    pub fn new(width: usize, height: usize, scrollback_max: usize) -> Self {
        Self {
            grid: Grid::new(width, height),
            scrollback: Scrollback::new(scrollback_max),
            cursor_x: 0,
            cursor_y: 0,
            current_fg: 0xFFFFFF, // default fg white
            current_bg: 0x000000, // default bg transparent/black
            scrolled_lines_tick: 0,
        }
    }

    pub fn scroll(&mut self) {
        if self.grid.rows.is_empty() {
            return;
        }
        let top = self.grid.rows.remove(0);
        self.scrollback.push(top);
        self.scrolled_lines_tick += 1;

        self.grid.rows.push(vec![Cell::default(); self.grid.width]);

        if self.cursor_y > 0 {
            self.cursor_y -= 1;
        }
    }

    pub fn resize(&mut self, new_width: usize, new_height: usize) {
        if new_width == self.grid.width && new_height == self.grid.height {
            return;
        }
        
        // Push any rows that are chopped off by shrinking into the scrollback
        let truncated = self.grid.resize(new_width, new_height);
        for row in truncated {
            self.scrollback.push(row);
        }
        
        // Ensure cursor is within new bounds
        if self.cursor_x >= new_width {
            self.cursor_x = new_width.saturating_sub(1);
        }
        if self.cursor_y >= new_height {
            self.cursor_y = new_height.saturating_sub(1);
        }
    }
}
