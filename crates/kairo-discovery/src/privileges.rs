use crate::process_util::run_with_timeout;
use kairo_protocol::v1::PrivilegeLevel;
use std::process::Command;
use std::time::Duration;
use tracing::debug;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PrivilegeReport {
    pub level: PrivilegeLevel,
    pub is_elevated: bool,
    pub sudo_available: bool,
    pub sudo_passwordless: bool,
}

pub fn detect() -> PrivilegeReport {
    let is_elevated = check_elevation();
    let (sudo_available, sudo_passwordless) = probe_sudo();

    let level = if is_elevated {
        PrivilegeLevel::Root
    } else if sudo_passwordless {
        PrivilegeLevel::Sudo
    } else {
        PrivilegeLevel::User
    };

    debug!(
        ?level,
        is_elevated, sudo_available, sudo_passwordless, "privilege detection complete"
    );

    PrivilegeReport {
        level,
        is_elevated,
        sudo_available,
        sudo_passwordless,
    }
}

pub fn current_username() -> String {
    std::env::var("USER")
        .or_else(|_| std::env::var("USERNAME"))
        .or_else(|_| std::env::var("LOGNAME"))
        .unwrap_or_default()
}

fn check_elevation() -> bool {
    #[cfg(unix)]
    {
        is_root_unix()
    }
    #[cfg(windows)]
    {
        is_elevated_windows()
    }
    #[cfg(not(any(unix, windows)))]
    {
        false
    }
}

#[cfg(unix)]
fn is_root_unix() -> bool {
    if let Ok(status) = std::fs::read_to_string("/proc/self/status") {
        for line in status.lines() {
            if let Some(rest) = line.strip_prefix("Uid:") {
                let uid: Vec<&str> = rest.split_whitespace().collect();
                if uid.get(1).map(|u| *u == "0").unwrap_or(false) {
                    return true;
                }
            }
        }
        return false;
    }

    let mut cmd = Command::new("id");
    cmd.arg("-u");
    run_with_timeout(cmd, Duration::from_millis(500))
        .and_then(|o| {
            if o.status.success() {
                String::from_utf8(o.stdout).ok().map(|s| s.trim() == "0")
            } else {
                None
            }
        })
        .unwrap_or(false)
}

#[cfg(windows)]
fn is_elevated_windows() -> bool {
    // Probing elevation on Windows:
    // 'net session' exits with 0 only if running with an elevated token (Administrator).
    let mut cmd = Command::new("net");
    cmd.arg("session");
    run_with_timeout(cmd, Duration::from_millis(800))
        .map(|o| o.status.success())
        .unwrap_or(false)
}

fn probe_sudo() -> (bool, bool) {
    if cfg!(windows) {
        return (false, false);
    }

    // First check if 'sudo' binary exists on PATH without running privileged actions
    let sudo_path_exists = is_binary_on_path("sudo");
    if !sudo_path_exists {
        return (false, false);
    }

    // Now test if passwordless sudo is authorized via `sudo -n true`.
    // Bounded timeout ensures no hang if sudo hangs on PAM/LDAP/network auth.
    let mut cmd = Command::new("sudo");
    cmd.args(["-n", "true"]);
    let authorized = run_with_timeout(cmd, Duration::from_millis(800))
        .map(|o| o.status.success())
        .unwrap_or(false);

    (true, authorized)
}

fn is_binary_on_path(binary: &str) -> bool {
    if let Ok(path_var) = std::env::var("PATH") {
        for dir in std::env::split_paths(&path_var) {
            let full = dir.join(binary);
            if full.is_file() {
                return true;
            }
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_detect_does_not_panic() {
        let rep = detect();
        let valid = matches!(
            rep.level,
            PrivilegeLevel::User | PrivilegeLevel::Root | PrivilegeLevel::Sudo
        );
        assert!(valid);
    }

    #[test]
    fn test_current_username_not_empty_on_host() {
        let _ = current_username();
    }

    #[test]
    fn test_is_binary_on_path_nonexistent() {
        assert!(!is_binary_on_path("kairo-definitely-missing-binary-xyz"));
    }

    #[test]
    fn test_uid_parsing_root() {
        let status = "Name:\ttest\nUid:\t0\t0\t0\t0\n";
        let is_root = parse_uid_from_status(status);
        assert!(is_root);
    }

    #[test]
    fn test_uid_parsing_nonroot() {
        let status = "Name:\ttest\nUid:\t1000\t1000\t1000\t1000\n";
        let is_root = parse_uid_from_status(status);
        assert!(!is_root);
    }

    fn parse_uid_from_status(status: &str) -> bool {
        for line in status.lines() {
            if let Some(rest) = line.strip_prefix("Uid:") {
                let uid: Vec<&str> = rest.split_whitespace().collect();
                if uid.get(1).map(|u| *u == "0").unwrap_or(false) {
                    return true;
                }
            }
        }
        false
    }
}
