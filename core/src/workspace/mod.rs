use std::path::PathBuf;
use std::process::Command;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ProjectType {
    Rust,
    Node,
    Python,
    Go,
    CMake,
    Git,
    Unknown,
}

impl std::fmt::Display for ProjectType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let name = match self {
            ProjectType::Rust => "Rust (Cargo)",
            ProjectType::Node => "Node.js (npm/yarn/pnpm)",
            ProjectType::Python => "Python",
            ProjectType::Go => "Go",
            ProjectType::CMake => "C/C++ (CMake)",
            ProjectType::Git => "Git Repository",
            ProjectType::Unknown => "Unknown",
        };
        write!(f, "{}", name)
    }
}

#[derive(Debug, Clone)]
pub struct WorkspaceContext {
    pub root_path: PathBuf,
    pub project_types: Vec<ProjectType>,
    pub is_git_repo: bool,
    pub diagnostics: Vec<String>,
}

impl WorkspaceContext {
    pub fn detect() -> Self {
        let current_dir = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
        let mut root_path = current_dir.clone();
        let mut project_types = Vec::new();
        let mut is_git_repo = false;
        let mut diagnostics = Vec::new();

        // 1. Find Workspace Root (climb up until we find common project files)
        let mut search_path = current_dir.clone();
        let mut found_root = false;
        loop {
            if search_path.join(".git").exists() {
                root_path = search_path.clone();
                is_git_repo = true;
                project_types.push(ProjectType::Git);
                found_root = true;
            }
            if search_path.join("Cargo.toml").exists()
                || search_path.join("package.json").exists()
                || search_path.join("go.mod").exists()
                || search_path.join("pyproject.toml").exists()
                || search_path.join("CMakeLists.txt").exists()
            {
                if !found_root {
                    root_path = search_path.clone();
                    found_root = true;
                }
            }

            if !search_path.pop() {
                break;
            }
        }

        // 2. Perform localized checks in detected root
        if root_path.join("Cargo.toml").exists() {
            project_types.push(ProjectType::Rust);
            // Run cargo --version
            if let Ok(output) = Command::new("cargo").arg("--version").output() {
                if output.status.success() {
                    let version_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
                    diagnostics.push(format!("Cargo toolchain detected: {}", version_str));
                }
            } else {
                diagnostics.push("Rust project detected, but 'cargo' CLI is not in PATH.".to_string());
            }
        }

        if root_path.join("package.json").exists() {
            project_types.push(ProjectType::Node);
            // Run node --version
            if let Ok(output) = Command::new("node").arg("--version").output() {
                if output.status.success() {
                    let version_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
                    diagnostics.push(format!("Node.js toolchain detected: {}", version_str));
                }
            }
        }

        if root_path.join("pyproject.toml").exists()
            || root_path.join("requirements.txt").exists()
            || root_path.join("Pipfile").exists()
        {
            project_types.push(ProjectType::Python);
            if let Ok(output) = Command::new("python").arg("--version").output() {
                if output.status.success() {
                    let version_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
                    diagnostics.push(format!("Python toolchain detected: {}", version_str));
                }
            }
        }

        if root_path.join("go.mod").exists() {
            project_types.push(ProjectType::Go);
            if let Ok(output) = Command::new("go").arg("version").output() {
                if output.status.success() {
                    let version_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
                    diagnostics.push(format!("Go toolchain detected: {}", version_str));
                }
            }
        }

        if root_path.join("CMakeLists.txt").exists() {
            project_types.push(ProjectType::CMake);
            if let Ok(output) = Command::new("cmake").arg("--version").output() {
                if output.status.success() {
                    let output_str = String::from_utf8_lossy(&output.stdout);
                    let lines: Vec<&str> = output_str.lines().collect();
                    if !lines.is_empty() {
                        diagnostics.push(format!("CMake build system detected: {}", lines[0]));
                    }
                }
            }
        }

        if project_types.is_empty() {
            project_types.push(ProjectType::Unknown);
        }

        Self {
            root_path,
            project_types,
            is_git_repo,
            diagnostics,
        }
    }
}
