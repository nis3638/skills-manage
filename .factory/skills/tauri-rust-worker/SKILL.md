---
name: tauri-rust-worker
description: Implements Rust backend features for the Tauri v2 desktop app including commands, database, scanner, and linker.
---

# Tauri Rust Worker

NOTE: Startup and cleanup are handled by `worker-base`. This skill defines the WORK PROCEDURE.

## When to Use This Skill

Features involving:
- Tauri project scaffolding and configuration
- Rust backend logic (scanner, linker, agent registry)
- SQLite database schema, migrations, queries
- Tauri commands (`#[tauri::command]`)
- Cargo.toml dependencies and plugin configuration

## Required Skills

None.

## Work Procedure

1. **Read the feature description** carefully. Read `docs/desktop-design.md` for the full design spec. Read `.factory/library/architecture.md` for system context.

2. **Write tests first (TDD)**:
   - For Rust code: write `#[cfg(test)] mod tests` with failing test cases BEFORE implementation.
   - Use temp directories (`tempdir` crate) for filesystem tests (scanner, linker).
   - Test SKILL.md parsing with known frontmatter strings.
   - Test symlink creation and detection.

3. **Implement the feature**:
   - Follow Rust conventions: `Result<T, String>` for Tauri commands, serde for serialization.
   - All Tauri commands must be `async` and return `Result<T, String>`.
   - Register commands in `main.rs` via `.invoke_handler(tauri::generate_handler![...])`.
   - Use `tauri-plugin-sql` for database operations.
   - For filesystem operations, use `std::fs` and `std::os::unix::fs::symlink`.

4. **Verify**:
   - Run `cd src-tauri && cargo test` — all tests must pass.
   - Run `cd src-tauri && cargo clippy -- -D warnings` — no warnings.
   - Run `pnpm tauri dev` and verify the app launches without Rust panics.

5. **Manual verification**:
   - If the feature adds/changes Tauri commands, verify they're callable from the frontend by checking the dev console for errors.

## Example Handoff

```json
{
  "salientSummary": "Implemented scan_all_skills Tauri command that walks configured directories, parses SKILL.md frontmatter, detects symlinks via lstat, and persists to SQLite. Ran `cargo test` (12 passing) and verified app launches with sidebar populated.",
  "whatWasImplemented": "Added scanner.rs with walk_directory(), parse_skill_md(), detect_link_type() functions. Added scan_all_skills Tauri command. SQLite insert/upsert for skills and skill_installations tables. Registered command in main.rs.",
  "whatWasLeftUndone": "",
  "verification": {
    "commandsRun": [
      { "command": "cd src-tauri && cargo test", "exitCode": 0, "observation": "12 tests passed including scanner, parser, and linker tests" },
      { "command": "cd src-tauri && cargo clippy -- -D warnings", "exitCode": 0, "observation": "No warnings" },
      { "command": "pnpm tauri dev", "exitCode": 0, "observation": "App launched, sidebar showed 3 platforms with skills" }
    ],
    "interactiveChecks": [
      { "action": "Launched app and waited for scan", "observed": "Sidebar populated with Claude Code (5), Cursor (3), Central Skills (8)" }
    ]
  },
  "tests": {
    "added": [
      {
        "file": "src-tauri/src/commands/scanner.rs",
        "cases": [
          { "name": "test_parse_skill_md_valid", "verifies": "Parses name and description from valid SKILL.md" },
          { "name": "test_parse_skill_md_missing_fields", "verifies": "Returns None for SKILL.md without required fields" },
          { "name": "test_detect_symlink", "verifies": "Correctly identifies symlinks vs real directories" },
          { "name": "test_scan_directory_recursive", "verifies": "Finds SKILL.md files in nested directories" }
        ]
      }
    ]
  },
  "discoveredIssues": []
}
```

## When to Return to Orchestrator

- Tauri plugin version conflicts that can't be resolved
- Need to change the SQLite schema in a way that affects other features
- Build fails due to Rust toolchain issues
