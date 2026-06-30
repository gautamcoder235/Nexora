use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct BudgetInfo {
    pub schema_version: u32,
    pub daily_limit: f64,
    pub spent_today: f64,
    pub spent_total: f64,
    pub last_reset_timestamp: i64,
}

impl Default for BudgetInfo {
    fn default() -> Self {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        BudgetInfo {
            schema_version: 1,
            daily_limit: 10.00,
            spent_today: 0.00,
            spent_total: 0.00,
            last_reset_timestamp: now,
        }
    }
}

pub fn get_budget_file_path(project_path: &str) -> std::path::PathBuf {
    Path::new(project_path).join(".nexora").join("state").join("budget.json")
}

pub fn load_budget(project_path: &str) -> Result<BudgetInfo, String> {
    let path = get_budget_file_path(project_path);
    if !path.exists() {
        // Create base dirs and write default budget
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let default_budget = BudgetInfo::default();
        let json = serde_json::to_string_pretty(&default_budget).map_err(|e| e.to_string())?;
        fs::write(&path, json).map_err(|e| e.to_string())?;
        return Ok(default_budget);
    }

    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let mut budget: BudgetInfo = serde_json::from_str(&content).map_err(|e| e.to_string())?;

    // Check if daily limit needs to be reset (after 24 hours)
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;
    
    // 86400 seconds in a day
    if now - budget.last_reset_timestamp >= 86400 {
        budget.spent_today = 0.00;
        budget.last_reset_timestamp = now;
        let _ = save_budget(project_path, &budget);
    }

    Ok(budget)
}

pub fn save_budget(project_path: &str, budget: &BudgetInfo) -> Result<(), String> {
    let path = get_budget_file_path(project_path);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(budget).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn add_cost(project_path: &str, cost_usd: f64) -> Result<(), String> {
    let mut budget = load_budget(project_path)?;
    budget.spent_today += cost_usd;
    budget.spent_total += cost_usd;
    save_budget(project_path, &budget)?;
    Ok(())
}

pub fn is_budget_available(project_path: &str) -> Result<bool, String> {
    let budget = load_budget(project_path)?;
    Ok(budget.spent_today < budget.daily_limit)
}

// ==========================================
// Tauri Commands
// ==========================================

#[tauri::command]
pub fn get_budget(project_path: String) -> Result<BudgetInfo, String> {
    load_budget(&project_path)
}

#[tauri::command]
pub fn update_budget_limit(project_path: String, new_limit: f64) -> Result<(), String> {
    let mut budget = load_budget(&project_path)?;
    budget.daily_limit = new_limit;
    save_budget(&project_path, &budget)
}
