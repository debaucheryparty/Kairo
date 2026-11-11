use kairo_protocol::v1::{OsFamily, PlatformSupportTier};
use std::fs;
use sysinfo::System;
use tracing::debug;

pub struct OsRelease {
    pub family: OsFamily,
    pub id: String,
    pub name: String,
    pub version: String,
    pub version_id: String,
    pub pretty_name: String,
    pub support_tier: PlatformSupportTier,
    pub native_adapter_available: bool,
}

impl Default for OsRelease {
    fn default() -> Self {
        Self {
            family: os_family(),
            id: String::new(),
            name: String::new(),
            version: String::new(),
            version_id: String::new(),
            pretty_name: String::new(),
            support_tier: PlatformSupportTier::Unspecified,
            native_adapter_available: false,
        }
    }
}

pub fn detect() -> OsRelease {
    if cfg!(target_os = "linux") {
        detect_linux()
    } else if cfg!(target_os = "windows") {
        detect_windows()
    } else if cfg!(target_os = "macos") {
        detect_macos()
    } else {
        OsRelease::default()
    }
}

pub fn hostname() -> String {
    System::host_name().unwrap_or_else(|| {
        #[cfg(unix)]
        {
            read_file_trimmed("/etc/hostname").unwrap_or_default()
        }
        #[cfg(windows)]
        {
            std::env::var("COMPUTERNAME").unwrap_or_default()
        }
        #[cfg(not(any(unix, windows)))]
        {
            String::new()
        }
    })
}

fn detect_linux() -> OsRelease {
    let contents = match fs::read_to_string("/etc/os-release") {
        Ok(c) => c,
        Err(e) => {
            debug!(error = %e, "could not read /etc/os-release");
            return OsRelease {
                family: OsFamily::Linux,
                support_tier: PlatformSupportTier::Unspecified,
                native_adapter_available: false,
                ..Default::default()
            };
        }
    };

    let mut release = parse_os_release_str(&contents);
    release.support_tier = classify_tier(&release.id);
    // Adapters are built in M2; discovery honestly reports false currently.
    release.native_adapter_available = false;
    release
}

fn detect_windows() -> OsRelease {
    let long_name = System::long_os_version().unwrap_or_else(|| "Windows".to_string());
    let ver = System::os_version().unwrap_or_default();

    OsRelease {
        family: OsFamily::Windows,
        id: "windows".to_string(),
        name: "Windows".to_string(),
        version: ver.clone(),
        version_id: ver,
        pretty_name: long_name,
        support_tier: PlatformSupportTier::Tier3,
        native_adapter_available: false,
    }
}

fn detect_macos() -> OsRelease {
    let long_name = System::long_os_version().unwrap_or_else(|| "macOS".to_string());
    let ver = System::os_version().unwrap_or_default();

    OsRelease {
        family: OsFamily::Macos,
        id: "macos".to_string(),
        name: "macOS".to_string(),
        version: ver.clone(),
        version_id: ver,
        pretty_name: long_name,
        support_tier: PlatformSupportTier::Tier3,
        native_adapter_available: false,
    }
}

pub fn classify_tier(distro_id: &str) -> PlatformSupportTier {
    match distro_id.to_lowercase().as_str() {
        "ubuntu" | "debian" | "arch" | "archarm" => PlatformSupportTier::Tier1,
        "parrot" | "fedora" | "alpine" | "almalinux" | "rocky" | "centos" | "opensuse" => {
            PlatformSupportTier::Tier2
        }
        "windows" | "macos" | "darwin" => PlatformSupportTier::Tier3,
        _ => PlatformSupportTier::Unspecified,
    }
}

fn os_family() -> OsFamily {
    if cfg!(target_os = "linux") {
        OsFamily::Linux
    } else if cfg!(target_os = "windows") {
        OsFamily::Windows
    } else if cfg!(target_os = "macos") {
        OsFamily::Macos
    } else {
        OsFamily::Unknown
    }
}

