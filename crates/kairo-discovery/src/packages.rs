use crate::process_util::run_with_timeout;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Duration;
use tracing::debug;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DetectedPackageReport {
    pub name: String,
    pub version: String,
    pub is_usable: bool,
    pub path: String,
}

pub fn detect() -> Vec<DetectedPackageReport> {
    CANDIDATES
        .iter()
        .filter_map(|&(name, arg)| probe(name, arg))
        .collect()
}

const CANDIDATES: &[(&str, &str)] = &[
    ("apt", "--version"),
    ("apt-get", "--version"),
    ("pacman", "--version"),
    ("dnf", "--version"),
    ("zypper", "--version"),
    ("apk", "--version"),
    ("yum", "--version"),
    ("brew", "--version"),
    ("winget", "--version"),
    ("nix", "--version"),
    ("flatpak", "--version"),
    ("snap", "--version"),
];

fn find_executable_path(name: &str) -> Option<PathBuf> {
    let path_var = std::env::var("PATH").ok()?;
    for dir in std::env::split_paths(&path_var) {
        let full = dir.join(name);
        if is_executable_file(&full) {
            return Some(full);
        }
        #[cfg(windows)]
        {
            let exe = dir.join(format!("{name}.exe"));
            if is_executable_file(&exe) {
                return Some(exe);
            }
            let cmd = dir.join(format!("{name}.cmd"));
            if is_executable_file(&cmd) {
                return Some(cmd);
            }
        }
    }
    None
}

fn is_executable_file(path: &Path) -> bool {
    if !path.is_file() {
        return false;
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(meta) = path.metadata() {
            return meta.permissions().mode() & 0o111 != 0;
        }
        false
    }

    #[cfg(not(unix))]
    {
        true
    }
}

fn probe(name: &str, version_arg: &str) -> Option<DetectedPackageReport> {
    let binary_path = find_executable_path(name)?;
    let path_str = binary_path.to_string_lossy().to_string();

    let mut cmd = Command::new(&binary_path);
    cmd.arg(version_arg);

    // Strict 1-second timeout prevents any hang
    let output = run_with_timeout(cmd, Duration::from_millis(1000));

    let version = match output {
        Some(out) if out.status.success() || !out.stdout.is_empty() => extract_version(&out.stdout)
            .or_else(|| extract_version(&out.stderr))
            .unwrap_or_default(),
        _ => {
            debug!(
                pkg_manager = name,
                "executable found but version query returned no output"
            );
            String::new()
        }
    };

    debug!(pkg_manager = name, path = %path_str, version = %version, "detected package manager");

    Some(DetectedPackageReport {
        name: name.to_string(),
        version,
        is_usable: true,
        path: path_str,
    })
}

fn extract_version(bytes: &[u8]) -> Option<String> {
    let text = String::from_utf8_lossy(bytes);
    let first_line = text.lines().next()?.trim();
    if first_line.is_empty() {
        return None;
    }
    Some(first_line.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_detect_returns_vec() {
        let managers = detect();
        for m in &managers {
            assert!(!m.name.is_empty());
            assert!(!m.path.is_empty());
        }
    }

    #[test]
    fn test_extract_version_parses_first_line() {
        let bytes = b"apt 2.4.11 (amd64)\nmore output";
        let v = extract_version(bytes);
        assert_eq!(v.as_deref(), Some("apt 2.4.11 (amd64)"));
    }

    #[test]
    fn test_extract_version_empty_input() {
        assert!(extract_version(b"").is_none());
    }

    #[test]
    fn test_find_executable_nonexistent() {
        assert!(find_executable_path("kairo-missing-pkg-mgr-xyz-123").is_none());
    }

    #[test]
    fn test_candidate_names_unique() {
        let names: Vec<&str> = CANDIDATES.iter().map(|(n, _)| *n).collect();
        let mut seen = std::collections::HashSet::new();
        for name in &names {
            assert!(seen.insert(name), "duplicate candidate: {name}");
        }
    }
}
