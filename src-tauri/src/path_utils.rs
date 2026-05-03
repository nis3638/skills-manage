use std::ffi::OsString;
use std::path::{Path, PathBuf};

fn resolve_home_dir_from_env_vars(
    home: Option<OsString>,
    userprofile: Option<OsString>,
    homedrive: Option<OsString>,
    homepath: Option<OsString>,
) -> PathBuf {
    if let Some(home) = home.filter(|value| !value.is_empty()) {
        return PathBuf::from(home);
    }

    if let Some(userprofile) = userprofile.filter(|value| !value.is_empty()) {
        return PathBuf::from(userprofile);
    }

    if let (Some(homedrive), Some(homepath)) = (homedrive, homepath) {
        if !homedrive.is_empty() && !homepath.is_empty() {
            let combined = format!(
                "{}{}",
                homedrive.to_string_lossy(),
                homepath.to_string_lossy()
            );
            return PathBuf::from(combined);
        }
    }

    std::env::temp_dir()
}

pub fn resolve_home_dir() -> PathBuf {
    resolve_home_dir_from_env_vars(
        std::env::var_os("HOME"),
        std::env::var_os("USERPROFILE"),
        std::env::var_os("HOMEDRIVE"),
        std::env::var_os("HOMEPATH"),
    )
}

pub fn app_data_dir() -> PathBuf {
    resolve_home_dir().join(".skillsmanage")
}

pub fn central_skills_dir() -> PathBuf {
    resolve_home_dir().join(".agents").join("skills")
}

fn expand_home_path_with_home(path: &str, home_dir: &Path) -> PathBuf {
    let trimmed = path.trim();
    if trimmed == "~" {
        return home_dir.to_path_buf();
    }

    if let Some(rest) = trimmed
        .strip_prefix("~/")
        .or_else(|| trimmed.strip_prefix("~\\"))
    {
        return home_dir.join(rest);
    }

    PathBuf::from(trimmed)
}

pub fn expand_home_path(path: &str) -> PathBuf {
    expand_home_path_with_home(path, &resolve_home_dir())
}

pub fn path_to_string(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

/// Return the first candidate path (after `~` expansion) that exists on disk.
/// Useful for picking a sensible default among multiple known install locations
/// for a particular agent.
pub fn first_existing(candidates: &[&str]) -> Option<String> {
    let home = resolve_home_dir();
    for cand in candidates {
        let trimmed = cand.trim();
        if trimmed.is_empty() {
            continue;
        }
        let expanded = expand_home_path_with_home(trimmed, &home);
        if expanded.exists() {
            return Some(path_to_string(&expanded));
        }
    }
    None
}

/// Look up an executable in `PATH` and return its absolute path if found.
pub fn which_in_path(name: &str) -> Option<String> {
    let path_var = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&path_var) {
        let candidate = dir.join(name);
        if candidate.is_file() {
            return Some(path_to_string(&candidate));
        }
        // On Windows also try the .exe suffix.
        #[cfg(target_os = "windows")]
        {
            let win = dir.join(format!("{}.exe", name));
            if win.is_file() {
                return Some(path_to_string(&win));
            }
        }
    }
    None
}

