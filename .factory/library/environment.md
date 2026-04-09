# Environment

## Required Tools
- Rust 1.88+ / Cargo 1.91+
- Node.js 24+ / pnpm 10+
- Tauri CLI v2 (@tauri-apps/cli as devDependency)

## Key Paths
- Project root: `/Users/happypeet/Documents/GitHubMe/skills-manage`
- App data: `~/.skillsmanage/db.sqlite`
- Central Skills: `~/.agents/skills/`
- Reference project: `./reference/skillsgate/` (read-only reference, do not modify)

## Notes
- macOS is the primary target. Use `cfg!(target_os = "macos")` guards where needed.
- On macOS, symlinks work natively; on Windows use `junction` type.
- Tauri dev server runs on port 1420 by default.
- The `reference/` directory is in .gitignore — it is not part of the project source.
