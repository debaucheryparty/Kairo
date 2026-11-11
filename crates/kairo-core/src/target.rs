use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum ExecutionTarget {
    Host,
    Managed,
}

impl ExecutionTarget {
    #[must_use]
    pub fn is_host(&self) -> bool {
        matches!(self, Self::Host)
    }

    #[must_use]
    pub fn is_managed(&self) -> bool {
        matches!(self, Self::Managed)
    }

    #[must_use]
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Host => "host",
            Self::Managed => "managed",
        }
    }
}

impl std::fmt::Display for ExecutionTarget {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}
