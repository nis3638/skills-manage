use tauri::State;

use crate::db::{self, DbPool, ScanDirectory};
use crate::path_utils::{expand_home_path, path_to_string};
use crate::AppState;

// ─── Core Implementations (testable without Tauri State) ──────────────────────

/// Return all scan directories, built-in first then custom ordered by added_at.
pub async fn get_scan_directories_impl(pool: &DbPool) -> Result<Vec<ScanDirectory>, String> {
    db::get_scan_directories(pool).await
}

/// Add a new custom (non-builtin) scan directory.
/// Returns the newly created record.
pub async fn add_scan_directory_impl(
    pool: &DbPool,
    path: &str,
    label: Option<&str>,
) -> Result<ScanDirectory, String> {
    let path = path.trim();
    if path.is_empty() {
        return Err("Scan directory path cannot be empty".to_string());
    }
    let expanded_path = path_to_string(&expand_home_path(path));
    db::add_scan_directory(pool, &expanded_path, label).await
}

/// Remove a custom (non-builtin) scan directory by id.
/// Returns an error if the directory is built-in or not found.
pub async fn remove_scan_directory_impl(pool: &DbPool, id: i64) -> Result<(), String> {
    db::remove_scan_directory_by_id(pool, id).await
}

/// Toggle the `is_active` flag on a scan directory by id.
pub async fn set_scan_directory_active_impl(
    pool: &DbPool,
    id: i64,
    is_active: bool,
) -> Result<(), String> {
    db::toggle_scan_directory_by_id(pool, id, is_active).await
}

/// Update the `path` of a scan directory (built-in or custom) by id.
/// Expands tilde paths and validates non-empty. Returns the persisted (expanded)
/// path on success.
pub async fn update_scan_directory_path_impl(
    pool: &DbPool,
    id: i64,
    new_path: &str,
) -> Result<String, String> {
    let trimmed = new_path.trim();
    if trimmed.is_empty() {
        return Err("Scan directory path cannot be empty".to_string());
    }
    let expanded = path_to_string(&expand_home_path(trimmed));
    db::update_scan_directory_path_by_id(pool, id, &expanded).await?;
    Ok(expanded)
}

/// Get a settings value by key. Returns `None` if the key is not set.
pub async fn get_setting_impl(pool: &DbPool, key: &str) -> Result<Option<String>, String> {
    db::get_setting(pool, key).await
}

/// Set (upsert) a settings value.
pub async fn set_setting_impl(pool: &DbPool, key: &str, value: &str) -> Result<(), String> {
    if key.trim().is_empty() {
        return Err("Settings key cannot be empty".to_string());
    }
    db::set_setting(pool, key, value).await
}

/// Update the central agent's skills directory path.
/// Expands tilde paths and validates non-empty.
pub async fn set_central_skills_dir_impl(pool: &DbPool, path: &str) -> Result<String, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("Central skills directory path cannot be empty".to_string());
    }
    let expanded = path_to_string(&expand_home_path(trimmed));
    db::update_central_skills_dir(pool, &expanded).await?;
    Ok(expanded)
}

// ─── Tauri Commands ───────────────────────────────────────────────────────────

/// Tauri command: return all scan directories.
#[tauri::command]
pub async fn get_scan_directories(
    state: State<'_, AppState>,
) -> Result<Vec<ScanDirectory>, String> {
    get_scan_directories_impl(&state.db).await
}

/// Tauri command: add a new custom scan directory.
#[tauri::command]
pub async fn add_scan_directory(
    state: State<'_, AppState>,
    path: String,
    label: Option<String>,
) -> Result<ScanDirectory, String> {
    add_scan_directory_impl(&state.db, &path, label.as_deref()).await
}

/// Tauri command: remove a custom scan directory by id.
#[tauri::command]
pub async fn remove_scan_directory(state: State<'_, AppState>, id: i64) -> Result<(), String> {
    remove_scan_directory_impl(&state.db, id).await
}

/// Tauri command: set the is_active flag on a scan directory by id.
#[tauri::command]
pub async fn set_scan_directory_active(
    state: State<'_, AppState>,
    id: i64,
    is_active: bool,
) -> Result<(), String> {
    set_scan_directory_active_impl(&state.db, id, is_active).await
}

/// Tauri command: update the `path` of a scan directory (built-in or custom)
/// by id. Returns the persisted (expanded) path on success.
#[tauri::command]
pub async fn update_scan_directory_path(
    state: State<'_, AppState>,
    id: i64,
    new_path: String,
) -> Result<String, String> {
    update_scan_directory_path_impl(&state.db, id, &new_path).await
}

