use kairo_protocol::v1::Architecture;
use std::path::Path;
use sysinfo::{Disks, System};
use tracing::debug;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GpuDetection {
    pub available: bool,
    pub devices: Vec<String>,
    pub has_hardware_encoder: bool,
    pub encoder_type: String,
}

pub fn detect_architecture() -> Architecture {
    match std::env::consts::ARCH {
        "x86_64" => Architecture::X8664,
        "aarch64" => Architecture::Aarch64,
        "x86" => Architecture::X86,
        "arm" => Architecture::Arm,
        "riscv64" => Architecture::Riscv64,
        other => {
            debug!(arch = other, "unrecognized architecture");
            Architecture::Unknown
        }
    }
}

pub fn kernel_version() -> String {
    System::kernel_version().unwrap_or_default()
}

pub fn detect_resources() -> (u32, u64, u64) {
    let mut sys = System::new();
    sys.refresh_cpu_all();
    sys.refresh_memory();

    let cpu_cores = if sys.cpus().is_empty() {
        std::thread::available_parallelism()
            .map(|n| n.get() as u32)
            .unwrap_or(1)
    } else {
        sys.cpus().len() as u32
    };
    let memory_total_bytes = sys.total_memory();

    let disks = Disks::new_with_refreshed_list();
    let disk_total_bytes = disks.iter().map(|d| d.total_space()).sum();

    (cpu_cores, memory_total_bytes, disk_total_bytes)
}

pub fn detect_gpu() -> GpuDetection {
    let nvidia_present = Path::new("/proc/driver/nvidia/version").exists();
    let dri_dir = Path::new("/dev/dri");
    let drm_present = dri_dir.exists();

    let mut devices = Vec::new();

    if nvidia_present {
        devices.push("nvidia".to_string());
    }

    if drm_present && let Ok(entries) = std::fs::read_dir(dri_dir) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with("renderD") && !devices.contains(&"drm".to_string()) {
                devices.push("drm".to_string());
            }
        }
    }

    let available = !devices.is_empty();

    // Do NOT claim encoder capability merely from device presence.
    // An encoder requires specific hardware blocks (NVENC / VCE / QSV / VA-API)
    // and supporting user-space driver libraries.
    let (has_hardware_encoder, encoder_type) = if nvidia_present && has_nvenc_library() {
        (true, "nvenc".to_string())
    } else if drm_present && has_vaapi_driver() {
        (true, "vaapi".to_string())
    } else if available {
        (false, "unverified".to_string())
    } else {
        (false, "none".to_string())
    };

    GpuDetection {
        available,
        devices,
        has_hardware_encoder,
        encoder_type,
    }
}

fn has_nvenc_library() -> bool {
    #[cfg(target_os = "linux")]
    {
        Path::new("/usr/lib/x86_64-linux-gnu/libnvidia-encode.so.1").exists()
            || Path::new("/usr/lib64/libnvidia-encode.so.1").exists()
            || Path::new("/usr/lib/libnvidia-encode.so.1").exists()
    }
    #[cfg(target_os = "windows")]
    {
        Path::new("C:\\Windows\\System32\\nvEncodeAPI64.dll").exists()
            || Path::new("C:\\Windows\\System32\\nvEncodeAPI.dll").exists()
    }
    #[cfg(not(any(target_os = "linux", target_os = "windows")))]
    {
        false
    }
}

fn has_vaapi_driver() -> bool {
    #[cfg(target_os = "linux")]
    {
        let paths = [
            "/usr/lib/x86_64-linux-gnu/dri",
            "/usr/lib64/dri",
            "/usr/lib/dri",
        ];
        for p in paths {
            if let Ok(entries) = std::fs::read_dir(p) {
                for entry in entries.flatten() {
                    let name = entry.file_name().to_string_lossy().to_string();
                    if name.ends_with("_drv_video.so") {
                        return true;
                    }
                }
            }
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_architecture_detection() {
        let arch = detect_architecture();
        #[cfg(target_arch = "x86_64")]
        assert_eq!(arch as i32, Architecture::X8664 as i32);
        #[cfg(target_arch = "aarch64")]
        assert_eq!(arch as i32, Architecture::Aarch64 as i32);
        let _ = arch;
    }

    #[test]
    fn test_detect_resources_returns_nonzero_memory() {
        let (cores, mem, _disk) = detect_resources();
        assert!(cores > 0, "expected at least one CPU core");
        assert!(mem > 0, "expected nonzero total memory");
    }

    #[test]
    fn test_gpu_detection_does_not_panic() {
        let gpu = detect_gpu();
        if !gpu.available {
            assert!(gpu.devices.is_empty());
            assert!(!gpu.has_hardware_encoder);
            assert_eq!(gpu.encoder_type, "none");
        }
    }
}