/// Best-effort default install path for a given builtin agent ID.
///
/// Returns the first existing candidate among well-known locations for that
/// agent, or `None` if none of the candidates exist on disk. Used by
/// `builtin_agents()` to seed sensible defaults that the user can later
/// override via Settings.
pub fn default_install_path(agent_id: &str) -> Option<String> {
    // macOS-specific .app bundles for agents that ship as Mac apps.
    #[cfg(target_os = "macos")]
    {
        let mac_apps: &[(&str, &[&str])] = &[
            (
                "claude-code",
                &["/Applications/Claude.app", "~/Applications/Claude.app"],
            ),
            (
                "cursor",
                &["/Applications/Cursor.app", "~/Applications/Cursor.app"],
            ),
            (
                "windsurf",
                &["/Applications/Windsurf.app", "~/Applications/Windsurf.app"],
            ),
            (
                "trae",
                &["/Applications/Trae.app", "~/Applications/Trae.app"],
            ),
            (
                "trae-cn",
                &["/Applications/Trae CN.app", "~/Applications/Trae CN.app"],
            ),
            (
                "kiro",
                &["/Applications/Kiro.app", "~/Applications/Kiro.app"],
            ),
            (
                "qoder",
                &["/Applications/Qoder.app", "~/Applications/Qoder.app"],
            ),
            (
                "factory-droid",
                &["/Applications/Factory.app", "~/Applications/Factory.app"],
            ),
            (
                "junie",
                &["/Applications/Junie.app", "~/Applications/Junie.app"],
            ),
            (
                "codebuddy",
                &[
                    "/Applications/CodeBuddy.app",
                    "~/Applications/CodeBuddy.app",
                ],
            ),
        ];
        if let Some((_, paths)) = mac_apps.iter().find(|(id, _)| *id == agent_id) {
            if let Some(found) = first_existing(paths) {
                return Some(found);
            }
        }
    }

    // Cross-platform CLI binaries: prefer PATH lookup, then a few common dirs.
    let cli_name = match agent_id {
        "claude-code" => Some("claude"),
        "codex" => Some("codex"),
        "gemini-cli" => Some("gemini"),
        "qwen" => Some("qwen"),
        "amp" => Some("amp"),
        "aider" => Some("aider"),
        "opencode" => Some("opencode"),
        "kilocode" => Some("kilocode"),
        "ob1" => Some("ob1"),
        "augment" => Some("augment"),
        "copilot" => Some("gh"), // GitHub Copilot CLI ships under `gh copilot`
        _ => None,
    };

    if let Some(bin) = cli_name {
        if let Some(found) = which_in_path(bin) {
            return Some(found);
        }
        let fallback_dirs = [
            "~/.local/bin",
            "~/.cargo/bin",
            "~/.npm-global/bin",
            "/usr/local/bin",
            "/opt/homebrew/bin",
        ];
        let mut candidates: Vec<String> = Vec::new();
        for dir in &fallback_dirs {
            candidates.push(format!("{}/{}", dir, bin));
        }
        let refs: Vec<&str> = candidates.iter().map(|s| s.as_str()).collect();
        if let Some(found) = first_existing(&refs) {
            return Some(found);
        }
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_home_dir_prefers_home() {
        let resolved = resolve_home_dir_from_env_vars(
            Some(OsString::from("/tmp/home")),
            Some(OsString::from("/tmp/profile")),
            Some(OsString::from("C:")),
            Some(OsString::from("\\Users\\fallback")),
        );
        assert_eq!(resolved, PathBuf::from("/tmp/home"));
    }

    #[test]
    fn resolve_home_dir_falls_back_to_userprofile() {
        let resolved = resolve_home_dir_from_env_vars(
            None,
            Some(OsString::from("C:\\Users\\alice")),
            None,
            None,
        );
        assert_eq!(resolved, PathBuf::from("C:\\Users\\alice"));
    }

    #[test]
    fn resolve_home_dir_falls_back_to_home_drive_and_path() {
        let resolved = resolve_home_dir_from_env_vars(
            None,
            None,
            Some(OsString::from("C:")),
            Some(OsString::from("\\Users\\bob")),
        );
        assert_eq!(resolved, PathBuf::from("C:\\Users\\bob"));
    }

    #[test]
    fn expand_home_path_expands_unix_style_tilde() {
        let expanded = expand_home_path_with_home("~/.claude/skills", Path::new("/tmp/home"));
        assert_eq!(expanded, PathBuf::from("/tmp/home/.claude/skills"));
    }

    #[test]
    fn expand_home_path_expands_windows_style_tilde() {
        let expanded =
            expand_home_path_with_home("~\\.claude\\skills", Path::new("C:\\Users\\alice"));
        assert_eq!(expanded, PathBuf::from("C:\\Users\\alice/.claude\\skills"));
    }

    #[test]
    fn expand_home_path_leaves_absolute_paths_unchanged() {
        let expanded =
            expand_home_path_with_home("/opt/skills/custom", Path::new("/tmp/ignored-home"));
        assert_eq!(expanded, PathBuf::from("/opt/skills/custom"));
    }
}
