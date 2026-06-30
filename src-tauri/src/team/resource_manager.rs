use serde::{Deserialize, Serialize};
use std::sync::{Mutex, OnceLock};
use sysinfo::System;

#[derive(Serialize, Deserialize, Debug, Clone, Copy)]
pub enum ExecutionProfile {
    Conservative,
    Balanced,
    Aggressive,
}

impl Default for ExecutionProfile {
    fn default() -> Self {
        ExecutionProfile::Balanced
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ResourceLimits {
    pub max_cpu_percent: f32,
    pub max_ram_percent: f32,
    pub max_ptys: usize,
    pub max_concurrent_tasks: usize,
}

impl ResourceLimits {
    pub fn from_profile(profile: ExecutionProfile) -> Self {
        match profile {
            ExecutionProfile::Conservative => ResourceLimits {
                max_cpu_percent: 50.0,
                max_ram_percent: 60.0,
                max_ptys: 4,
                max_concurrent_tasks: 2,
            },
            ExecutionProfile::Balanced => ResourceLimits {
                max_cpu_percent: 80.0,
                max_ram_percent: 80.0,
                max_ptys: 8,
                max_concurrent_tasks: 4,
            },
            ExecutionProfile::Aggressive => ResourceLimits {
                max_cpu_percent: 95.0,
                max_ram_percent: 95.0,
                max_ptys: 16,
                max_concurrent_tasks: 8,
            },
        }
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ResourceSnapshot {
    pub cpu_percent: f32,
    pub ram_used_mb: u64,
    pub total_ram_mb: u64,
    pub ram_percent: f32,
    pub active_ptys: usize,
    pub active_tasks: usize,
}

// Global thread-safe System resource instance
static SYSTEM_RESOURCES: OnceLock<Mutex<System>> = OnceLock::new();

fn get_system_resources() -> &'static Mutex<System> {
    SYSTEM_RESOURCES.get_or_init(|| {
        let mut sys = System::new();
        sys.refresh_cpu_usage();
        sys.refresh_memory();
        Mutex::new(sys)
    })
}

// Global thread-safe active task count tracker
static ACTIVE_TASK_COUNT: Mutex<usize> = Mutex::new(0);

pub fn increment_active_task_count() {
    if let Ok(mut count) = ACTIVE_TASK_COUNT.lock() {
        *count += 1;
    }
}

pub fn decrement_active_task_count() {
    if let Ok(mut count) = ACTIVE_TASK_COUNT.lock() {
        if *count > 0 {
            *count -= 1;
        }
    }
}

pub fn get_active_tasks() -> usize {
    *ACTIVE_TASK_COUNT.lock().unwrap_or_else(|e| e.into_inner())
}

#[tauri::command]
pub fn get_resource_snapshot() -> Result<ResourceSnapshot, String> {
    let mut sys = get_system_resources().lock().map_err(|e| e.to_string())?;
    sys.refresh_cpu_usage();
    sys.refresh_memory();

    let cpu_percent = sys.global_cpu_usage();
    let used_memory = sys.used_memory();
    let total_memory = sys.total_memory();
    
    // Check if sysinfo returns bytes or KB (typically KB on older versions, bytes on newer).
    // Let's standardise to MB.
    let ram_used_mb = used_memory / 1024 / 1024;
    let total_ram_mb = total_memory / 1024 / 1024;

    let ram_percent = if total_memory > 0 {
        (used_memory as f32 / total_memory as f32) * 100.0
    } else {
        0.0
    };

    // Retrieve active PTY count from session registry
    let active_ptys = crate::get_active_pty_count();

    let active_tasks = get_active_tasks();

    Ok(ResourceSnapshot {
        cpu_percent,
        ram_used_mb,
        total_ram_mb,
        ram_percent,
        active_ptys,
        active_tasks,
    })
}

#[tauri::command]
pub fn verify_resource_availability(profile_name: String) -> Result<bool, String> {
    let profile = match profile_name.to_lowercase().as_str() {
        "conservative" => ExecutionProfile::Conservative,
        "aggressive" => ExecutionProfile::Aggressive,
        _ => ExecutionProfile::Balanced,
    };
    
    let limits = ResourceLimits::from_profile(profile);
    let snapshot = get_resource_snapshot()?;

    if snapshot.cpu_percent >= limits.max_cpu_percent {
        return Ok(false);
    }
    if snapshot.ram_percent >= limits.max_ram_percent {
        return Ok(false);
    }
    if snapshot.active_ptys >= limits.max_ptys {
        return Ok(false);
    }
    if snapshot.active_tasks >= limits.max_concurrent_tasks {
        return Ok(false);
    }

    Ok(true)
}
