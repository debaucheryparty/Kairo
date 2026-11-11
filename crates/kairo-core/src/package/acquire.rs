//! Artifact acquisition: local paths and http(s) URLs, streamed to a temp
//! file while hashing, capped at MAX_ARTIFACT_BYTES.

use std::fs::File;
use std::io::{Read, Write};
use std::path::Path;
use std::time::Duration;

use sha2::{Digest, Sha256};

use crate::error::CoreError;
use crate::package::manifest::MAX_ARTIFACT_BYTES;

const HTTP_TIMEOUT: Duration = Duration::from_secs(60);

/// Returns the SHA-256 hex digest of the acquired artifact.
pub fn acquire(source: &str, dest: &Path) -> Result<String, CoreError> {
    let mut hasher = Sha256::new();
    let mut remaining = MAX_ARTIFACT_BYTES;

    if let Some(path) = local_path(source) {
        let file = File::open(path)
            .map_err(|e| CoreError::InvalidArgument(format!("artifact source '{source}': {e}")))?;
        copy_hashed(file, dest, &mut hasher, &mut remaining)?;
    } else if source.starts_with("http://") || source.starts_with("https://") {
        let agent = ureq::AgentBuilder::new()
            .timeout_read(HTTP_TIMEOUT)
            .timeout_connect(HTTP_TIMEOUT)
            .build();
        let response = agent
            .get(source)
            .call()
            .map_err(|e| CoreError::InvalidArgument(format!("artifact fetch '{source}': {e}")))?;
        copy_hashed(response.into_reader(), dest, &mut hasher, &mut remaining)?;
    } else {
        return Err(CoreError::InvalidArgument(format!(
            "unsupported artifact source '{source}'"
        )));
    }

    Ok(format!("{:x}", hasher.finalize()))
}

fn local_path(source: &str) -> Option<&Path> {
    if let Some(rest) = source.strip_prefix("file://") {
        let rest = if cfg!(windows) {
            rest.trim_start_matches('/')
        } else {
            rest
        };
        return Some(Path::new(rest));
    }
    let looks_absolute = source.starts_with('/')
        || source.starts_with("\\\\")
        || (source.len() > 2 && source.as_bytes()[1] == b':');
    looks_absolute.then_some(Path::new(source))
}

fn copy_hashed(
    mut reader: impl Read,
    dest: &Path,
    hasher: &mut Sha256,
    remaining: &mut u64,
) -> Result<(), CoreError> {
    let mut out = File::create(dest)?;
    let mut buf = [0u8; 64 * 1024];
    loop {
        let n = reader.read(&mut buf)?;
        if n == 0 {
            return Ok(());
        }
        if *remaining < n as u64 {
            return Err(CoreError::InvalidArgument(
                "artifact exceeds the acquisition size limit".to_string(),
            ));
        }
        *remaining -= n as u64;
        hasher.update(&buf[..n]);
        out.write_all(&buf[..n])?;
    }
}
