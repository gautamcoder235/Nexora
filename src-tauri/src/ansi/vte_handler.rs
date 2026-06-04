use vte::Perform;
use crate::terminal::state::TerminalState;
use crate::terminal::cell::Cell;

impl Perform for TerminalState {
    fn print(&mut self, c: char) {
        if self.cursor_x >= self.grid.width {
            self.cursor_y += 1;
            self.cursor_x = 0;
            if self.cursor_y >= self.grid.height {
                self.scroll();
            }
        }

        if let Some(row) = self.grid.rows.get_mut(self.cursor_y) {
            if let Some(cell) = row.get_mut(self.cursor_x) {
                *cell = Cell { ch: c, fg: Some(self.current_fg), bg: Some(self.current_bg), flags: cell.flags };
            }
        }

        self.cursor_x += 1;
    }

    fn execute(&mut self, byte: u8) {
        match byte {
            b'\n' => {
                self.cursor_y += 1;
                if self.cursor_y >= self.grid.height {
                    self.scroll();
                }
            }
            b'\r' => self.cursor_x = 0,
            b'\x08' => self.cursor_x = self.cursor_x.saturating_sub(1),
            b'\t' => {
                let tab_width = 8;
                self.cursor_x = (self.cursor_x / tab_width + 1) * tab_width;
                self.cursor_x = std::cmp::min(self.cursor_x, self.grid.width.saturating_sub(1));
            }
            _ => {}
        }
    }

