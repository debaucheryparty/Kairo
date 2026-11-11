#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct PlatformCapabilities {
    pub can_manage_services: bool,
    pub service_manager_name: String,
    pub can_install_packages: bool,
    pub can_query_packages: bool,
    pub package_manager_name: String,
    pub can_manage_processes: bool,
    pub is_elevated: bool,
    pub has_passwordless_sudo: bool,
}

impl PlatformCapabilities {
    #[must_use]
    pub fn is_fully_capable(&self) -> bool {
        self.can_manage_services && self.can_install_packages && self.can_manage_processes
    }
}
