use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct AgentConfig {
    pub bind_address: String,
    pub data_dir: String,
}

impl Default for AgentConfig {
    fn default() -> Self {
        Self {
            bind_address: "0.0.0.0:9600".to_string(),
            data_dir: "/var/lib/kairo".to_string(),
        }
    }
}
