use super::cell::Cell;

pub struct Scrollback {
    pub lines: Vec<Vec<Cell>>,
    pub max: usize,
}

impl Scrollback {
    pub fn new(max: usize) -> Self {
        Self {
            lines: Vec::new(),
            max,
        }
    }

    pub fn push(&mut self, line: Vec<Cell>) {
        self.lines.push(line);

        if self.lines.len() > self.max {
            self.lines.remove(0);
        }
    }
}
