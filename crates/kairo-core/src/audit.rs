use crate::target::ExecutionTarget;
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::sync::RwLock;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum AuditSeverity {
    Info,
    Warning,
    SecurityAlert,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditEvent {
    pub id: u64,
    pub timestamp_ms: u64,
    pub actor_id: String,
    pub target: ExecutionTarget,
    pub action: String,
    pub severity: AuditSeverity,
    pub success: bool,
    pub details: String,
}

#[derive(Debug)]
pub struct AuditLog {
    events: RwLock<VecDeque<AuditEvent>>,
    next_id: RwLock<u64>,
    capacity: usize,
}

impl Default for AuditLog {
    fn default() -> Self {
        Self::new(1000)
    }
}

impl AuditLog {
    #[must_use]
    pub fn new(capacity: usize) -> Self {
        Self {
            events: RwLock::new(VecDeque::with_capacity(capacity)),
            next_id: RwLock::new(1),
            capacity,
        }
    }

    pub fn record(
        &self,
        actor_id: &str,
        target: ExecutionTarget,
        action: &str,
        severity: AuditSeverity,
        success: bool,
        details: &str,
    ) {
        let now_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);

        let id = {
            let mut id_lock = self
                .next_id
                .write()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            let cur = *id_lock;
            *id_lock += 1;
            cur
        };

        let event = AuditEvent {
            id,
            timestamp_ms: now_ms,
            actor_id: actor_id.to_string(),
            target,
            action: action.to_string(),
            severity,
            success,
            details: details.to_string(),
        };

        let mut events = self
            .events
            .write()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        if events.len() >= self.capacity {
            events.pop_front();
        }
        events.push_back(event);
    }

    #[must_use]
    pub fn get_recent(&self, limit: usize) -> Vec<AuditEvent> {
        let events = self
            .events
            .read()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        events.iter().rev().take(limit).cloned().collect()
    }

    #[must_use]
    pub fn len(&self) -> usize {
        let events = self
            .events
            .read()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        events.len()
    }

    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }
}