    fn csi_dispatch(&mut self, params: &vte::Params, _intermediates: &[u8], _ignore: bool, action: char) {
        match action {
            // Cursor Up
            'A' => {
                let mut n = 1;
                for param in params {
                    if param[0] > 0 {
                        n = param[0] as usize;
                    }
                }
                self.cursor_y = self.cursor_y.saturating_sub(n);
            }
            // Cursor Down
            'B' => {
                let mut n = 1;
                for param in params {
                    if param[0] > 0 {
                        n = param[0] as usize;
                    }
                }
                self.cursor_y = std::cmp::min(self.cursor_y + n, self.grid.height.saturating_sub(1));
            }
            // Cursor Forward
            'C' => {
                let mut n = 1;
                for param in params {
                    if param[0] > 0 {
                        n = param[0] as usize;
                    }
                }
                self.cursor_x = std::cmp::min(self.cursor_x + n, self.grid.width.saturating_sub(1));
            }
            // Cursor Back
            'D' => {
                let mut n = 1;
                for param in params {
                    if param[0] > 0 {
                        n = param[0] as usize;
                    }
                }
                self.cursor_x = self.cursor_x.saturating_sub(n);
            }
            // Erase in Line
            'K' => {
                let mut mode = 0;
                for param in params {
                    mode = param[0];
                }
                if let Some(row) = self.grid.rows.get_mut(self.cursor_y) {
                    match mode {
                        0 => {
                            // Erase from cursor to end of line
                            for x in self.cursor_x..self.grid.width {
                                row[x] = Cell::default();
                            }
                        }
                        1 => {
                            // Erase from start of line to cursor
                            for x in 0..=self.cursor_x {
                                if x < row.len() {
                                    row[x] = Cell::default();
                                }
                            }
                        }
                        2 => {
                            // Erase entire line
                            for x in 0..self.grid.width {
                                row[x] = Cell::default();
                            }
                        }
                        _ => {}
                    }
                }
            }
            // Erase in Display
            'J' => {
                let mut mode = 0;
                for param in params {
                    mode = param[0];
                }
                match mode {
                    0 => {
                        if let Some(row) = self.grid.rows.get_mut(self.cursor_y) {
                            for x in self.cursor_x..self.grid.width {
                                row[x] = Cell::default();
                            }
                        }
                        for y in (self.cursor_y + 1)..self.grid.height {
                            if let Some(row) = self.grid.rows.get_mut(y) {
                                for x in 0..self.grid.width {
                                    row[x] = Cell::default();
                                }
                            }
                        }
                    }
                    2 => {
                        for y in 0..self.grid.height {
                            if let Some(row) = self.grid.rows.get_mut(y) {
                                for x in 0..self.grid.width {
                                    row[x] = Cell::default();
                                }
                            }
                        }
                        self.cursor_x = 0;
                        self.cursor_y = 0;
                    }
                    _ => {}
                }
            }
            // Cursor Position
            'H' | 'f' => {
                let mut y = 1;
                let mut x = 1;
                let mut iter = params.iter();
                if let Some(param) = iter.next() {
                    if param[0] > 0 { y = param[0] as usize; }
                }
                if let Some(param) = iter.next() {
                    if param[0] > 0 { x = param[0] as usize; }
                }
                self.cursor_y = std::cmp::min(y.saturating_sub(1), self.grid.height.saturating_sub(1));
                self.cursor_x = std::cmp::min(x.saturating_sub(1), self.grid.width.saturating_sub(1));
            }
            // SGR (Colors)
            'm' => {
                let mut flat_params = Vec::new();
                for param in params {
                    flat_params.extend_from_slice(param);
                }
                
                if flat_params.is_empty() {
                    self.current_fg = 0xFFFFFF;
                    self.current_bg = 0x000000;
                    return;
                }
                
                let mut i = 0;
                while i < flat_params.len() {
                    match flat_params[i] {
                        0 => { self.current_fg = 0xFFFFFF; self.current_bg = 0x000000; }
                        30 => self.current_fg = 0x000000,
                        31 => self.current_fg = 0xCC0000,
                        32 => self.current_fg = 0x4E9A06,
                        33 => self.current_fg = 0xC4A000,
                        34 => self.current_fg = 0x3465A4,
                        35 => self.current_fg = 0x75507B,
                        36 => self.current_fg = 0x06989A,
                        37 => self.current_fg = 0xD3D7CF,
                        39 => self.current_fg = 0xFFFFFF,
                        40 => self.current_bg = 0x000000,
                        41 => self.current_bg = 0xCC0000,
                        42 => self.current_bg = 0x4E9A06,
                        43 => self.current_bg = 0xC4A000,
                        44 => self.current_bg = 0x3465A4,
                        45 => self.current_bg = 0x75507B,
                        46 => self.current_bg = 0x06989A,
                        47 => self.current_bg = 0xD3D7CF,
                        49 => self.current_bg = 0x000000,
                        38 => {
                            if i + 4 < flat_params.len() && flat_params[i+1] == 2 {
                                let r = flat_params[i+2] as u32;
                                let g = flat_params[i+3] as u32;
                                let b = flat_params[i+4] as u32;
                                self.current_fg = (r << 16) | (g << 8) | b;
                                i += 4;
                            } else if i + 2 < flat_params.len() && flat_params[i+1] == 5 { i += 2; }
                        }
                        48 => {
                            if i + 4 < flat_params.len() && flat_params[i+1] == 2 {
                                let r = flat_params[i+2] as u32;
                                let g = flat_params[i+3] as u32;
                                let b = flat_params[i+4] as u32;
                                self.current_bg = (r << 16) | (g << 8) | b;
                                i += 4;
                            } else if i + 2 < flat_params.len() && flat_params[i+1] == 5 { i += 2; }
                        }
                        90 => self.current_fg = 0x555753,
                        91 => self.current_fg = 0xEF2929,
                        92 => self.current_fg = 0x8AE234,
                        93 => self.current_fg = 0xFCE94F,
                        94 => self.current_fg = 0x729FCF,
                        95 => self.current_fg = 0xAD7FA8,
                        96 => self.current_fg = 0x34E2E2,
                        97 => self.current_fg = 0xEEEEEC,
                        _ => {}
                    }
                    i += 1;
                }
            }
            // Insert Character (ICH)
            '@' => {
                let mut n = 1;
                for param in params { if param[0] > 0 { n = param[0] as usize; } }
                if let Some(row) = self.grid.rows.get_mut(self.cursor_y) {
                    for _ in 0..n {
                        row.insert(self.cursor_x, Cell::default());
                        row.pop();
                    }
                }
            }
            // Delete Character (DCH)
            'P' => {
                let mut n = 1;
                for param in params { if param[0] > 0 { n = param[0] as usize; } }
                if let Some(row) = self.grid.rows.get_mut(self.cursor_y) {
                    for _ in 0..n {
                        if self.cursor_x < row.len() {
                            row.remove(self.cursor_x);
                            row.push(Cell::default());
                        }
                    }
                }
            }
            // Erase Character (ECH)
            'X' => {
                let mut n = 1;
                for param in params { if param[0] > 0 { n = param[0] as usize; } }
                if let Some(row) = self.grid.rows.get_mut(self.cursor_y) {
                    let end = std::cmp::min(self.cursor_x + n, self.grid.width);
                    for x in self.cursor_x..end {
                        row[x] = Cell::default();
                    }
                }
            }
            // Insert Line (IL)
            'L' => {
                let mut n = 1;
                for param in params { if param[0] > 0 { n = param[0] as usize; } }
                for _ in 0..n {
                    self.grid.rows.insert(self.cursor_y, vec![Cell::default(); self.grid.width]);
                    self.grid.rows.pop();
                }
            }
            // Delete Line (DL)
            'M' => {
                let mut n = 1;
                for param in params { if param[0] > 0 { n = param[0] as usize; } }
                for _ in 0..n {
                    if self.cursor_y < self.grid.rows.len() {
                        self.grid.rows.remove(self.cursor_y);
                        self.grid.rows.push(vec![Cell::default(); self.grid.width]);
                    }
                }
            }
            _ => {}
        }
    }
}
