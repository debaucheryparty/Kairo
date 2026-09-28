use std::collections::HashMap;
use std::path::Path;
use std::sync::Arc;
use std::time::Instant;

use kairo_protocol::v1::{
    GetGpuInfoResponse, GpuDevice, GpuStreamStats, StartGpuStreamRequest, StartGpuStreamResponse,
};
use thiserror::Error;
use tokio::sync::RwLock;
use uuid::Uuid;

#[derive(Debug, Error)]
pub enum GpuError {
    #[error("gpu device not found: {0}")]
    DeviceNotFound(String),

    #[error("stream session not found: {0}")]
    StreamNotFound(String),

    #[error("encoder not supported: {0}")]
    EncoderNotSupported(String),

    #[error("failed to query gpu subsystem: {0}")]
    QueryFailed(String),
}

#[derive(Debug, Clone)]
#[allow(dead_code)]
struct StreamState {
    stream_id: String,
    gpu_id: String,
    width: u32,
    height: u32,
    target_fps: u32,
    codec: String,
    bitrate_kbps: u32,
    active_encoder: String,
    started_at: Instant,
    frame_count: u64,
}

pub struct GpuManager {
    streams: Arc<RwLock<HashMap<String, StreamState>>>,
}

impl Default for GpuManager {
    fn default() -> Self {
        Self::new()
    }
}

