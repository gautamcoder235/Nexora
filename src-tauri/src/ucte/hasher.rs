use std::fs::File;
use std::io::{Read, BufReader};
use std::path::Path;

#[derive(Clone, Debug)]
pub struct ChunkHash {
    pub index: u32,
    pub hash: String,
    pub offset: u64,
    pub length: u32,
}

#[derive(Clone, Debug)]
pub struct FileHashResult {
    pub file_hash: String,
    pub chunks: Vec<ChunkHash>,
}

pub const CHUNK_SIZE: usize = 64 * 1024; // 64 KB

pub fn hash_file<P: AsRef<Path>>(path: P) -> Result<FileHashResult, String> {
    let file = File::open(path).map_err(|e| e.to_string())?;
    let mut reader = BufReader::new(file);
    let mut buffer = [0u8; CHUNK_SIZE];
    
    let mut overall_hasher = blake3::Hasher::new();
    let mut chunks = Vec::new();
    let mut offset = 0u64;
    let mut index = 0u32;
    
    loop {
        let bytes_read = reader.read(&mut buffer).map_err(|e| e.to_string())?;
        if bytes_read == 0 {
            break;
        }
        
        let chunk_data = &buffer[..bytes_read];
        let chunk_hash = blake3::hash(chunk_data).to_hex().to_string();
        
        overall_hasher.update(chunk_data);
        
        chunks.push(ChunkHash {
            index,
            hash: chunk_hash,
            offset,
            length: bytes_read as u32,
        });
        
        offset += bytes_read as u64;
        index += 1;
    }
    
    let file_hash = overall_hasher.finalize().to_hex().to_string();
    
    Ok(FileHashResult {
        file_hash,
        chunks,
    })
}
