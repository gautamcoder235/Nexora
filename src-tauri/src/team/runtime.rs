use crate::spawn_pty_internal;
use tauri::AppHandle;

pub trait WorkerRuntime {
    fn start(
        &mut self,
        app_handle: AppHandle,
        session_id: String,
        project_path: String,
        task_id: String,
        command: Option<String>,
        args: Option<Vec<String>>,
    ) -> Result<(), String>;

    fn stop(&mut self, session_id: &str) -> Result<(), String>;
    fn health_check(&self, session_id: &str) -> Result<bool, String>;
}

pub struct AiderRuntime;
impl WorkerRuntime for AiderRuntime {
    fn start(
        &mut self,
        app_handle: AppHandle,
        session_id: String,
        project_path: String,
        task_id: String,
        _command: Option<String>,
        args: Option<Vec<String>>,
    ) -> Result<(), String> {
        let cwd = Some(format!("{}/.nexora/worktrees/task_{}", project_path, task_id));
        let driver = crate::drivers::registry::REGISTRY.get("aider").ok_or("Aider driver not found")?;
        let opts = crate::drivers::types::LaunchOptions {
            session_id: session_id.clone(),
            workspace_dir: cwd.clone().unwrap_or(project_path.clone()),
            custom_args: args,
            env_overrides: None,
        };
        let (cmd, a) = driver.launch(opts).map_err(|e| e.to_string())?;

        spawn_pty_internal(
            app_handle,
            session_id,
            Some(cmd),
            Some(a),
            cwd,
            None,
            None,
            None,
            Some(project_path),
            Some(task_id),
        )?;
        Ok(())
    }

    fn stop(&mut self, session_id: &str) -> Result<(), String> {
        crate::kill_pty(session_id.to_string())
    }

    fn health_check(&self, session_id: &str) -> Result<bool, String> {
        let sessions = crate::get_sessions().lock().map_err(|e| e.to_string())?;
        Ok(sessions.contains_key(session_id))
    }
}

pub struct ClaudeRuntime;
impl WorkerRuntime for ClaudeRuntime {
    fn start(
        &mut self,
        app_handle: AppHandle,
        session_id: String,
        project_path: String,
        task_id: String,
        _command: Option<String>,
        args: Option<Vec<String>>,
    ) -> Result<(), String> {
        let cwd = Some(format!("{}/.nexora/worktrees/task_{}", project_path, task_id));
        let driver = crate::drivers::registry::REGISTRY.get("claude").ok_or("Claude driver not found")?;
        let opts = crate::drivers::types::LaunchOptions {
            session_id: session_id.clone(),
            workspace_dir: cwd.clone().unwrap_or(project_path.clone()),
            custom_args: args,
            env_overrides: None,
        };
        let (cmd, a) = driver.launch(opts).map_err(|e| e.to_string())?;

        spawn_pty_internal(
            app_handle,
            session_id,
            Some(cmd),
            Some(a),
            cwd,
            None,
            None,
            None,
            Some(project_path),
            Some(task_id),
        )?;
        Ok(())
    }

    fn stop(&mut self, session_id: &str) -> Result<(), String> {
        crate::kill_pty(session_id.to_string())
    }

    fn health_check(&self, session_id: &str) -> Result<bool, String> {
        let sessions = crate::get_sessions().lock().map_err(|e| e.to_string())?;
        Ok(sessions.contains_key(session_id))
    }
}

pub struct AntigravityRuntime;
impl WorkerRuntime for AntigravityRuntime {
    fn start(
        &mut self,
        app_handle: AppHandle,
        session_id: String,
        project_path: String,
        task_id: String,
        _command: Option<String>,
        args: Option<Vec<String>>,
    ) -> Result<(), String> {
        let cwd = Some(format!("{}/.nexora/worktrees/task_{}", project_path, task_id));
        let driver = crate::drivers::registry::REGISTRY.get("agy").ok_or("Antigravity driver not found")?;
        let opts = crate::drivers::types::LaunchOptions {
            session_id: session_id.clone(),
            workspace_dir: cwd.clone().unwrap_or(project_path.clone()),
            custom_args: args,
            env_overrides: None,
        };
        let (cmd, a) = driver.launch(opts).map_err(|e| e.to_string())?;

        spawn_pty_internal(
            app_handle,
            session_id,
            Some(cmd),
            Some(a),
            cwd,
            None,
            None,
            None,
            Some(project_path),
            Some(task_id),
        )?;
        Ok(())
    }

    fn stop(&mut self, session_id: &str) -> Result<(), String> {
        crate::kill_pty(session_id.to_string())
    }

    fn health_check(&self, session_id: &str) -> Result<bool, String> {
        let sessions = crate::get_sessions().lock().map_err(|e| e.to_string())?;
        Ok(sessions.contains_key(session_id))
    }
}
