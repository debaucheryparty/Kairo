use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct KairoId(String);

impl KairoId {
    #[must_use]
    pub fn new() -> Self {
        Self(Uuid::new_v4().to_string())
    }

    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl Default for KairoId {
    fn default() -> Self {
        Self::new()
    }
}

impl std::fmt::Display for KairoId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}
