use std::time::Duration;
use tauri::{AppHandle, Manager, State, Emitter};
use crate::swarm_db::DbState;
use crate::team::locks::cleanup_expired_locks;

pub fn start_team_lock_watchdog(app_handle: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(5));
        loop {
            interval.tick().await;

            let db_state: Option<State<DbState>> = app_handle.try_state();
            if let Some(db) = db_state {
                if let Ok(guard) = db.0.lock() {
                    if let Some(ref conn) = *guard {
                        match cleanup_expired_locks(conn) {
                            Ok(num_cleaned) => {
                                if num_cleaned > 0 {
                                    println!(
                                        "[Team Watchdog] Cleaned up {} expired resource locks.",
                                        num_cleaned
                                    );
                                    let _ = app_handle.emit("team:locks_cleaned", num_cleaned);
                                }
                            }
                            Err(e) => {
                                eprintln!("[Team Watchdog] Error cleaning expired locks: {}", e);
                            }
                        }
                    }
                }
            }
        }
    });
}
