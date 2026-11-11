//! Package manifest format and validation.

use serde::{Deserialize, Serialize};

use crate::error::CoreError;

/// Hard cap on a single artifact download. Package sources are untrusted
/// input; without a cap a hostile source could exhaust the disk.
pub const MAX_ARTIFACT_BYTES: u64 = 512 * 1024 * 1024;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ArtifactKind {
    SingleFile,
    TarGz,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PackageManifest {
    pub name: String,
    pub version: String,
    #[serde(default)]
    pub description: String,
    /// Package names, optionally pinned as `name@version`.
    #[serde(default)]
    pub dependencies: Vec<String>,
    /// Absolute local path, `file://` URL, or `http(s)://` URL.
    pub source: String,
    /// SHA-256 of the artifact as 64 hex characters.
    pub sha256: String,
    pub kind: ArtifactKind,
    /// Relative destination file name; required for SingleFile artifacts.
    #[serde(default)]
    pub dest_path: String,
}

impl PackageManifest {
    pub fn validate(&self) -> Result<(), CoreError> {
        validate_name(&self.name)?;
        validate_version(&self.version)?;
        for dep in &self.dependencies {
            validate_dependency(dep)?;
        }
        if self.sha256.len() != 64 || !self.sha256.chars().all(|c| c.is_ascii_hexdigit()) {
            return Err(CoreError::InvalidArgument(format!(
                "package '{}' sha256 must be 64 hex characters",
                self.name
            )));
        }
        if self.source.is_empty() {
            return Err(CoreError::InvalidArgument(format!(
                "package '{}' has no artifact source",
                self.name
            )));
        }
        if self.kind == ArtifactKind::SingleFile && self.dest_path.is_empty() {
            return Err(CoreError::InvalidArgument(format!(
                "package '{}' SingleFile artifacts need a dest_path",
                self.name
            )));
        }
        Ok(())
    }
}

pub fn validate_name(name: &str) -> Result<(), CoreError> {
    let ok = !name.is_empty()
        && name.len() <= 64
        && name
            .chars()
            .next()
            .is_some_and(|c| c.is_ascii_alphanumeric())
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_'));
    if ok {
        Ok(())
    } else {
        Err(CoreError::InvalidArgument(format!(
            "invalid package name '{name}'"
        )))
    }
}

pub fn validate_version(version: &str) -> Result<(), CoreError> {
    let ok = !version.is_empty()
        && version.len() <= 64
        && version
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_' | '+'));
    if ok {
        Ok(())
    } else {
        Err(CoreError::InvalidArgument(format!(
            "invalid package version '{version}'"
        )))
    }
}

pub fn validate_dependency(dep: &str) -> Result<(), CoreError> {
    match dep.split_once('@') {
        Some((name, version)) => {
            validate_name(name)?;
            validate_version(version)
        }
        None => validate_name(dep),
    }
}

/// Splits a dependency spec into name and optional pinned version.
#[must_use]
pub fn dependency_parts(dep: &str) -> (&str, Option<&str>) {
    match dep.split_once('@') {
        Some((name, version)) => (name, Some(version)),
        None => (dep, None),
    }
}
