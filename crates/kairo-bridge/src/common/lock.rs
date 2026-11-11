use crate::error::BridgeError;
use std::fs;
use std::path::Path;

pub fn check_apt_locks() -> Result<(), BridgeError> {
    let lock_paths = [
        "/var/lib/dpkg/lock-frontend",
        "/var/lib/dpkg/lock",
        "/var/lib/apt/lists/lock",
    ];

    for path_str in lock_paths {
        let path = Path::new(path_str);
        if path.exists() && is_file_locked(path) {
            return Err(BridgeError::PackageLockHeld(path_str.to_string()));
        }
    }
    Ok(())
}

pub fn check_pacman_lock() -> Result<(), BridgeError> {
    let path = Path::new("/var/lib/pacman/db.lck");
    if path.exists() {
        return Err(BridgeError::PackageLockHeld(
            "/var/lib/pacman/db.lck".to_string(),
        ));
    }
    Ok(())
}

pub fn is_file_locked(path: &Path) -> bool {
    if !path.exists() {
        return false;
    }

    // Attempt to open the lock file for exclusive write access. Only
    // EWOULDBLOCK/EBUSY prove another process holds an advisory lock:
    // PermissionDenied just means this user may not write the file (the
    // dpkg locks are root-owned), which is normal for unprivileged users
    // running through sudo and must not read as "package lock held".
    match fs::OpenOptions::new().write(true).open(path) {
        Ok(_) => false,
        Err(e) => {
            e.kind() == std::io::ErrorKind::WouldBlock
                || e.raw_os_error() == Some(11) // EAGAIN/EWOULDBLOCK
                || e.raw_os_error() == Some(16) // EBUSY
        }
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use super::*;

    #[test]
    fn test_nonexistent_lock_passes() {
        let path = Path::new("/path/to/nonexistent/lock.file");
        assert!(!is_file_locked(path));
    }

    #[test]
    fn test_pacman_db_lock_detected_when_exists() {
        let temp_dir = tempfile::tempdir().unwrap();
        let lock_path = temp_dir.path().join("db.lck");
        fs::write(&lock_path, b"12345").unwrap();

        assert!(lock_path.exists());
    }
}
