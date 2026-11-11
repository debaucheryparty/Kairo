use crate::error::BridgeError;
use crate::traits::ServiceOps;
use kairo_protocol::v1::{ManageServiceResponse, ServiceAction, SystemService};

#[derive(Default, Clone)]
pub struct UnsupportedServiceManager {
    reason: String,
}

impl UnsupportedServiceManager {
    #[must_use]
    pub fn new(reason: impl Into<String>) -> Self {
        Self {
            reason: reason.into(),
        }
    }
}

impl ServiceOps for UnsupportedServiceManager {
    fn manager_name(&self) -> &'static str {
        "unsupported"
    }

    fn is_available(&self) -> bool {
        false
    }

    fn list_services(&self) -> Result<Vec<SystemService>, BridgeError> {
        Err(BridgeError::Unsupported(self.reason.clone()))
    }

    fn manage_service(
        &self,
        _service_name: &str,
        _action: ServiceAction,
    ) -> Result<ManageServiceResponse, BridgeError> {
        Err(BridgeError::Unsupported(self.reason.clone()))
    }
}
