use std::sync::Mutex;
use sysinfo::{Disks, System};

#[derive(Debug)]
pub struct MetricsCollector {
    system: Mutex<System>,
}

impl Default for MetricsCollector {
    fn default() -> Self {
        Self::new()
    }
}

impl MetricsCollector {
    pub fn new() -> Self {
        let mut sys = System::new_all();
        sys.refresh_all();
        Self {
            system: Mutex::new(sys),
        }
    }

    pub fn collect(&self) -> kairo_protocol::v1::SystemMetrics {
        let mut sys = match self.system.lock() {
            Ok(s) => s,
            Err(poisoned) => poisoned.into_inner(),
        };

        sys.refresh_cpu_usage();
        sys.refresh_memory();

        let cpu_usage = sys.global_cpu_usage() as f64;
        let memory_total = sys.total_memory();
        let memory_used = sys.used_memory();

        let disks = Disks::new_with_refreshed_list();
        let mut disk_total = 0u64;
        let mut disk_used = 0u64;
        for disk in &disks {
            disk_total += disk.total_space();
            disk_used += disk.total_space().saturating_sub(disk.available_space());
        }

        let load_avg = System::load_average();
        let uptime = System::uptime();

        kairo_protocol::v1::SystemMetrics {
            cpu_usage_percent: cpu_usage,
            memory_total_bytes: memory_total,
            memory_used_bytes: memory_used,
            disk_total_bytes: disk_total,
            disk_used_bytes: disk_used,
            load_average_1m: load_avg.one,
            load_average_5m: load_avg.five,
            load_average_15m: load_avg.fifteen,
            uptime_seconds: uptime,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_collect_metrics() {
        let collector = MetricsCollector::new();
        let metrics = collector.collect();
        assert!(metrics.memory_total_bytes > 0);
    }
}
