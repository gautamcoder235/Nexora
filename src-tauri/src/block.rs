use crate::types::ByteOffset;

#[allow(dead_code)]
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub enum BlockType {
    Input,
    Output,
    System,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct Block {
    pub id: String,
    pub block_type: BlockType,
    pub start_offset: ByteOffset,
    pub end_offset: ByteOffset,
}

impl Block {
    pub fn new(id: String, block_type: BlockType, start_offset: ByteOffset) -> Self {
        Self {
            id,
            block_type,
            start_offset,
            end_offset: start_offset,
        }
    }
}
