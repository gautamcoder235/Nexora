use crate::chunk_store::ChunkStore;

pub struct EvictionPolicy {
    max_bytes: usize,
}

impl EvictionPolicy {
    pub fn new(max_bytes: usize) -> Self {
        Self { max_bytes }
    }

    pub fn apply(&self, store: &mut ChunkStore) {
        while store.total_bytes_in_memory() > self.max_bytes {
            if store.evict_oldest().is_none() {
                break;
            }
        }
    }
}
