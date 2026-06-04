use super::cell::Cell;

#[derive(Clone)]
pub struct Grid {
    pub width: usize,
    pub height: usize,
    pub rows: Vec<Vec<Cell>>,
}

impl Grid {
    pub fn new(width: usize, height: usize) -> Self {
        Self {
            width,
            height,
            rows: vec![vec![Cell::default(); width]; height],
        }
    }

    pub fn resize(&mut self, new_width: usize, new_height: usize) -> Vec<Vec<Cell>> {
        let mut truncated_rows = Vec::new();
        
        // If shrinking height, preserve the lost rows
        if new_height < self.height {
            let mut remaining = self.rows.split_off(new_height);
            truncated_rows.append(&mut remaining);
        } else if new_height > self.height {
            self.rows.resize(new_height, vec![Cell::default(); self.width]);
        }

        // Resize cols (width)
        for row in &mut self.rows {
            row.resize(new_width, Cell::default());
        }
        self.width = new_width;
        self.height = new_height;
        
        truncated_rows
    }
}
