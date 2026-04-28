# Changelog

All notable changes to this project will be documented in this file.

## 0.9.4 - 2026-04-28

Feature release for the project-discovery scan-roots dialog: users can now add their own scan paths, copy any path to the clipboard, and long paths render with a middle ellipsis instead of overflowing.

### Features

- **Custom scan roots**: new "+ Add path" button in the Discover rescan dialog opens a native directory picker. Added paths are persisted in SQLite (`discover_scan_roots_config`) and merged with the built-in defaults.
- **Remove custom roots**: each user-added row has a ✕ button to delete it; built-in defaults can still only be enabled/disabled.
- **Copy path**: every scan-root row now has a copy icon button that writes the full path to the clipboard with a toast confirmation. The path text also shows the full value via the native `title` tooltip on hover.

### Improvements

- The scan-roots persisted config format upgraded from `HashMap<path, enabled>` to `{ overrides, custom }`. Legacy configs are auto-migrated transparently on read.
- Long paths in the dialog now render with a middle ellipsis (RTL truncation on the head + always-visible basename) and the dialog max width grew from `lg` to `2xl` for better breathing room.
- Added `min-w-0` constraints throughout the dialog grid/flex chain so the dialog no longer expands past its `max-w` when a path is wider than the available column.

### Backend

- New IPC commands `add_scan_root` and `remove_scan_root` (`src-tauri/src/commands/discover.rs`) with absolute-path / existence / directory validation and dedup against built-in defaults.
- `ScanRoot` gains an `is_custom: bool` field so the UI can distinguish user-added paths from defaults.
- New `ScanRootsConfig` struct + `load_scan_roots_config` / `save_scan_roots_config` helpers; `get_scan_roots` and `set_scan_root_enabled` rewritten on top of them.

### Tests

- 3 new Rust tests: `test_add_and_remove_custom_scan_root`, `test_add_scan_root_rejects_invalid_paths`, `test_legacy_config_format_is_parsed`.
- Existing `ScanRoot` literals in `discover.rs` tests updated for the new field.
- `src/test/DiscoverView.test.tsx` mock state extended with `addScanRoot` / `removeScanRoot`.

## 0.9.3 - 2026-04-28

Feature release: the central skills directory is configurable from the UI, and downstream commands honour the configured path.

### Features

- New **Central Skills Directory** card in Settings with input + Save + post-save rescan.
- `set_central_skills_dir` Tauri command + DB helper `update_central_skills_dir`.
- New `write_skill_to_central` command for Marketplace preview installs (replaces the previous `BaseDirectory.Home` hardcoded path).

### Improvements

- Marketplace install (`install_marketplace_skill`, `write_skill_to_central`) and project discovery (`start_project_scan`) now read the configured central directory from the DB instead of the default constant.
- Central library empty-state hint and Marketplace preview install reflect the configured directory.
- `seed_builtin_agents` no longer overwrites the user-customised `central` agent path on every startup.

### Tests

- `SettingsView.test.tsx` "saves the github pat from settings" now scopes its `保存` lookup to the GitHub PAT card so it does not collide with the new central-directory Save button.

## 0.9.2 - 2026-04-27

Maintenance release that makes the central skills library scanner recursive.

### Improvements

- `scan_directory` now walks the central directory recursively, so skills nested at any depth (for example `~/skills/src/shared/<skill>/SKILL.md`) are picked up automatically.
- Recursion stops at any directory that already contains `SKILL.md`, so a skill's own subfolders are not re-scanned as separate skills.
- Added skip rules for hidden directories (`.git`, `.cache`, ...) and well-known heavy directories (`node_modules`, `dist`, `build`, `target`, `__pycache__`).
- Added cycle protection via a canonicalised visited-path set plus a hard depth cap of 16.

### Tests

- Replaced the legacy `test_scan_directory_is_not_recursive` assertion with three new tests covering recursive discovery, no-descend-into-a-skill, and the new skip rules.

## 0.9.1 - 2026-04-23

Maintenance release focused on full-path display consistency and small README polish.

### Fixes

- Show full absolute paths in Central, Platform, Settings, Global Search, and platform-edit flows instead of collapsing paths to `~`.
- Render Windows paths with drive letters and backslashes in display-oriented UI surfaces.
- Keep auto-generated custom platform paths aligned with the detected home-directory style on each platform.

### Improvements

- Add a `Star History` section to the English and Chinese READMEs.
- Extend path helper tests and affected UI assertions to cover the new display rules.

## 0.9.0 - 2026-04-23

Cross-platform release centered on Windows support, universal macOS packaging, and reliability fixes.

### Highlights

- Add Windows x64 desktop support with `.msi` installer and portable `.zip` package outputs.
- Upgrade macOS packaging to universal builds with `.dmg`, `.zip`, and `.tar.gz` release artifacts.

### Features

- Add Windows-aware home and path handling across backend commands, scan-directory settings, and frontend path displays.
- Add automatic install fallback from symlink to copy on Windows when symlink creation is blocked.
- Add GitHub Actions packaging and release automation for Windows x64 and macOS universal desktop builds.

### Fixes

- Preserve Claude source-specific platform rows, detail actions, and explanation content across reloads and rescans.
- Refresh central, platform, and discover surfaces more reliably after global rescans.
- Improve path labels, sidebar/detail continuity, and a set of small accessibility and interaction refinements across settings and skill views.

## 0.8.0 - 2026-04-20

First public release.

### Features

- Launch `skills-manage` as a Tauri desktop app for managing AI agent skills across built-in and custom platforms from one place.
- Add platform and central skill views with install, uninstall, symlink-aware status, and canonical skill management.
- Add a full skill detail experience with markdown preview, in-place drawer navigation, install actions, and collection-aware workflows.
- Add collections management, custom platform settings, configurable scan roots, onboarding, toast feedback, and a responsive sidebar.
- Add Chinese and English UI support, a Catppuccin multi-flavor theme system, accent color controls, and a global command palette.
- Add project-level Discover scanning with recursive search, cached results, stop-scan controls, import to central, and improved navigation context.
- Add marketplace browsing, preview drawers, auto-centralized installs, and AI-generated skill explanations.
- Add GitHub repository import with preview, mirror fallback retries, optional authenticated requests, selection persistence, and post-import platform install flows.

### Performance

- Improve global search, central search, and project skill browsing with deferred queries, lazy indexing, lighter search result cards, and list virtualization for large datasets.

### Fixes

- Harden AI explanation generation by rejecting blank cached content and re-generating corrupted empty explanations.
- Improve frontmatter handling by extracting structured metadata such as `name`, `description`, and `version` instead of leaking raw YAML into markdown previews.
- Show existing collection membership in skill details and preselect already-added collections in add-to-collection flows.
- Refine detail drawer, marketplace preview, and GitHub import layouts to preserve context and reduce navigation friction.
