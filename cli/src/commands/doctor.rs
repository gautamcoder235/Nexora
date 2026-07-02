use nexora_core::error::NexoraError;
use crate::runtime::ServiceContainer;
use crate::command_dispatcher::{Command, CommandResult};
use crate::ui::{print_divider, print_alert, print_table};

pub struct DoctorCommand;

impl Command for DoctorCommand {
    fn name(&self) -> &'static str { "doctor" }
    fn description(&self) -> &'static str { "Audits workspace configurations, active profile states, and Desktop IPC health" }

    fn execute(&self, services: &ServiceContainer, _args: &clap::ArgMatches) -> Result<CommandResult, NexoraError> {
        let theme = &services.theme;
        
        println!();
        print_divider(theme, Some("Nexora System Doctor Audit"));
        println!();

        // 1. Audit Workspace Context
        let workspace = &services.workspace;
        let mut proj_types = Vec::new();
        for t in &workspace.project_types {
            proj_types.push(format!("{}", t));
        }
        let proj_str = proj_types.join(", ");
        print_alert(theme, "info", &format!("Detected Workspace: {}", workspace.root_path.to_string_lossy()));
        print_alert(theme, "info", &format!("Project Stack: {}", proj_str));

        for diagnostic in &workspace.diagnostics {
            print_alert(theme, "success", &format!("  {}", diagnostic));
        }
        println!();

        // 2. Audit Configuration Files
        if let Some(global_path) = nexora_core::config::get_global_config_path() {
            if global_path.exists() {
                print_alert(theme, "success", &format!("Global Configuration active: {}", global_path.to_string_lossy()));
            } else {
                print_alert(theme, "warn", "Global Configuration file is missing. Using default settings.");
            }
        }

        if let Some(workspace_path) = nexora_core::config::find_workspace_config() {
            print_alert(theme, "success", &format!("Workspace Configuration active: {}", workspace_path.to_string_lossy()));
        } else {
            print_alert(theme, "info", "No workspace-level config (.nexora/config.toml) detected.");
        }
        println!();

        // 3. Audit IPC connection status
        let mut ipc = services.ipc.lock();
        print_alert(theme, "info", "Checking Desktop Application IPC Link...");
        let ipc_status = match ipc.connect(std::time::Duration::from_millis(500)) {
            Ok(_) => {
                print_alert(theme, "success", "Desktop IPC connection established successfully.");
                "Online"
            }
            Err(_) => {
                print_alert(theme, "warn", "Desktop IPC is offline. The desktop application is not running.");
                "Offline"
            }
        };
        println!();

        // 4. Audit Metrics and Print summary table
        let metrics = services.metrics.get_metrics();
        if !metrics.is_empty() {
            print_divider(theme, Some("Performance Metrics Summary"));
            println!();
            
            let mut rows: Vec<Vec<String>> = Vec::new();
            for m in &metrics {
                rows.push(vec![
                    m.name.clone(),
                    m.value.to_string(),
                    m.description.clone(),
                ]);
            }

            let row_slices: Vec<Vec<&str>> = rows
                .iter()
                .map(|row| vec![row[0].as_str(), row[1].as_str(), row[2].as_str()])
                .collect();
                
            print_table(theme, &["Metric Name", "Value", "Description"], &row_slices);
        }

        print_divider(theme, None);
        println!();

        Ok(CommandResult::Success(serde_json::json!({
            "workspace_root": workspace.root_path,
            "project_types": proj_types,
            "ipc_status": ipc_status,
        })))
    }
}
