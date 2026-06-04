use serde::{Serialize, Deserialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum CellType {
    Command,
    Output,
    Ai,
    Tool,
    System,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Cell {
    pub id: String,
    pub cell_type: CellType,
    pub input: Option<String>,
    pub output_blocks: Vec<String>,
    pub created_at: u64,
    pub is_active: bool,
}
