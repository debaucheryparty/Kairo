use crate::capability::PlatformCapabilities;
use crate::traits::{PackageOps, PlatformAdapter, ProcessOps, ServiceOps};

pub struct GenericLinuxAdapter {
    adapter_name: &'static str,
    services: Box<dyn ServiceOps>,
    packages: Box<dyn PackageOps>,
    processes: Box<dyn ProcessOps>,
    capabilities: PlatformCapabilities,
}

impl GenericLinuxAdapter {
    #[must_use]
    pub fn new(
        adapter_name: &'static str,
        services: Box<dyn ServiceOps>,
        packages: Box<dyn PackageOps>,
        processes: Box<dyn ProcessOps>,
        capabilities: PlatformCapabilities,
    ) -> Self {
        Self {
            adapter_name,
            services,
            packages,
            processes,
            capabilities,
        }
    }
}

impl PlatformAdapter for GenericLinuxAdapter {
    fn name(&self) -> &'static str {
        self.adapter_name
    }

    fn capabilities(&self) -> PlatformCapabilities {
        self.capabilities.clone()
    }

    fn services(&self) -> &dyn ServiceOps {
        self.services.as_ref()
    }

    fn packages(&self) -> &dyn PackageOps {
        self.packages.as_ref()
    }

    fn processes(&self) -> &dyn ProcessOps {
        self.processes.as_ref()
    }
}
