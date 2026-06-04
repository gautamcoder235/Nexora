use crate::chunk_store::ChunkStore;
use crate::block_index::BlockIndex;
use crate::eviction::EvictionPolicy;
use crate::block::BlockType;

pub struct WorkspaceDocument {
    store: ChunkStore,
    index: BlockIndex,
    eviction: EvictionPolicy,
}

impl WorkspaceDocument {
    pub fn new(max_bytes: usize) -> Self {
        Self {
            store: ChunkStore::new(),
            index: BlockIndex::new(),
            eviction: EvictionPolicy::new(max_bytes),
        }
    }

    pub fn append_text(&mut self, text: String, block_id: String) {
        let is_new_block = self.index.get_last_block_id().map_or(true, |id| id != block_id);
        
        if is_new_block {
            let offset = self.store.get_current_offset();
            self.index.start_block(block_id, BlockType::Output, offset);
        }

        self.store.append(text);
        
        let new_offset = self.store.get_current_offset();
        self.index.update_current_block_end(new_offset);
        
        self.eviction.apply(&mut self.store);
    }

    pub fn get_chunks(&self) -> Vec<crate::chunk::Chunk> {
        self.store.get_all_chunks()
    }
    
    #[allow(dead_code)]
    pub fn get_blocks(&self) -> Vec<crate::block::Block> {
        self.index.get_all_blocks()
    }
    
    pub fn get_total_bytes_in_memory(&self) -> usize {
        self.store.total_bytes_in_memory()
    }
}
