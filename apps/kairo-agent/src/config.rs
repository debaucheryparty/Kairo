use kairo_common::KairoId;
use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct AgentConfig {
    pub bind_address: String,
    pub data_dir: String,
    pub agent_id: KairoId,
}

impl Default for AgentConfig {
    fn default() -> Self {
        Self {
            bind_address: "0.0.0.0:9600".to_string(),
            data_dir: "/var/lib/kairo".to_string(),
            agent_id: KairoId::new(),
        }
    }
}
