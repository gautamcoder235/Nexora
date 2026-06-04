use crate::terminal::grid::Grid;
use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CellDiff {
    pub x: usize,
    pub y: usize,
    pub ch: char,
    pub fg: Option<u32>,
    pub bg: Option<u32>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct DiffPayload {
    #[serde(rename = "sessionId")]
    pub session_id: String,
    pub diffs: Vec<CellDiff>,
    pub cursor_x: usize,
    pub cursor_y: usize,
    pub scrolled_lines: usize,
}

pub fn build_diff(old: &Grid, new: &Grid, cursor_x: usize, cursor_y: usize) -> DiffPayload {
    let mut out = vec![];

    let min_height = std::cmp::min(old.height, new.height);
    let min_width = std::cmp::min(old.width, new.width);

    for y in 0..min_height {
        for x in 0..min_width {
            let a = old.rows[y][x];
            let b = new.rows[y][x];

            if a.ch != b.ch || a.fg != b.fg || a.bg != b.bg {
                out.push(CellDiff {
                    x,
                    y,
                    ch: b.ch,
                    fg: b.fg,
                    bg: b.bg,
                });
            }
        }
    }

    DiffPayload {
        session_id: String::new(), // will be overwritten by caller
        diffs: out,
        cursor_x,
        cursor_y,
        scrolled_lines: 0, // will be overwritten by caller
    }
}