/// Tauri command: get a settings value by key.
#[tauri::command]
pub async fn get_setting(
    state: State<'_, AppState>,
    key: String,
) -> Result<Option<String>, String> {
    get_setting_impl(&state.db, &key).await
}

/// Tauri command: set (upsert) a settings value.
#[tauri::command]
pub async fn set_setting(
    state: State<'_, AppState>,
    key: String,
    value: String,
) -> Result<(), String> {
    set_setting_impl(&state.db, &key, &value).await
}

/// Tauri command: update the central skills directory path.
#[tauri::command]
pub async fn set_central_skills_dir(
    state: State<'_, AppState>,
    path: String,
) -> Result<String, String> {
    set_central_skills_dir_impl(&state.db, &path).await
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;
    use sqlx::SqlitePool;

    async fn setup_test_db() -> DbPool {
        let pool = SqlitePool::connect(":memory:").await.unwrap();
        db::init_database(&pool).await.unwrap();
        pool
    }

    // ── get_scan_directories_impl ─────────────────────────────────────────────

    /// `seed_builtin_scan_directories` now produces one row per built-in
    /// agent (1:1 mapping), so the count equals the number of built-in agents.
    fn expected_builtin_count() -> usize {
        db::builtin_agents().len()
    }

    #[tokio::test]
    async fn test_get_scan_directories_has_builtin_dirs_initially() {
        let pool = setup_test_db().await;
        let dirs = get_scan_directories_impl(&pool).await.unwrap();
        let builtin_count = expected_builtin_count();
        // After init, built-in scan directories are seeded automatically.
        assert_eq!(
            dirs.len(),
            builtin_count,
            "Fresh database should have {} built-in scan directories, got {}",
            builtin_count,
            dirs.len()
        );
        // All seeded rows must be marked built-in.
        for dir in &dirs {
            assert!(
                dir.is_builtin,
                "Scan directory '{}' seeded during init must have is_builtin=true",
                dir.path
            );
        }
    }

    #[tokio::test]
    async fn test_get_scan_directories_returns_added() {
        let pool = setup_test_db().await;
        add_scan_directory_impl(&pool, "/tmp/proj-a", Some("Project A"))
            .await
            .unwrap();
        add_scan_directory_impl(&pool, "/tmp/proj-b", None)
            .await
            .unwrap();

        let dirs = get_scan_directories_impl(&pool).await.unwrap();
        // N built-in dirs are already there; we added 2 custom ones.
        let builtin_count = expected_builtin_count();
        assert_eq!(dirs.len(), builtin_count + 2);
        let paths: Vec<&str> = dirs.iter().map(|d| d.path.as_str()).collect();
        assert!(paths.contains(&"/tmp/proj-a"));
        assert!(paths.contains(&"/tmp/proj-b"));
    }

    // ── add_scan_directory_impl ───────────────────────────────────────────────

    #[tokio::test]
    async fn test_add_scan_directory_creates_non_builtin() {
        let pool = setup_test_db().await;
        let dir = add_scan_directory_impl(&pool, "/tmp/my-project", Some("My Project"))
            .await
            .unwrap();

        assert_eq!(dir.path, "/tmp/my-project");
        assert_eq!(dir.label.as_deref(), Some("My Project"));
        assert!(dir.is_active);
        assert!(
            !dir.is_builtin,
            "Newly added directory should not be built-in"
        );
    }

    #[tokio::test]
    async fn test_add_scan_directory_without_label() {
        let pool = setup_test_db().await;
        let dir = add_scan_directory_impl(&pool, "/tmp/no-label", None)
            .await
            .unwrap();
        assert!(dir.label.is_none());
    }

    #[tokio::test]
    async fn test_add_scan_directory_expands_tilde() {
        let pool = setup_test_db().await;
        let dir = add_scan_directory_impl(&pool, "~/.skillsmanage/custom-scan", None)
            .await
            .unwrap();
        assert!(
            !dir.path.starts_with('~'),
            "tilde paths must be expanded before persistence"
        );
        assert!(dir.path.contains(".skillsmanage"));
    }

    #[tokio::test]
    async fn test_add_scan_directory_empty_path_fails() {
        let pool = setup_test_db().await;
        let result = add_scan_directory_impl(&pool, "   ", None).await;
        assert!(result.is_err(), "Empty path should fail validation");
    }

    #[tokio::test]
    async fn test_add_scan_directory_duplicate_path_fails() {
        let pool = setup_test_db().await;
        add_scan_directory_impl(&pool, "/tmp/same-path", None)
            .await
            .unwrap();
        let result = add_scan_directory_impl(&pool, "/tmp/same-path", None).await;
        assert!(
            result.is_err(),
            "Duplicate path should fail (UNIQUE constraint)"
        );
    }

    // ── remove_scan_directory_impl ────────────────────────────────────────────

    #[tokio::test]
    async fn test_remove_scan_directory_success() {
        let pool = setup_test_db().await;
        let dir = add_scan_directory_impl(&pool, "/tmp/removable", None)
            .await
            .unwrap();

        remove_scan_directory_impl(&pool, dir.id).await.unwrap();

        let dirs = get_scan_directories_impl(&pool).await.unwrap();
        // Built-in dirs remain; only the custom /tmp/removable should be gone.
        let builtin_count = expected_builtin_count();
        assert_eq!(
            dirs.len(),
            builtin_count,
            "Only the custom directory should be removed"
        );
        assert!(
            !dirs.iter().any(|d| d.path == "/tmp/removable"),
            "Removed directory must not appear in the list"
        );
    }

    #[tokio::test]
    async fn test_remove_nonexistent_scan_directory_fails() {
        let pool = setup_test_db().await;
        let result = remove_scan_directory_impl(&pool, 999_999).await;
        assert!(
            result.is_err(),
            "Removing a nonexistent directory should fail"
        );
    }

    #[tokio::test]
    async fn test_remove_builtin_scan_directory_fails() {
        let pool = setup_test_db().await;
        let dirs = get_scan_directories_impl(&pool).await.unwrap();
        let builtin = dirs
            .iter()
            .find(|d| d.is_builtin)
            .expect("expected at least one builtin scan dir");

        let result = remove_scan_directory_impl(&pool, builtin.id).await;
        assert!(result.is_err(), "Removing a built-in directory should fail");
    }

    // ── update_scan_directory_path_impl ───────────────────────────────────────

    #[tokio::test]
    async fn test_update_scan_directory_path_renames_custom() {
        let pool = setup_test_db().await;
        let dir = add_scan_directory_impl(&pool, "/tmp/before", None)
            .await
            .unwrap();
        update_scan_directory_path_impl(&pool, dir.id, "/tmp/after")
            .await
            .unwrap();
        let dirs = get_scan_directories_impl(&pool).await.unwrap();
        assert!(dirs.iter().any(|d| d.path == "/tmp/after"));
        assert!(!dirs.iter().any(|d| d.path == "/tmp/before"));
    }

    #[tokio::test]
    async fn test_update_scan_directory_path_renames_builtin() {
        let pool = setup_test_db().await;
        let dirs = get_scan_directories_impl(&pool).await.unwrap();
        let builtin = dirs
            .iter()
            .find(|d| d.is_builtin)
            .expect("expected at least one builtin scan dir");
        update_scan_directory_path_impl(&pool, builtin.id, "/tmp/builtin-renamed")
            .await
            .unwrap();
        let dirs = get_scan_directories_impl(&pool).await.unwrap();
        let renamed = dirs
            .iter()
            .find(|d| d.path == "/tmp/builtin-renamed")
            .expect("renamed builtin row missing");
        assert!(
            renamed.is_builtin,
            "is_builtin must be preserved across path edits"
        );
        assert!(
            renamed.agent_id.is_some(),
            "builtin row must keep its agent_id binding after a path edit"
        );
    }

    #[tokio::test]
    async fn test_update_scan_directory_path_propagates_to_owning_agent() {
        let pool = setup_test_db().await;
        // Pick a builtin scan dir; its agent_id determines which agent's
        // global_skills_dir is rewritten.
        let dirs = get_scan_directories_impl(&pool).await.unwrap();
        let builtin = dirs
            .iter()
            .find(|d| d.is_builtin)
            .expect("expected at least one builtin scan dir");
        let owner_id = builtin
            .agent_id
            .clone()
            .expect("builtin scan dir must have an agent_id");

        update_scan_directory_path_impl(&pool, builtin.id, "/tmp/builtin-agent-sync")
            .await
            .unwrap();

        let agents_after = db::get_all_agents(&pool).await.unwrap();
        let owner = agents_after
            .iter()
            .find(|a| a.id == owner_id)
            .expect("owner agent vanished after rename");
        assert_eq!(
            owner.global_skills_dir, "/tmp/builtin-agent-sync",
            "owner agent {} global_skills_dir must be updated",
            owner_id
        );
        // Other agents must not be touched, even if they originally shared the
        // same default path (e.g. codex / central) — they have their own row.
        for agent in &agents_after {
            if agent.id != owner_id {
                assert_ne!(
                    agent.global_skills_dir, "/tmp/builtin-agent-sync",
                    "unrelated agent {} must not be modified",
                    agent.id
                );
            }
        }
    }

    #[tokio::test]
    async fn test_update_scan_directory_path_custom_does_not_touch_agents() {
        let pool = setup_test_db().await;
        let dir = add_scan_directory_impl(&pool, "/tmp/custom-original", None)
            .await
            .unwrap();
        let agents_before = db::get_all_agents(&pool).await.unwrap();

        update_scan_directory_path_impl(&pool, dir.id, "/tmp/custom-renamed")
            .await
            .unwrap();

        let agents_after = db::get_all_agents(&pool).await.unwrap();
        assert_eq!(
            agents_before.len(),
            agents_after.len(),
            "custom path edit must not alter agent count"
        );
        for (b, a) in agents_before.iter().zip(agents_after.iter()) {
            assert_eq!(
                b.global_skills_dir, a.global_skills_dir,
                "agent {} global_skills_dir must not change for custom dir edits",
                a.id
            );
        }
    }

    #[tokio::test]
    async fn test_update_scan_directory_path_empty_fails() {
        let pool = setup_test_db().await;
        let dir = add_scan_directory_impl(&pool, "/tmp/keep-me", None)
            .await
            .unwrap();
        let result = update_scan_directory_path_impl(&pool, dir.id, "   ").await;
        assert!(result.is_err(), "Empty new path should fail validation");
    }

    #[tokio::test]
    async fn test_update_scan_directory_path_duplicate_fails() {
        let pool = setup_test_db().await;
        let dir_a = add_scan_directory_impl(&pool, "/tmp/dup-a", None)
            .await
            .unwrap();
        add_scan_directory_impl(&pool, "/tmp/dup-b", None)
            .await
            .unwrap();
        let result = update_scan_directory_path_impl(&pool, dir_a.id, "/tmp/dup-b").await;
        assert!(
            result.is_err(),
            "Renaming to a path used by another row should fail"
        );
    }

    #[tokio::test]
    async fn test_update_scan_directory_path_nonexistent_fails() {
        let pool = setup_test_db().await;
        let result =
            update_scan_directory_path_impl(&pool, 999_999, "/tmp/whatever").await;
        assert!(
            result.is_err(),
            "Updating a path that does not exist should fail"
        );
    }

    #[tokio::test]
    async fn test_update_scan_directory_path_expands_tilde() {
        let pool = setup_test_db().await;
        let dir = add_scan_directory_impl(&pool, "/tmp/before-expand", None)
            .await
            .unwrap();
        let stored = update_scan_directory_path_impl(
            &pool,
            dir.id,
            "~/.skillsmanage/renamed-dir",
        )
        .await
        .unwrap();
        assert!(
            !stored.starts_with('~'),
            "tilde paths must be expanded before persistence"
        );
        assert!(stored.contains(".skillsmanage"));
    }

    #[tokio::test]
    async fn test_seed_yields_one_row_per_builtin_agent() {
        let pool = setup_test_db().await;
        let agent_ids: std::collections::HashSet<String> =
            db::builtin_agents().into_iter().map(|a| a.id).collect();
        let dirs = get_scan_directories_impl(&pool).await.unwrap();
        let builtin_dirs: Vec<_> = dirs.iter().filter(|d| d.is_builtin).collect();
        // Exactly one row per built-in agent — the 1:1 mapping invariant.
        assert_eq!(
            builtin_dirs.len(),
            agent_ids.len(),
            "expected one scan_directory row per built-in agent"
        );
        let dir_agent_ids: std::collections::HashSet<String> = builtin_dirs
            .iter()
            .filter_map(|d| d.agent_id.clone())
            .collect();
        assert_eq!(
            dir_agent_ids, agent_ids,
            "every built-in agent must have its own scan_directory row"
        );
    }

    // ── set_scan_directory_active_impl ────────────────────────────────────────

    #[tokio::test]
    async fn test_set_scan_directory_active_disables() {
        let pool = setup_test_db().await;
        let dir = add_scan_directory_impl(&pool, "/tmp/toggle-me", None)
            .await
            .unwrap();
        set_scan_directory_active_impl(&pool, dir.id, false)
            .await
            .unwrap();
        let dirs = get_scan_directories_impl(&pool).await.unwrap();
        let updated = dirs.iter().find(|d| d.id == dir.id).unwrap();
        assert!(!updated.is_active, "Directory should be inactive");
    }

    #[tokio::test]
    async fn test_set_scan_directory_active_enables() {
        let pool = setup_test_db().await;
        let dir = add_scan_directory_impl(&pool, "/tmp/re-enable-me", None)
            .await
            .unwrap();
        set_scan_directory_active_impl(&pool, dir.id, false)
            .await
            .unwrap();
        set_scan_directory_active_impl(&pool, dir.id, true)
            .await
            .unwrap();
        let dirs = get_scan_directories_impl(&pool).await.unwrap();
        let updated = dirs.iter().find(|d| d.id == dir.id).unwrap();
        assert!(updated.is_active, "Directory should be active again");
    }

    #[tokio::test]
    async fn test_set_scan_directory_active_works_for_builtin() {
        let pool = setup_test_db().await;
        let dirs = get_scan_directories_impl(&pool).await.unwrap();
        let builtin = dirs
            .iter()
            .find(|d| d.is_builtin)
            .expect("expected at least one builtin scan dir");
        set_scan_directory_active_impl(&pool, builtin.id, false)
            .await
            .unwrap();
        let dirs = get_scan_directories_impl(&pool).await.unwrap();
        let updated = dirs.iter().find(|d| d.id == builtin.id).unwrap();
        assert!(
            !updated.is_active,
            "Built-in directory must be toggleable like custom dirs"
        );
    }

    // ── get_setting_impl ──────────────────────────────────────────────────────

    #[tokio::test]
    async fn test_get_setting_not_set_returns_none() {
        let pool = setup_test_db().await;
        let value = get_setting_impl(&pool, "unset_key").await.unwrap();
        assert!(value.is_none(), "Unset key should return None");
    }

    #[tokio::test]
    async fn test_get_setting_after_set() {
        let pool = setup_test_db().await;
        set_setting_impl(&pool, "theme", "dark").await.unwrap();

        let value = get_setting_impl(&pool, "theme").await.unwrap();
        assert_eq!(value.as_deref(), Some("dark"));
    }

    // ── set_setting_impl ──────────────────────────────────────────────────────

    #[tokio::test]
    async fn test_set_setting_upserts() {
        let pool = setup_test_db().await;
        set_setting_impl(&pool, "lang", "en").await.unwrap();
        set_setting_impl(&pool, "lang", "zh").await.unwrap();

        let value = get_setting_impl(&pool, "lang").await.unwrap();
        assert_eq!(
            value.as_deref(),
            Some("zh"),
            "Second set should overwrite first"
        );
    }

    #[tokio::test]
    async fn test_set_setting_empty_key_fails() {
        let pool = setup_test_db().await;
        let result = set_setting_impl(&pool, "  ", "some-value").await;
        assert!(result.is_err(), "Empty key should fail validation");
    }

    #[tokio::test]
    async fn test_set_and_get_multiple_settings() {
        let pool = setup_test_db().await;
        set_setting_impl(&pool, "a", "1").await.unwrap();
        set_setting_impl(&pool, "b", "2").await.unwrap();
        set_setting_impl(&pool, "c", "3").await.unwrap();

        assert_eq!(
            get_setting_impl(&pool, "a").await.unwrap().as_deref(),
            Some("1")
        );
        assert_eq!(
            get_setting_impl(&pool, "b").await.unwrap().as_deref(),
            Some("2")
        );
        assert_eq!(
            get_setting_impl(&pool, "c").await.unwrap().as_deref(),
            Some("3")
        );
    }

    #[tokio::test]
    async fn test_set_setting_empty_value_is_allowed() {
        let pool = setup_test_db().await;
        // Empty value is valid — it means the key is explicitly set to empty string.
        let result = set_setting_impl(&pool, "empty-val", "").await;
        assert!(result.is_ok(), "Setting an empty value should succeed");
        let value = get_setting_impl(&pool, "empty-val").await.unwrap();
        assert_eq!(value.as_deref(), Some(""));
    }
}
