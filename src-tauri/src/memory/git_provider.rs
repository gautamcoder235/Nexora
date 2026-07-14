use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::AppHandle;
use tauri::Manager;

pub fn resolve_git_binary(app_handle: &AppHandle) -> Result<PathBuf, String> {
    if let Ok(resource_dir) = app_handle.path().resource_dir() {
        let prod_git = resource_dir.join("resources").join("git").join("bin").join("git.exe");
        if prod_git.exists() {
            return Ok(prod_git);
        }
        let up_git = resource_dir.join("_up_").join("resources").join("git").join("bin").join("git.exe");
        if up_git.exists() {
            return Ok(up_git);
        }
    }

    #[cfg(debug_assertions)]
    {
        let dev_git = std::env::current_dir()
            .unwrap_or_default()
            .join("resources")
            .join("git")
            .join("bin")
            .join("git.exe");
        if dev_git.exists() {
            return Ok(dev_git);
        }
        return Ok(PathBuf::from("git"));
    }

    #[cfg(not(debug_assertions))]
    Err("Portable Git binary not found in bundled resources".to_string())
}

pub fn execute_git(git_path: &Path, git_dir: &Path, work_tree: &Path, args: &[&str]) -> Result<String, String> {
    let mut cmd = Command::new(git_path);
    cmd.arg(format!("--git-dir={}", git_dir.to_string_lossy()));
    cmd.arg(format!("--work-tree={}", work_tree.to_string_lossy()));
    cmd.args(args);

    #[cfg(target_os = "windows")]
    {
        cmd.env("GIT_CONFIG_NOSYSTEM", "1");
        cmd.env("GIT_CONFIG_GLOBAL", "NUL");
    }
    #[cfg(not(target_os = "windows"))]
    {
        cmd.env("GIT_CONFIG_NOSYSTEM", "1");
        cmd.env("GIT_CONFIG_GLOBAL", "/dev/null");
    }

    cmd.env("GIT_AUTHOR_NAME", "Nexora Memory");
    cmd.env("GIT_AUTHOR_EMAIL", "memory@nexora.ai");
    cmd.env("GIT_COMMITTER_NAME", "Nexora Memory");
    cmd.env("GIT_COMMITTER_EMAIL", "memory@nexora.ai");

    let output = cmd.output().map_err(|e| format!("Failed to execute Git command: {}", e))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        let err_msg = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(if err_msg.is_empty() {
            "Unknown Git error".to_string()
        } else {
            err_msg
        })
    }
}

pub fn validate_git_version(git_path: &Path) -> Result<(), String> {
    let mut cmd = Command::new(git_path);
    cmd.arg("--version");
    let output = cmd.output().map_err(|e| format!("Failed to get Git version: {}", e))?;
    let version_str = String::from_utf8_lossy(&output.stdout);
    
    let parts: Vec<&str> = version_str.split_whitespace().collect();
    let version_num = parts.iter().find(|&&p| p.chars().next().unwrap_or(' ').is_numeric());
    
    if let Some(ver) = version_num {
        let clean_ver: String = ver.chars().take_while(|&c| c.is_numeric() || c == '.').collect();
        let semver: Vec<&str> = clean_ver.split('.').collect();
        if semver.len() >= 2 {
            let major: u32 = semver[0].parse().unwrap_or(0);
            let minor: u32 = semver[1].parse().unwrap_or(0);
            if major > 2 || (major == 2 && minor >= 40) {
                return Ok(());
            }
        }
    }
    
    if output.status.success() {
        return Ok(());
    }
    
    Err(format!("Unsupported Git version: {}. Minimum required is 2.40.0", version_str.trim()))
}

pub fn init_repo(git_path: &Path, git_dir: &Path, work_tree: &Path) -> Result<(), String> {
    fs::create_dir_all(git_dir).map_err(|e| e.to_string())?;
    execute_git(git_path, git_dir, work_tree, &["init"])?;
    
    // Add default excludes
    let info_dir = git_dir.join("info");
    fs::create_dir_all(&info_dir).map_err(|e| e.to_string())?;
    let exclude_file = info_dir.join("exclude");
    let content = "\
.nexora/
node_modules/
target/
dist/
build/
.next/
__pycache__/
*.exe
*.dll
*.so
*.dylib
";
    fs::write(exclude_file, content).map_err(|e| e.to_string())?;

    execute_git(git_path, git_dir, work_tree, &["config", "core.autocrlf", "false"])?;
    execute_git(git_path, git_dir, work_tree, &["config", "core.quotepath", "false"])?;
    Ok(())
}

pub fn create_git_bundle(git_path: &Path, git_dir: &Path, work_tree: &Path, dest_bundle_path: &str) -> Result<String, String> {
    execute_git(git_path, git_dir, work_tree, &["bundle", "create", dest_bundle_path, "--all"])
}

pub fn verify_git_bundle(git_path: &Path, temp_git_dir: &Path, bundle_path: &str) -> Result<(), String> {
    let _ = fs::remove_dir_all(temp_git_dir);
    let mut cmd = Command::new(git_path);
    cmd.arg("init").arg(temp_git_dir);
    let output = cmd.output().map_err(|e| e.to_string())?;
    if output.status.success() {
        let mut verify_cmd = Command::new(git_path);
        verify_cmd.arg(format!("--git-dir={}", temp_git_dir.join(".git").to_string_lossy()));
        verify_cmd.arg("bundle").arg("verify").arg(bundle_path);
        let verify_output = verify_cmd.output().map_err(|e| e.to_string())?;
        let _ = fs::remove_dir_all(temp_git_dir);
        if !verify_output.status.success() {
            return Err("Git bundle verification failed".to_string());
        }
        Ok(())
    } else {
        Err("Failed to initialize temporary git validation repository".to_string())
    }
}

pub fn run_gc_auto(git_path: &Path, git_dir: &Path) -> Result<(), String> {
    let mut cmd = Command::new(git_path);
    cmd.arg(format!("--git-dir={}", git_dir.to_string_lossy()));
    cmd.arg("gc").arg("--auto");
    let status = cmd.status().map_err(|e| e.to_string())?;
    if status.success() {
        Ok(())
    } else {
        Err("Git gc --auto failed".to_string())
    }
}
