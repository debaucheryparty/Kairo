use std::process::Command;
use std::sync::Arc;
use thiserror::Error;
use tokio::sync::{RwLock, broadcast};
use tracing::debug;

use kairo_protocol::v1::{
    ListMediaPlayersResponse, MediaControlAction, MediaControlRequest, MediaControlResponse,
    MediaPlayerInfo, MediaStateChangeEvent, MediaTrack, PlaybackState,
};

#[derive(Debug, Error)]
pub enum MediaError {
    #[error("command execution failed: {0}")]
    Execution(String),

    #[error("player not found: {0}")]
    PlayerNotFound(String),

    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
}

#[derive(Clone)]
pub struct MediaManager {
    cached_player: Arc<RwLock<Option<MediaPlayerInfo>>>,
    events_tx: broadcast::Sender<MediaStateChangeEvent>,
}

impl Default for MediaManager {
    fn default() -> Self {
        Self::new()
    }
}

impl MediaManager {
    #[must_use]
    pub fn new() -> Self {
        let (events_tx, _) = broadcast::channel(32);
        Self {
            cached_player: Arc::new(RwLock::new(None)),
            events_tx,
        }
    }

    pub fn subscribe(&self) -> broadcast::Receiver<MediaStateChangeEvent> {
        self.events_tx.subscribe()
    }

    pub async fn get_players(&self) -> ListMediaPlayersResponse {
        let players = self.discover_players();
        let active_id = players
            .first()
            .map(|p| p.player_id.clone())
            .unwrap_or_default();

        {
            let mut lock = self.cached_player.write().await;
            *lock = players.first().cloned();
        }

        ListMediaPlayersResponse {
            players,
            active_player_id: active_id,
        }
    }

    pub async fn control(
        &self,
        req: MediaControlRequest,
    ) -> Result<MediaControlResponse, MediaError> {
        let player_arg = if req.player_id.trim().is_empty() {
            None
        } else {
            Some(req.player_id.as_str())
        };

        let action =
            MediaControlAction::try_from(req.action).unwrap_or(MediaControlAction::Unspecified);

        let success = match action {
            MediaControlAction::Play => self.run_player_cmd(player_arg, &["play"]),
            MediaControlAction::Pause => self.run_player_cmd(player_arg, &["pause"]),
            MediaControlAction::PlayPause => self.run_player_cmd(player_arg, &["play-pause"]),
            MediaControlAction::Next => self.run_player_cmd(player_arg, &["next"]),
            MediaControlAction::Previous => self.run_player_cmd(player_arg, &["previous"]),
            MediaControlAction::Stop => self.run_player_cmd(player_arg, &["stop"]),
            MediaControlAction::Seek => {
                let seconds = req.seek_offset_us as f64 / 1_000_000.0;
                let arg = if seconds >= 0.0 {
                    format!("+{seconds:.2}")
                } else {
                    format!("{seconds:.2}")
                };
                self.run_player_cmd(player_arg, &["position", &arg])
            }
            MediaControlAction::SetVolume => {
                let vol = req.volume.clamp(0.0, 1.0);
                let arg = format!("{vol:.2}");
                self.run_player_cmd(player_arg, &["volume", &arg])
            }
            MediaControlAction::Unspecified => false,
        };

        let players = self.discover_players();
        let current = players
            .iter()
            .find(|p| player_arg.map(|id| p.player_id == id).unwrap_or(true))
            .cloned()
            .or_else(|| players.first().cloned());

        if let Some(ref p) = current {
            let mut lock = self.cached_player.write().await;
            *lock = Some(p.clone());
            let _ = self.events_tx.send(MediaStateChangeEvent {
                player: Some(p.clone()),
                is_active: true,
            });
        }

        Ok(MediaControlResponse {
            success,
            message: if success {
                String::new()
            } else {
                "Media command execution failed or playerctl not found".to_string()
            },
            player: current,
        })
    }

    fn run_player_cmd(&self, player_id: Option<&str>, args: &[&str]) -> bool {
        let mut cmd = Command::new("playerctl");
        if let Some(id) = player_id {
            cmd.arg("-p").arg(id);
        }
        for arg in args {
            cmd.arg(arg);
        }

        match cmd.output() {
            Ok(output) => output.status.success(),
            Err(e) => {
                debug!(error = %e, "playerctl command execution failed");
                false
            }
        }
    }

    fn discover_players(&self) -> Vec<MediaPlayerInfo> {
        let mut cmd = Command::new("playerctl");
        cmd.arg("-a")
            .arg("metadata")
            .arg("--format")
            .arg("{{playerName}}~;~{{status}}~;~{{title}}~;~{{artist}}~;~{{album}}~;~{{mpris:artUrl}}~;~{{position}}~;~{{mpris:length}}");

        let output = match cmd.output() {
            Ok(out) => out,
            Err(e) => {
                debug!(error = %e, "playerctl not available on host");
                return Vec::new();
            }
        };

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            debug!(stderr = %stderr, "playerctl metadata returned non-zero code");
            return Vec::new();
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let mut players = Vec::new();

        for line in stdout.lines() {
            let line = line.trim();
            if line.is_empty() {
                continue;
            }

            let parts: Vec<&str> = line.split("~;~").collect();
            if parts.len() < 8 {
                continue;
            }

            let name = parts[0].trim().to_string();
            let status_str = parts[1].trim().to_lowercase();
            let title = parts[2].trim().to_string();
            let artist = parts[3].trim().to_string();
            let album = parts[4].trim().to_string();
            let art_url = parts[5].trim().to_string();
            let position_us = parts[6].trim().parse::<i64>().unwrap_or(0);
            let duration_us = parts[7].trim().parse::<i64>().unwrap_or(0);

            let playback_state = match status_str.as_str() {
                "playing" => PlaybackState::Playing,
                "paused" => PlaybackState::Paused,
                "stopped" => PlaybackState::Stopped,
                _ => PlaybackState::Unknown,
            };

            players.push(MediaPlayerInfo {
                player_id: name.clone(),
                name,
                playback_state: playback_state as i32,
                track: Some(MediaTrack {
                    title,
                    artist,
                    album,
                    art_url,
                    position_us,
                    duration_us,
                }),
                volume: 1.0,
                can_control: true,
                can_go_next: true,
                can_go_previous: true,
                can_play: true,
                can_pause: true,
                can_seek: duration_us > 0,
            });
        }

        players
    }
}
