use std::env;
use std::fs;
use std::path::PathBuf;
use std::process::Command;

// Make sure to import the crate's library name
// In Cargo.toml: name = "nexora_lib"
use nexora_lib::swarm_worktrees::{create_worktree, remove_worktree};

#[test]
fn test_worktree_lifecycle() {
    // 1. Create a temporary directory.
    let temp_dir = env::temp_dir().join(format!("worktree_test_{}", std::process::id()));

    // Clean up if it exists from a previous run
    if temp_dir.exists() {
        let _ = fs::remove_dir_all(&temp_dir);
    }
    fs::create_dir_all(&temp_dir).expect("Failed to create temp dir");

    // 2. Initialize a new git repository in it (`git init`) and make an initial commit
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

    // Create a dummy file and commit
    let dummy_file = temp_dir.join("dummy.txt");
    fs::write(&dummy_file, "initial commit content").unwrap();

    let status = Command::new("git")
        .args(&["add", "dummy.txt"])
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

    // 3. Call the `create_worktree` function
    let task_id = "123".to_string();
    let exec_id = "456".to_string();
    let project_root_str = temp_dir.to_str().unwrap().to_string();

    let result = create_worktree(
        project_root_str.clone(),
        task_id.clone(),
        exec_id.clone(),
        "Title".to_string(),
        "Desc".to_string(),
        vec![],
    )
    .expect("create_worktree failed");

    // 4. Assert that the worktree directory was created successfully.
    assert!(
        result.success,
        "Worktree result success flag should be true"
    );
    let worktree_path = PathBuf::from(&result.path);
    assert!(worktree_path.exists(), "Worktree path does not exist");
    assert!(worktree_path.is_dir(), "Worktree path is not a directory");
    assert_eq!(
        result.branch_name,
        format!("task-{}-exec-{}", task_id, exec_id)
    );

    // 5. Assert that the `.nexora` contract directory exists inside the worktree
    let contract_dir = worktree_path.join(".nexora");
    assert!(contract_dir.exists(), "Contract directory does not exist");

    // Assert task.json, ownership.json, status.json, and execution.log are successfully written
    assert!(contract_dir.join("task.json").exists());
    assert!(contract_dir.join("ownership.json").exists());
    assert!(contract_dir.join("status.json").exists());
    assert!(contract_dir.join("execution.log").exists());

    // 6. Call `remove_worktree` and assert that the worktree was successfully deleted and the branch was deleted.
    let remove_result = remove_worktree(
        project_root_str,
        result.path.clone(),
        result.branch_name.clone(),
    )
    .expect("remove_worktree failed");

    assert!(remove_result, "remove_worktree should return true");
    assert!(
        !worktree_path.exists(),
        "Worktree directory should be deleted"
    );

    // Check if branch was deleted
    let branch_check = Command::new("git")
        .args(&["branch", "--list", &result.branch_name])
        .current_dir(&temp_dir)
        .output()
        .expect("Failed to list git branches");

    let branch_output = String::from_utf8_lossy(&branch_check.stdout);
    assert!(
        !branch_output.contains(&result.branch_name),
        "Branch should have been deleted"
    );

    // Clean up
    let _ = fs::remove_dir_all(&temp_dir);
    // Also remove the parent .multi-vibe-worktrees created by create_worktree
    let parent_worktrees_dir = temp_dir.parent().unwrap().join(".nexora-worktrees");
    if parent_worktrees_dir.exists() {
        let _ = fs::remove_dir_all(&parent_worktrees_dir);
    }
}
