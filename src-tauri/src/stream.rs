use serde::{Serialize, Deserialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum StreamOp {
    CreateCell,
    Append,
    CloseCell,
    PatchBlock,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct StreamEvent {
    pub op: StreamOp,
    pub session_id: String,
    pub cell_id: String,
    pub block_id: Option<String>,
    pub data: Option<String>,
}
