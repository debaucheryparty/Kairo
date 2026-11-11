//! The managed userspace: a fixed directory layout under the managed root
//! plus a persistent manifest describing it. All Kairo-managed content
//! (packages, services, configuration, logs) lives inside this layout, which
//! is what keeps managed resources separable from host resources.

use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

use crate::error::CoreError;
use crate::state::{StateDocument, load_state, store_state};

const LAYOUT_DIRS: [&str; 7] = [
    "config", "packages", "services", "state", "logs", "cache", "tmp",
];
const STATE_KIND: &str = "kairo-userspace";
const SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct UserspaceState {
    pub schema_version: u32,
    pub created_at_ms: u64,
    pub directories: Vec<String>,
}

pub struct ManagedUserspace {
    root: PathBuf,
    state: StateDocument<UserspaceState>,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_millis() as u64)
}

impl ManagedUserspace {
    /// Creates the layout if needed and loads or initializes the manifest.
    /// Running init repeatedly is idempotent: an existing intact manifest is
    /// loaded without a new generation.
    pub fn init(root: &Path) -> Result<Self, CoreError> {
        for dir in LAYOUT_DIRS {
            fs::create_dir_all(root.join(dir))?;
        }

        let state_path = root.join("state").join("userspace.json");
        let state = match load_state(&state_path, STATE_KIND)? {
            Some(doc) => doc,
            None => {
                let fresh = UserspaceState {
                    schema_version: SCHEMA_VERSION,
                    created_at_ms: now_ms(),
                    directories: LAYOUT_DIRS.iter().map(|d| (*d).to_string()).collect(),
                };
                let generation = store_state(&state_path, STATE_KIND, &fresh)?;
                StateDocument {
                    generation,
                    data: fresh,
                }
            }
        };

        Ok(Self {
            root: root.to_path_buf(),
            state,
        })
    }

    #[must_use]
    pub fn root(&self) -> &Path {
        &self.root
    }

    #[must_use]
    pub fn config_dir(&self) -> PathBuf {
        self.root.join("config")
    }

    #[must_use]
    pub fn packages_dir(&self) -> PathBuf {
        self.root.join("packages")
    }

    #[must_use]
    pub fn services_dir(&self) -> PathBuf {
        self.root.join("services")
    }

    #[must_use]
    pub fn logs_dir(&self) -> PathBuf {
        self.root.join("logs")
    }

    #[must_use]
    pub fn cache_dir(&self) -> PathBuf {
        self.root.join("cache")
    }

    #[must_use]
    pub fn tmp_dir(&self) -> PathBuf {
        self.root.join("tmp")
    }

    #[must_use]
    pub fn state(&self) -> &StateDocument<UserspaceState> {
        &self.state
    }

    #[must_use]
    pub fn state_file(&self) -> PathBuf {
        self.root.join("state").join("userspace.json")
    }
}
