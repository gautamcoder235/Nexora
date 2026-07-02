use crate::security::policies::{WorkspaceGuard, FilesystemPolicy, ShellPolicy};
use crate::security::approval::ApprovalManager;
use std::path::PathBuf;
use std::sync::Arc;

#[derive(Clone)]
pub struct SecurityManager {
    workspace_guard: Arc<WorkspaceGuard>,
    pub approval_manager: Arc<ApprovalManager>,
}

impl SecurityManager {
    pub fn new(workspace_root: PathBuf) -> Self {
        Self {
            workspace_guard: Arc::new(WorkspaceGuard::new(workspace_root)),
            approval_manager: Arc::new(ApprovalManager::new()),
        }
    }

    pub fn is_path_safe(&self, path: &std::path::Path) -> bool {
        self.workspace_guard.is_path_safe(path)
    }

    pub fn check_fs_policy(&self, operation: &str) -> bool {
        FilesystemPolicy::requires_approval(operation)
    }

    pub fn check_shell_policy(&self, cmd: &str) -> bool {
        ShellPolicy::requires_approval(cmd)
    }
}
