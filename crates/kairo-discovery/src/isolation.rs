use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct IsolationReport {
    pub cgroup_v2: bool,
    pub cgroup_v1: bool,
    pub cgroup_controllers: Vec<String>,
    pub user_namespaces: bool,
    pub pid_namespaces: bool,
    pub mount_namespaces: bool,
    pub network_namespaces: bool,
    pub unprivileged_user_namespaces_allowed: bool,
    pub restriction_reason: String,
}

pub fn detect() -> IsolationReport {
    if !cfg!(target_os = "linux") {
        return IsolationReport {
            restriction_reason: "Platform does not use Linux namespaces or cgroups".to_string(),
            ..Default::default()
        };
    }

    let (cgroup_v2, cgroup_v1, cgroup_controllers) = detect_cgroups();
    let (user_namespaces, pid_namespaces, mount_namespaces, network_namespaces) =
        detect_namespaces();
    let (unprivileged_user_namespaces_allowed, restriction_reason) =
        detect_unprivileged_userns_restrictions(user_namespaces);

    IsolationReport {
        cgroup_v2,
        cgroup_v1,
        cgroup_controllers,
        user_namespaces,
        pid_namespaces,
        mount_namespaces,
        network_namespaces,
        unprivileged_user_namespaces_allowed,
        restriction_reason,
    }
}

fn detect_cgroups() -> (bool, bool, Vec<String>) {
    let controllers_file = Path::new("/sys/fs/cgroup/cgroup.controllers");
    if controllers_file.exists() {
        let controllers = fs::read_to_string(controllers_file)
            .map(|s| s.split_whitespace().map(String::from).collect())
            .unwrap_or_default();
        return (true, false, controllers);
    }

    let cgroup_v1_legacy = Path::new("/sys/fs/cgroup/memory").exists()
        || Path::new("/sys/fs/cgroup/cpu").exists()
        || Path::new("/proc/cgroups").exists();

    (false, cgroup_v1_legacy, Vec::new())
}

fn detect_namespaces() -> (bool, bool, bool, bool) {
    let ns_dir = Path::new("/proc/self/ns");
    if !ns_dir.exists() {
        return (false, false, false, false);
    }

    let user = ns_dir.join("user").exists();
    let pid = ns_dir.join("pid").exists();
    let mnt = ns_dir.join("mnt").exists();
    let net = ns_dir.join("net").exists();

    (user, pid, mnt, net)
}

fn detect_unprivileged_userns_restrictions(user_ns_supported: bool) -> (bool, String) {
    if !user_ns_supported {
        return (false, "Kernel lacks CONFIG_USER_NS".to_string());
    }

    // Debian / hardened kernel restriction check
    if let Ok(val) = fs::read_to_string("/proc/sys/kernel/unprivileged_userns_clone")
        && val.trim() == "0"
    {
        return (
            false,
            "Disabled via kernel.unprivileged_userns_clone sysctl".to_string(),
        );
    }

    // Zero limit restriction check
    if let Ok(val) = fs::read_to_string("/proc/sys/user/max_user_namespaces")
        && val.trim() == "0"
    {
        return (
            false,
            "Disabled via user.max_user_namespaces sysctl (limit is 0)".to_string(),
        );
    }

    // Ubuntu 24.04+ AppArmor unprivileged user namespace restriction
    if let Ok(val) = fs::read_to_string("/proc/sys/kernel/apparmor_restrict_unprivileged_userns")
        && val.trim() == "1"
    {
        return (
            false,
            "Restricted by AppArmor unprivileged userns policy".to_string(),
        );
    }

    (true, String::new())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_detect_does_not_panic() {
        let rep = detect();
        let _ = rep.cgroup_v2;
    }

    #[test]
    fn test_unprivileged_userns_restrictions_with_no_support() {
        let (allowed, reason) = detect_unprivileged_userns_restrictions(false);
        assert!(!allowed);
        assert!(reason.contains("CONFIG_USER_NS"));
    }

    #[test]
    fn test_unprivileged_userns_parsing_logic() {
        assert_eq!(
            detect_unprivileged_userns_restrictions(false),
            (false, "Kernel lacks CONFIG_USER_NS".to_string())
        );
    }
}
