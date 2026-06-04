use crate::types::ByteOffset;

#[derive(Debug, Clone, serde::Serialize)]
pub struct Chunk {
    pub id: u64,
    pub start_offset: ByteOffset,
    pub data: String,
    pub byte_count: usize,
}

impl Chunk {
    pub fn new(id: u64, start_offset: ByteOffset, data: String) -> Self {
        let byte_count = data.len();
        Self {
            id,
            start_offset,
            data,
            byte_count,
        }
    }

    pub fn end_offset(&self) -> ByteOffset {
        self.start_offset + self.byte_count as u64
    }
}
