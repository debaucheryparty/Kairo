//! Integrity-checked persistent state documents.
//!
//! Format: a JSON envelope `{kind, generation, data, checksum}` where the
//! checksum covers kind, generation and the canonical JSON of data. Writes
//! replace the file atomically via a sibling temp file. A single process is
//! assumed to own a given state file; concurrent writers from several
//! processes need external coordination.

use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize, de::DeserializeOwned};
use sha2::{Digest, Sha256};

use crate::error::CoreError;

#[derive(Debug, Clone)]
pub struct StateDocument<T> {
    pub generation: u64,
    pub data: T,
}

#[derive(Serialize, Deserialize)]
struct Envelope {
    kind: String,
    generation: u64,
    data: serde_json::Value,
    checksum: String,
}

fn checksum(kind: &str, generation: u64, data: &serde_json::Value) -> Result<String, CoreError> {
    let mut hasher = Sha256::new();
    hasher.update(kind.as_bytes());
    hasher.update(generation.to_le_bytes());
    hasher.update(serde_json::to_vec(data)?);
    Ok(format!("{:x}", hasher.finalize()))
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_millis() as u64)
}

fn quarantine(path: &Path) {
    let base = path.to_string_lossy().to_string();
    for attempt in 0..100 {
        let target = PathBuf::from(format!("{base}.corrupt-{}-{}", now_ms(), attempt));
        if fs::rename(path, &target).is_ok() {
            tracing::warn!(
                file = %path.display(),
                quarantined = %target.display(),
                "state file failed integrity check and was quarantined"
            );
            return;
        }
    }
    tracing::warn!(file = %path.display(), "could not quarantine corrupt state file");
}

pub fn load_state<T: DeserializeOwned>(
    path: &Path,
    kind: &str,
) -> Result<Option<StateDocument<T>>, CoreError> {
    let bytes = match fs::read(path) {
        Ok(b) => b,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(CoreError::Io(e)),
    };

    let envelope: Envelope = match serde_json::from_slice(&bytes) {
        Ok(e) => e,
        Err(_) => {
            quarantine(path);
            return Ok(None);
        }
    };

    if envelope.kind != kind {
        return Err(CoreError::InvalidArgument(format!(
            "state file '{}' has kind '{}' but '{}' was requested",
            path.display(),
            envelope.kind,
            kind
        )));
    }

    let expected = checksum(kind, envelope.generation, &envelope.data)?;
    if expected != envelope.checksum {
        quarantine(path);
        return Ok(None);
    }

    let data = serde_json::from_value(envelope.data).map_err(|e| {
        CoreError::InvalidArgument(format!(
            "state file '{}' data does not match the expected schema: {e}",
            path.display()
        ))
    })?;

    Ok(Some(StateDocument {
        generation: envelope.generation,
        data,
    }))
}

pub fn store_state<T: Serialize>(path: &Path, kind: &str, data: &T) -> Result<u64, CoreError> {
    let generation = match load_state::<serde_json::Value>(path, kind)? {
        Some(doc) => doc.generation,
        None => 0,
    } + 1;

    let data_value = serde_json::to_value(data)?;
    let envelope = Envelope {
        kind: kind.to_string(),
        generation,
        checksum: checksum(kind, generation, &data_value)?,
        data: data_value,
    };

    let bytes = serde_json::to_vec_pretty(&envelope)?;
    let tmp = path.with_file_name(format!(
        ".{}.tmp-{}-{}",
        path.file_name()
            .map_or_else(|| "state".to_string(), |n| n.to_string_lossy().to_string()),
        std::process::id(),
        now_ms(),
    ));

    fs::write(&tmp, &bytes)?;
    if let Err(e) = fs::rename(&tmp, path) {
        let _ = fs::remove_file(&tmp);
        return Err(CoreError::Io(e));
    }

    Ok(generation)
}
