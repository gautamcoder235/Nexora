use std::fs;
use std::path::{Path, PathBuf};
use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct RecoveryJournal {
    pub operation: String,
    pub state: String, // CREATED | PREPARED | BACKUP_CREATED | FILES_MODIFIED | VERIFICATION_RUNNING | COMPLETED | FAILED
    pub checkpoint: Option<String>,
    pub timestamp: String,
}

pub struct ActiveJournal {
    journal_path: PathBuf,
}

impl ActiveJournal {
    pub fn create(project_path: &str, operation: &str, checkpoint: Option<String>) -> Result<Self, String> {
        let journal_dir = Path::new(project_path).join(".nexora").join("recovery");
        fs::create_dir_all(&journal_dir).map_err(|e| e.to_string())?;

        let journal_path = journal_dir.join("operation.journal");
        let journal = Self { journal_path };
        journal.update(operation, "CREATED", checkpoint)?;
        Ok(journal)
    }

    pub fn update(&self, operation: &str, state: &str, checkpoint: Option<String>) -> Result<(), String> {
        let journal_data = RecoveryJournal {
            operation: operation.to_string(),
            state: state.to_string(),
            checkpoint,
            timestamp: chrono::Local::now().to_rfc3339(),
        };

        let temp_journal = self.journal_path.with_extension("tmp");
        let content = serde_json::to_string_pretty(&journal_data).map_err(|e| e.to_string())?;
        fs::write(&temp_journal, content).map_err(|e| e.to_string())?;
        
        let file = fs::File::open(&temp_journal).map_err(|e| e.to_string())?;
        file.sync_all().map_err(|e| e.to_string())?;
        fs::rename(temp_journal, &self.journal_path).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn clear(self) {
        let _ = fs::remove_file(&self.journal_path);
    }
}
