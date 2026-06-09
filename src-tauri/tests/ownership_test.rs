use std::env;
use std::fs;
use std::process::Command;

use multi_vibe_lib::swarm_ownership::validate_ownership;

#[test]
fn test_validate_ownership() {
    // 1. Create a temporary directory.
    let temp_dir = env::temp_dir().join(format!("ownership_test_{}", std::process::id()));
    
    // Clean up if it exists from a previous run
    if temp_dir.exists() {
        let _ = fs::remove_dir_all(&temp_dir);
    }
    fs::create_dir_all(&temp_dir).expect("Failed to create temp dir");

    // 2. Initialize a git repository (`git init`) and commit an initial file `src/main.rs`.
    let status = Command::new("git")
        .arg("init")
        .current_dir(&temp_dir)
        .status()
        .expect("Failed to run git init");
    assert!(status.success());

    // Set up git user for commit
    Command::new("git")
        .args(&["config", "user.name", "Test User"])
        .current_dir(&temp_dir)
        .status()
        .expect("Failed to set user.name");
    
    Command::new("git")
        .args(&["config", "user.email", "test@example.com"])
        .current_dir(&temp_dir)
        .status()
        .expect("Failed to set user.email");

    let src_dir = temp_dir.join("src");
    fs::create_dir_all(&src_dir).unwrap();
    
    let main_file = src_dir.join("main.rs");
    fs::write(&main_file, "fn main() {}").unwrap();

    let status = Command::new("git")
        .args(&["add", "src/main.rs"])
        .current_dir(&temp_dir)
        .status()
        .expect("Failed to git add");
    assert!(status.success());

    let status = Command::new("git")
        .args(&["commit", "-m", "initial commit"])
        .current_dir(&temp_dir)
        .status()
        .expect("Failed to git commit");
    assert!(status.success());

    // 3. Create a new file `src/components/settings/index.ts` and modify `src/main.rs`.
    let settings_dir = src_dir.join("components").join("settings");
    fs::create_dir_all(&settings_dir).unwrap();
    
    let index_file = settings_dir.join("index.ts");
    fs::write(&index_file, "export const settings = {};").unwrap();

    fs::write(&main_file, "fn main() { println!(\"modified\"); }").unwrap();

    // 4. Run `git add` for the new file (so it's tracked by git).
    let status = Command::new("git")
        .args(&["add", "src/components/settings/index.ts"])
        .current_dir(&temp_dir)
        .status()
        .expect("Failed to git add");
    assert!(status.success());

    // 5. Calls `swarm_ownership::validate_ownership` passing the temp dir path and `vec!["src/components/settings/**".to_string()]` as the allowed patterns.
    let temp_dir_str = temp_dir.to_str().unwrap().to_string();
    let allowed_patterns = vec!["src/components/settings/**".to_string()];
    
    let result = validate_ownership(temp_dir_str, allowed_patterns)
        .expect("validate_ownership failed");

    // 6. Asserts that `is_valid` is false, because `src/main.rs` was modified and is NOT allowed by the pattern.
    assert!(!result.is_valid, "is_valid should be false");

    // 7. Asserts that `violated_files` contains `src/main.rs`.
    assert!(result.violated_files.contains(&"src/main.rs".to_string()), "violated_files should contain src/main.rs");

    // 8. Asserts that `modified_files` contains both files.
    assert!(result.modified_files.contains(&"src/main.rs".to_string()), "modified_files should contain src/main.rs");
    assert!(result.modified_files.contains(&"src/components/settings/index.ts".to_string()), "modified_files should contain src/components/settings/index.ts");

    // Clean up
    let _ = fs::remove_dir_all(&temp_dir);
}
