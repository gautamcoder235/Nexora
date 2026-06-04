use std::collections::VecDeque;
use crate::chunk::Chunk;
use crate::types::ByteOffset;

pub struct ChunkStore {
    chunks: VecDeque<Chunk>,
    next_chunk_id: u64,
    current_offset: ByteOffset,
    total_memory_bytes: usize,
}

impl ChunkStore {
    pub fn new() -> Self {
        Self {
            chunks: VecDeque::new(),
            next_chunk_id: 1,
            current_offset: 0,
            total_memory_bytes: 0,
        }
    }

    pub fn append(&mut self, text: String) {
        if text.is_empty() {
            return;
        }

        let chunk = Chunk::new(self.next_chunk_id, self.current_offset, text);
        self.current_offset = chunk.end_offset();
        self.next_chunk_id += 1;
        self.total_memory_bytes += chunk.byte_count;
        
        self.chunks.push_back(chunk);
    }

    pub fn evict_oldest(&mut self) -> Option<Chunk> {
        if let Some(chunk) = self.chunks.pop_front() {
            self.total_memory_bytes = self.total_memory_bytes.saturating_sub(chunk.byte_count);
            Some(chunk)
        } else {
            None
        }
    }

    pub fn total_bytes_in_memory(&self) -> usize {
        self.total_memory_bytes
    }

    pub fn get_all_chunks(&self) -> Vec<Chunk> {
        self.chunks.iter().cloned().collect()
    }
    
    pub fn get_current_offset(&self) -> ByteOffset {
        self.current_offset
    }
}