impl GpuManager {
    #[must_use]
    pub fn new() -> Self {
        Self {
            streams: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub async fn get_gpu_info(&self) -> GetGpuInfoResponse {
        let devices = Self::detect_devices().await;
        let gpu_available = !devices.is_empty();
        let default_encoder = if let Some(first) = devices.first() {
            first
                .supported_encoders
                .first()
                .cloned()
                .unwrap_or_else(|| "software_h264".to_string())
        } else {
            "software_h264".to_string()
        };

        GetGpuInfoResponse {
            gpu_available,
            devices,
            default_encoder,
        }
    }

    pub async fn start_stream(
        &self,
        req: StartGpuStreamRequest,
    ) -> Result<StartGpuStreamResponse, GpuError> {
        let stream_id = Uuid::new_v4().to_string();
        let actual_fps = if req.target_fps == 0 {
            60
        } else {
            req.target_fps.min(144)
        };

        let active_encoder = if req.codec.is_empty() {
            "h264_nvenc".to_string()
        } else {
            req.codec.clone()
        };

        let stream_endpoint = format!("kairo-gpu://stream/{stream_id}");

        let state = StreamState {
            stream_id: stream_id.clone(),
            gpu_id: req.gpu_id,
            width: if req.width == 0 { 1920 } else { req.width },
            height: if req.height == 0 { 1080 } else { req.height },
            target_fps: actual_fps,
            codec: req.codec,
            bitrate_kbps: if req.bitrate_kbps == 0 {
                8000
            } else {
                req.bitrate_kbps
            },
            active_encoder: active_encoder.clone(),
            started_at: Instant::now(),
            frame_count: 0,
        };

        let mut streams = self.streams.write().await;
        streams.insert(stream_id.clone(), state);

        Ok(StartGpuStreamResponse {
            stream_id,
            active_encoder,
            actual_fps,
            stream_endpoint,
        })
    }

    pub async fn stop_stream(&self, stream_id: &str) -> bool {
        let mut streams = self.streams.write().await;
        streams.remove(stream_id).is_some()
    }

    pub async fn get_stream_stats(&self, stream_id: &str) -> Option<GpuStreamStats> {
        let streams = self.streams.read().await;
        let stream = streams.get(stream_id)?;

        let elapsed = stream.started_at.elapsed().as_secs_f32().max(0.001);
        let current_fps =
            ((stream.frame_count as f32 / elapsed) as u32).clamp(1, stream.target_fps);

        Some(GpuStreamStats {
            stream_id: stream_id.to_string(),
            current_fps,
            bitrate_kbps: stream.bitrate_kbps,
            rtt_ms: 12,
            frame_loss_percent: 0.0,
        })
    }

    async fn detect_devices() -> Vec<GpuDevice> {
        let mut devices = Vec::new();

        if let Ok(nvidia_devices) = Self::detect_nvidia().await {
            devices.extend(nvidia_devices);
        }

        if devices.is_empty() {
            devices.extend(Self::detect_drm().await.unwrap_or_default());
        }

        devices
    }

    async fn detect_nvidia() -> Result<Vec<GpuDevice>, GpuError> {
        let output = tokio::process::Command::new("nvidia-smi")
            .args([
                "--query-gpu=gpu_name,driver_version,memory.total,memory.used,temperature.gpu,utilization.gpu",
                "--format=csv,noheader,nounits",
            ])
            .output()
            .await
            .map_err(|e| GpuError::QueryFailed(e.to_string()))?;

        if !output.status.success() {
            return Err(GpuError::QueryFailed("nvidia-smi exited with error".into()));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let mut devices = Vec::new();

        for (idx, line) in stdout.lines().enumerate() {
            let parts: Vec<&str> = line.split(',').map(|s| s.trim()).collect();
            if parts.len() >= 6 {
                let name = parts[0].to_string();
                let driver_version = parts[1].to_string();
                let mem_total_mb: u64 = parts[2].parse().unwrap_or(0);
                let mem_used_mb: u64 = parts[3].parse().unwrap_or(0);
                let temp: u32 = parts[4].parse().unwrap_or(0);
                let util: u32 = parts[5].parse().unwrap_or(0);

                devices.push(GpuDevice {
                    gpu_id: format!("nvidia-{idx}"),
                    name,
                    vendor: "NVIDIA".to_string(),
                    driver_version,
                    memory_total_bytes: mem_total_mb * 1024 * 1024,
                    memory_used_bytes: mem_used_mb * 1024 * 1024,
                    temperature_celsius: temp,
                    utilization_percent: util,
                    supported_encoders: vec![
                        "nvenc_h264".to_string(),
                        "nvenc_hevc".to_string(),
                        "nvenc_av1".to_string(),
                    ],
                });
            }
        }

        Ok(devices)
    }

    async fn detect_drm() -> Result<Vec<GpuDevice>, GpuError> {
        let dri_path = Path::new("/dev/dri");
        if !dri_path.exists() {
            return Ok(Vec::new());
        }

        let mut devices = Vec::new();
        if let Ok(mut read_dir) = tokio::fs::read_dir(dri_path).await {
            let mut idx = 0;
            while let Ok(Some(entry)) = read_dir.next_entry().await {
                let file_name = entry.file_name();
                let name_str = file_name.to_string_lossy();
                if name_str.starts_with("renderD") {
                    devices.push(GpuDevice {
                        gpu_id: format!("drm-{idx}"),
                        name: format!("DRM Device {name_str}"),
                        vendor: "Generic DRM/KMS".to_string(),
                        driver_version: "kernel-drm".to_string(),
                        memory_total_bytes: 0,
                        memory_used_bytes: 0,
                        temperature_celsius: 0,
                        utilization_percent: 0,
                        supported_encoders: vec![
                            "vaapi_h264".to_string(),
                            "vaapi_hevc".to_string(),
                        ],
                    });
                    idx += 1;
                }
            }
        }

        Ok(devices)
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_gpu_info_fallback() {
        let manager = GpuManager::new();
        let info = manager.get_gpu_info().await;
        if !info.gpu_available {
            assert!(info.devices.is_empty());
            assert_eq!(info.default_encoder, "software_h264");
        }
    }

    #[tokio::test]
    async fn test_start_stop_stream_lifecycle() {
        let manager = GpuManager::new();
        let req = StartGpuStreamRequest {
            gpu_id: "test-gpu-0".to_string(),
            width: 1920,
            height: 1080,
            target_fps: 60,
            codec: "h264_nvenc".to_string(),
            bitrate_kbps: 6000,
        };

        let start_resp = manager.start_stream(req).await.expect("start stream");
        assert!(!start_resp.stream_id.is_empty());
        assert_eq!(start_resp.active_encoder, "h264_nvenc");
        assert_eq!(start_resp.actual_fps, 60);

        let stats = manager.get_stream_stats(&start_resp.stream_id).await;
        assert!(stats.is_some());
        let stats_val = stats.expect("stats present");
        assert_eq!(stats_val.bitrate_kbps, 6000);

        let stopped = manager.stop_stream(&start_resp.stream_id).await;
        assert!(stopped);

        let stats_after = manager.get_stream_stats(&start_resp.stream_id).await;
        assert!(stats_after.is_none());
    }
}
