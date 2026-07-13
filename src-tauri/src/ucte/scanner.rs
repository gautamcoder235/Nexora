use std::path::Path;
use globset::{Glob, GlobSet, GlobSetBuilder};
use crate::ucte::provider::{FileMeta, FileProvider};

pub struct IgnoreFilter {
    globset: GlobSet,
}

impl IgnoreFilter {
    pub fn new(root_path: &str) -> Self {
        let mut builder = GlobSetBuilder::new();
        // Standard defaults
        let defaults = vec![
            "**/node_modules/**",
            "**/target/**",
            "**/dist/**",
            "**/build/**",
            "**/bin/**",
            "**/.cache/**",
            "**/.git/**",
            "**/.nexora/**",
            "**/*.exe",
            "**/*.dll",
            "**/*.so",
            "**/*.dylib",
            "**/*.png",
            "**/*.jpg",
            "**/*.jpeg",
            "**/*.gif",
            "**/*.zip",
            "**/*.tar.gz",
        ];

        for pattern in defaults {
            if let Ok(glob) = Glob::new(pattern) {
                builder.add(glob);
            }
        }

        // Try to read .gitignore or .nexoraignore in the root
        let gitignore_path = Path::new(root_path).join(".gitignore");
        if gitignore_path.exists() {
            if let Ok(content) = std::fs::read_to_string(&gitignore_path) {
                for line in content.lines() {
                    let trimmed = line.trim();
                    if !trimmed.is_empty() && !trimmed.starts_with('#') {
                        let glob_pattern = if trimmed.starts_with('/') {
                            format!("**{}", trimmed)
                        } else {
                            format!("**/{}", trimmed)
                        };
                        if let Ok(glob) = Glob::new(&glob_pattern) {
                            builder.add(glob);
                        }
                    }
                }
            }
        }

        let globset = builder.build().unwrap_or_else(|_| GlobSetBuilder::new().build().unwrap());
        Self { globset }
    }

    pub fn should_ignore(&self, path: &str) -> bool {
        self.globset.is_match(path)
    }
}

pub struct ScanResult {
    pub files: Vec<FileMeta>,
}

pub fn scan_directory(
    provider: &dyn FileProvider,
    root_path: &str,
    ignore: &IgnoreFilter,
) -> Result<ScanResult, String> {
    let mut files = Vec::new();
    let mut dirs_to_visit = vec![root_path.to_string()];

    while let Some(current_dir) = dirs_to_visit.pop() {
        if ignore.should_ignore(&current_dir) {
            continue;
        }

        match provider.list_dir(&current_dir) {
            Ok(entries) => {
                for entry in entries {
                    if ignore.should_ignore(&entry.path) {
                        continue;
                    }
                    if entry.is_dir {
                        dirs_to_visit.push(entry.path.clone());
                    } else {
                        files.push(entry);
                    }
                }
            }
            Err(e) => {
                eprintln!("[UCTE Scanner] Warning listing {}: {}", current_dir, e);
            }
        }
    }

    Ok(ScanResult { files })
}
