use std::path::PathBuf;

pub struct WorkspaceGuard {
    root: PathBuf,
}

impl WorkspaceGuard {
    pub fn new(root: PathBuf) -> Self {
        Self { root }
    }

    pub fn is_path_safe(&self, path: &std::path::Path) -> bool {
        // Simple prefix check for sandbox boundaries
        let canonical_root = self.root.canonicalize().unwrap_or_else(|_| self.root.clone());
        let canonical_path = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
        
        canonical_path.starts_with(canonical_root)
    }
}

pub struct FilesystemPolicy;
impl FilesystemPolicy {
    pub fn requires_approval(operation: &str) -> bool {
        match operation {
            "read" | "list" => false,
            "write" | "delete" | "mkdir" => true,
            _ => true,
        }
    }
}

pub struct ShellPolicy;
impl ShellPolicy {
    pub fn requires_approval(_cmd: &str) -> bool {
        // All shell commands require approval
        true
    }
}
