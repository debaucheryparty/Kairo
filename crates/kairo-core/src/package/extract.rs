//! Artifact extraction into the package install directory.
//!
//! Package artifacts are untrusted: tar members must stay inside the install
//! directory (no absolute paths, no `..`), links are rejected outright, and
//! the total unpacked size is capped.

use std::fs;
use std::io::Read;
use std::path::{Component, Path, PathBuf};

use flate2::read::GzDecoder;
use tar::{Archive, EntryType};

use crate::error::CoreError;
use crate::package::manifest::ArtifactKind;

const MAX_UNPACKED_BYTES: u64 = 2 * 1024 * 1024 * 1024;
const MAX_TAR_ENTRIES: usize = 100_000;

/// Extracts the artifact into `install_dir` and returns the relative file
/// paths that were written. `dest_rel` is the destination file name for
/// SingleFile artifacts and is ignored for archives.
pub fn extract(
    kind: &ArtifactKind,
    artifact: &Path,
    install_dir: &Path,
    dest_rel: &str,
) -> Result<Vec<String>, CoreError> {
    match kind {
        ArtifactKind::SingleFile => place_single(artifact, install_dir, dest_rel),
        ArtifactKind::TarGz => extract_tar_gz(artifact, install_dir),
    }
}

fn place_single(
    artifact: &Path,
    install_dir: &Path,
    dest_rel: &str,
) -> Result<Vec<String>, CoreError> {
    let rel = safe_relative_path(Path::new(dest_rel))?;
    let dest = install_dir.join(&rel);
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::copy(artifact, &dest)?;
    Ok(vec![rel.to_string_lossy().to_string()])
}

fn extract_tar_gz(artifact: &Path, install_dir: &Path) -> Result<Vec<String>, CoreError> {
    let file = fs::File::open(artifact)?;
    let mut archive = Archive::new(GzDecoder::new(file));
    archive.set_preserve_permissions(false);

    let mut written = Vec::new();
    let mut total_bytes: u64 = 0;

    for entry in archive.entries()? {
        let mut entry = entry?;
        if written.len() >= MAX_TAR_ENTRIES {
            return Err(CoreError::InvalidArgument(
                "package archive has too many entries".to_string(),
            ));
        }

        match entry.header().entry_type() {
            EntryType::Regular => {}
            EntryType::Directory => {
                let rel = safe_relative_path(&entry.path()?)?;
                fs::create_dir_all(install_dir.join(&rel))?;
                continue;
            }
            EntryType::Symlink | EntryType::Link | EntryType::Continuous => {
                return Err(CoreError::InvalidArgument(
                    "package archives must not contain links".to_string(),
                ));
            }
            // Pax/global metadata headers carry no payload; the tar crate
            // applies their settings to following entries automatically.
            EntryType::XHeader | EntryType::XGlobalHeader => continue,
            other => {
                return Err(CoreError::InvalidArgument(format!(
                    "unsupported tar entry type '{other:?}'"
                )));
            }
        }

        let rel = safe_relative_path(&entry.path()?)?;
        let size = entry.size();
        if total_bytes.saturating_add(size) > MAX_UNPACKED_BYTES {
            return Err(CoreError::InvalidArgument(
                "package exceeds the unpacked size limit".to_string(),
            ));
        }

        let dest = install_dir.join(&rel);
        if let Some(parent) = dest.parent() {
            fs::create_dir_all(parent)?;
        }
        {
            let mut out = fs::File::create(&dest)?;
            let mut limited = (&mut entry).take(size);
            std::io::copy(&mut limited, &mut out)?;
        }
        apply_executable_bit(&dest, entry.header().mode()?);
        total_bytes += size;
        written.push(rel.to_string_lossy().to_string());
    }

    Ok(written)
}

/// Rejects absolute paths and any `..` component (zip-slip).
fn safe_relative_path(entry_path: &Path) -> Result<PathBuf, CoreError> {
    if entry_path.is_absolute() || entry_path.has_root() {
        return Err(CoreError::InvalidArgument(
            "package archive contains an absolute path".to_string(),
        ));
    }
    let mut out = std::path::PathBuf::new();
    for component in entry_path.components() {
        match component {
            Component::Normal(c) => out.push(c),
            Component::CurDir => {}
            _ => {
                return Err(CoreError::InvalidArgument(
                    "package archive contains an unsafe path".to_string(),
                ));
            }
        }
    }
    if out.as_os_str().is_empty() {
        return Err(CoreError::InvalidArgument(
            "package archive contains an empty path".to_string(),
        ));
    }
    Ok(out)
}

fn apply_executable_bit(dest: &Path, mode: u32) {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if mode & 0o111 != 0 {
            let _ = fs::set_permissions(dest, fs::Permissions::from_mode(0o755));
        }
    }
    #[cfg(not(unix))]
    {
        let _ = (dest, mode);
    }
}