#[cfg(unix)]
fn read_file_trimmed(path: &str) -> Option<String> {
    fs::read_to_string(path)
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

pub(crate) fn parse_os_release_str(contents: &str) -> OsRelease {
    let mut release = OsRelease {
        family: OsFamily::Linux,
        ..Default::default()
    };

    for line in contents.lines() {
        let Some((key, raw_value)) = line.split_once('=') else {
            continue;
        };
        let value = raw_value.trim_matches('"').to_string();
        match key.trim() {
            "ID" => release.id = value.to_lowercase(),
            "NAME" => release.name = value,
            "VERSION" => release.version = value,
            "VERSION_ID" => release.version_id = value,
            "PRETTY_NAME" => release.pretty_name = value,
            _ => {}
        }
    }

    release.support_tier = classify_tier(&release.id);
    release
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_detect_runs_without_panic() {
        let release = detect();
        let _ = release.id;
        let _ = release.family;
        assert!(!release.native_adapter_available);
    }

    #[test]
    fn test_parse_os_release_ubuntu() {
        let contents = r#"
ID=ubuntu
NAME="Ubuntu"
VERSION="24.04 LTS (Noble Numbat)"
VERSION_ID="24.04"
PRETTY_NAME="Ubuntu 24.04 LTS"
"#;
        let release = parse_os_release_str(contents);
        assert_eq!(release.id, "ubuntu");
        assert_eq!(release.version_id, "24.04");
        assert_eq!(release.pretty_name, "Ubuntu 24.04 LTS");
        assert_eq!(release.family as i32, OsFamily::Linux as i32);
        assert_eq!(
            release.support_tier as i32,
            PlatformSupportTier::Tier1 as i32
        );
    }

    #[test]
    fn test_parse_os_release_arch() {
        let contents = r#"
ID=arch
NAME="Arch Linux"
PRETTY_NAME="Arch Linux"
VERSION_ID=rolling
"#;
        let release = parse_os_release_str(contents);
        assert_eq!(release.id, "arch");
        assert_eq!(release.version_id, "rolling");
        assert_eq!(
            release.support_tier as i32,
            PlatformSupportTier::Tier1 as i32
        );
    }

    #[test]
    fn test_parse_os_release_debian() {
        let contents = r#"
ID=debian
NAME="Debian GNU/Linux"
VERSION="12 (bookworm)"
VERSION_ID="12"
PRETTY_NAME="Debian GNU/Linux 12 (bookworm)"
"#;
        let release = parse_os_release_str(contents);
        assert_eq!(release.id, "debian");
        assert_eq!(release.version_id, "12");
        assert_eq!(
            release.support_tier as i32,
            PlatformSupportTier::Tier1 as i32
        );
    }

    #[test]
    fn test_parse_os_release_parrot() {
        let contents = r#"
ID=parrot
ID_LIKE=debian
NAME="Parrot OS"
VERSION="5.3"
VERSION_ID="5.3"
PRETTY_NAME="Parrot OS 5.3 (Electro Ara)"
"#;
        let release = parse_os_release_str(contents);
        assert_eq!(release.id, "parrot");
        assert_eq!(release.version_id, "5.3");
        assert_eq!(
            release.support_tier as i32,
            PlatformSupportTier::Tier2 as i32
        );
    }

    #[test]
    fn test_unsupported_distribution_tier() {
        let tier = classify_tier("unknown-niche-linux");
        assert_eq!(tier as i32, PlatformSupportTier::Unspecified as i32);
    }

    #[test]
    fn test_empty_os_release_is_graceful() {
        let release = parse_os_release_str("");
        assert_eq!(release.family as i32, OsFamily::Linux as i32);
        assert!(release.id.is_empty());
        assert_eq!(
            release.support_tier as i32,
            PlatformSupportTier::Unspecified as i32
        );
    }

    #[test]
    fn test_hostname_does_not_panic() {
        let _ = hostname();
    }
}
