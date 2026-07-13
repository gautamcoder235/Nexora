use std::fs;
use std::path::Path;

#[derive(Clone, Debug)]
pub struct FileMeta {
    pub path: String,
    pub size: u64,
    pub mtime: u64, // Unix timestamp in seconds
    pub is_dir: bool,
}

pub trait FileProvider: Send + Sync {
    fn list_dir(&self, path: &str) -> Result<Vec<FileMeta>, String>;
    fn read_file(&self, path: &str) -> Result<Vec<u8>, String>;
    fn stat_file(&self, path: &str) -> Result<FileMeta, String>;
}

pub struct LocalProvider;

impl FileProvider for LocalProvider {
    fn list_dir(&self, path: &str) -> Result<Vec<FileMeta>, String> {
        let mut results = Vec::new();
        let read_path = Path::new(path);
        if !read_path.exists() {
            return Err(format!("Path does not exist: {}", path));
        }

        let entries = fs::read_dir(read_path).map_err(|e| e.to_string())?;
        for entry in entries {
            if let Ok(entry) = entry {
                if let Ok(metadata) = entry.metadata() {
                    let path_str = entry.path().to_string_lossy().to_string();
                    let mtime = metadata
                        .modified()
                        .map(|t| t.duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs())
                        .unwrap_or(0);
                    results.push(FileMeta {
                        path: path_str,
                        size: metadata.len(),
                        mtime,
                        is_dir: metadata.is_dir(),
                    });
                }
            }
        }
        Ok(results)
    }

    fn read_file(&self, path: &str) -> Result<Vec<u8>, String> {
        fs::read(path).map_err(|e| e.to_string())
    }

    fn stat_file(&self, path: &str) -> Result<FileMeta, String> {
        let metadata = fs::metadata(path).map_err(|e| e.to_string())?;
        let mtime = metadata
            .modified()
            .map(|t| t.duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs())
            .unwrap_or(0);
        Ok(FileMeta {
            path: path.to_string(),
            size: metadata.len(),
            mtime,
            is_dir: metadata.is_dir(),
        })
    }
}

pub struct GitProvider {
    local: LocalProvider,
}

impl GitProvider {
    pub fn new() -> Self {
        Self {
            local: LocalProvider,
        }
    }
}

impl FileProvider for GitProvider {
    fn list_dir(&self, path: &str) -> Result<Vec<FileMeta>, String> {
        self.local.list_dir(path)
    }

    fn read_file(&self, path: &str) -> Result<Vec<u8>, String> {
        self.local.read_file(path)
    }

    fn stat_file(&self, path: &str) -> Result<FileMeta, String> {
        self.local.stat_file(path)
    }
}

pub struct RemoteProvider {
    provider_type: String,
}

impl RemoteProvider {
    pub fn new(provider_type: &str) -> Self {
        Self {
            provider_type: provider_type.to_string(),
        }
    }
}

impl FileProvider for RemoteProvider {
    fn list_dir(&self, path: &str) -> Result<Vec<FileMeta>, String> {
        let mut results = Vec::new();
        results.push(FileMeta {
            path: format!("{}/remote_config.json", path),
            size: 1024,
            mtime: 1719876543,
            is_dir: false,
        });
        results.push(FileMeta {
            path: format!("{}/remote_src", path),
            size: 0,
            mtime: 1719876543,
            is_dir: true,
        });
        Ok(results)
    }

    fn read_file(&self, path: &str) -> Result<Vec<u8>, String> {
        Ok(format!("// Mock {} File Content for {}\n{{}}", self.provider_type, path).into_bytes())
    }

    fn stat_file(&self, path: &str) -> Result<FileMeta, String> {
        Ok(FileMeta {
            path: path.to_string(),
            size: 512,
            mtime: 1719876543,
            is_dir: false,
        })
    }
}
