use std::path::PathBuf;

#[allow(dead_code)]
pub struct GitProvider {
    workspace_path: PathBuf,
}

impl GitProvider {
    pub fn new(path: PathBuf) -> Self {
        GitProvider { workspace_path: path }
    }

    pub fn get_current_branch(&self) -> String {
        // Fallback to "main" or call internal Git commands
        "main".to_string()
    }

    pub fn get_changed_files(&self) -> Vec<String> {
        Vec::new()
    }
}

pub struct DiagnosticsProvider;

impl DiagnosticsProvider {
    pub fn get_active_errors(&self) -> Vec<String> {
        Vec::new()
    }
}

pub struct TerminalProvider;

impl TerminalProvider {
    pub fn get_active_pty_count(&self) -> usize {
        crate::get_active_pty_count()
    }
}

#[allow(dead_code)]
pub struct FilesystemProvider {
    workspace_path: PathBuf,
}

impl FilesystemProvider {
    pub fn new(path: PathBuf) -> Self {
        FilesystemProvider { workspace_path: path }
    }

    pub fn list_open_files(&self) -> Vec<String> {
        Vec::new()
    }
}

pub struct WorkspaceContext {
    pub workspace_path: PathBuf,
    pub git: GitProvider,
    pub diagnostics: DiagnosticsProvider,
    pub terminal: TerminalProvider,
    pub fs: FilesystemProvider,
}

impl WorkspaceContext {
    pub fn new(workspace_path: String) -> Self {
        let path = PathBuf::from(&workspace_path);
        WorkspaceContext {
            workspace_path: path.clone(),
            git: GitProvider::new(path.clone()),
            diagnostics: DiagnosticsProvider,
            terminal: TerminalProvider,
            fs: FilesystemProvider::new(path),
        }
    }
}
