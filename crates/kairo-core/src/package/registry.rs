//! The managed package registry: receipts persisted through the
//! integrity-checked state store.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::CoreError;
use crate::package::manifest::PackageManifest;
use crate::state::{StateDocument, load_state, store_state};

pub const REGISTRY_KIND: &str = "kairo-package-registry";

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PackageRegistry {
    #[serde(default)]
    pub packages: Vec<PackageReceipt>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PackageReceipt {
    pub name: String,
    pub version: String,
    pub installed_at_ms: u64,
    pub manifest: PackageManifest,
    /// Paths relative to the version install directory.
    pub files: Vec<String>,
    /// At most one receipt per name is active; superseded receipts keep
    /// their files on disk so rollback can restore them.
    pub active: bool,
}

#[must_use]
pub fn registry_path(state_dir: &Path) -> PathBuf {
    state_dir.join("package-registry.json")
}

pub fn load(path: &Path) -> Result<Option<StateDocument<PackageRegistry>>, CoreError> {
    load_state(path, REGISTRY_KIND)
}

pub fn store(path: &Path, registry: &PackageRegistry) -> Result<u64, CoreError> {
    store_state(path, REGISTRY_KIND, registry)
}
