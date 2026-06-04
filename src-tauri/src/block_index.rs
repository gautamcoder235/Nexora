use std::collections::HashMap;
use crate::block::{Block, BlockType};
use crate::types::ByteOffset;

pub struct BlockIndex {
    blocks: Vec<Block>,
    block_map: HashMap<String, usize>,
    current_block_id: Option<String>,
}

impl BlockIndex {
    pub fn new() -> Self {
        Self {
            blocks: Vec::new(),
            block_map: HashMap::new(),
            current_block_id: None,
        }
    }

    pub fn start_block(&mut self, id: String, block_type: BlockType, offset: ByteOffset) {
        let block = Block::new(id.clone(), block_type, offset);
        self.blocks.push(block);
        self.block_map.insert(id.clone(), self.blocks.len() - 1);
        self.current_block_id = Some(id);
    }

    pub fn update_current_block_end(&mut self, new_end_offset: ByteOffset) {
        if let Some(id) = &self.current_block_id {
            if let Some(&idx) = self.block_map.get(id) {
                if let Some(block) = self.blocks.get_mut(idx) {
                    block.end_offset = new_end_offset;
                }
            }
        }
    }
    
    pub fn get_all_blocks(&self) -> Vec<Block> {
        self.blocks.clone()
    }

    pub fn get_last_block_id(&self) -> Option<String> {
        self.current_block_id.clone()
    }
}
