use std::path::Path;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationConfig {
    pub name: String,
    pub command: String,
    pub args: Vec<String>,
}

pub fn analyze_workspace(project_dir: &str) -> Vec<ValidationConfig> {
    let mut configs = Vec::new();
    let root = Path::new(project_dir);

    if !root.exists() || !root.is_dir() {
        return configs;
    }

    // 1. Rust Workspace Check
    if root.join("Cargo.toml").exists() {
        configs.push(ValidationConfig {
            name: "Rust Compiler Check".to_string(),
            command: "cargo".to_string(),
            args: vec!["check".to_string()],
        });
        configs.push(ValidationConfig {
            name: "Rust Test Suite".to_string(),
            command: "cargo".to_string(),
            args: vec!["test".to_string()],
        });
    }

    // 2. Node/JS/TS Workspace Check
    if root.join("package.json").exists() {
        // We check if npm is used. Usually, npm run build is a good build check.
        configs.push(ValidationConfig {
            name: "Node Compilation / Build".to_string(),
            command: "npm".to_string(),
            args: vec!["run".to_string(), "build".to_string()],
        });
    }

    // 3. Go Workspace Check
    if root.join("go.mod").exists() {
        configs.push(ValidationConfig {
            name: "Go Build Check".to_string(),
            command: "go".to_string(),
            args: vec!["build".to_string(), "./...".to_string()],
        });
        configs.push(ValidationConfig {
            name: "Go Test Suite".to_string(),
            command: "go".to_string(),
            args: vec!["test".to_string(), "./...".to_string()],
        });
    }

    // 4. Python Project Check
    if root.join("requirements.txt").exists() || root.join("setup.py").exists() || root.join("pyproject.toml").exists() {
        // If python files are present, check syntax with python -m py_compile or flake8 if installed
        configs.push(ValidationConfig {
            name: "Python Syntax Verification".to_string(),
            command: "python".to_string(),
            args: vec!["-m".to_string(), "compileall".to_string(), ".".to_string()],
        });
    }

    configs
}
