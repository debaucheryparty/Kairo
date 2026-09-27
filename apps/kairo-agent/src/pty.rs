use std::collections::HashMap;
use std::io::Write;
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::thread;

use kairo_common::KairoId;
use portable_pty::{CommandBuilder, MasterPty, PtySize, native_pty_system};
use thiserror::Error;
use tokio::sync::mpsc;
use tracing::{debug, info};

#[derive(Debug, Error)]
pub enum PtyError {
    #[error("pty not found: {0}")]
    NotFound(String),

    #[error("pty spawn failed: {0}")]
    SpawnFailed(String),

    #[error("pty io error: {0}")]
    Io(String),

    #[error("pty resize failed: {0}")]
    ResizeFailed(String),
}

struct PtyInstance {
    master: Box<dyn MasterPty + Send>,
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
}

pub struct PtyManager {
    instances: Arc<Mutex<HashMap<String, PtyInstance>>>,
}

impl Default for PtyManager {
    fn default() -> Self {
        Self::new()
    }
}

impl PtyManager {
    #[must_use]
    pub fn new() -> Self {
        Self {
            instances: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn create_pty(
        &self,
        shell: Option<&str>,
        cols: u16,
        rows: u16,
        cwd: Option<&Path>,
    ) -> Result<(KairoId, mpsc::Receiver<Vec<u8>>), PtyError> {
        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| PtyError::SpawnFailed(e.to_string()))?;

        let default_shell = if cfg!(windows) { "cmd.exe" } else { "/bin/sh" };
        let shell_cmd = shell.unwrap_or(default_shell);

        let mut cmd = CommandBuilder::new(shell_cmd);
        if let Some(dir) = cwd {
            cmd.cwd(dir);
        }

        let _child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| PtyError::SpawnFailed(e.to_string()))?;

        drop(pair.slave);

        let writer = pair
            .master
            .take_writer()
            .map_err(|e| PtyError::Io(e.to_string()))?;
        let mut reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| PtyError::Io(e.to_string()))?;

        let (tx, rx) = mpsc::channel(128);
        let pty_id = KairoId::new();
        let pty_id_str = pty_id.to_string();

        let reader_id = pty_id_str.clone();
        thread::spawn(move || {
            let mut buf = [0u8; 4096];
            loop {
                match std::io::Read::read(&mut reader, &mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        if tx.blocking_send(buf[..n].to_vec()).is_err() {
                            break;
                        }
                    }
                    Err(e) => {
                        debug!(pty_id = %reader_id, error = %e, "pty read ended");
                        break;
                    }
                }
            }
            debug!(pty_id = %reader_id, "pty reader thread exited");
        });

        let instance = PtyInstance {
            master: pair.master,
            writer: Arc::new(Mutex::new(writer)),
        };

        let mut lock = self
            .instances
            .lock()
            .map_err(|e| PtyError::Io(e.to_string()))?;
        lock.insert(pty_id_str.clone(), instance);

        info!(pty_id = %pty_id_str, "pty session created");
        Ok((pty_id, rx))
    }

    pub fn write_input(&self, pty_id: &str, data: &[u8]) -> Result<(), PtyError> {
        let lock = self
            .instances
            .lock()
            .map_err(|e| PtyError::Io(e.to_string()))?;

        let instance = lock
            .get(pty_id)
            .ok_or_else(|| PtyError::NotFound(pty_id.to_string()))?;

        let mut writer = instance
            .writer
            .lock()
            .map_err(|e| PtyError::Io(e.to_string()))?;

        writer
            .write_all(data)
            .map_err(|e| PtyError::Io(e.to_string()))?;
        writer.flush().map_err(|e| PtyError::Io(e.to_string()))?;

        Ok(())
    }

    pub fn resize(&self, pty_id: &str, cols: u16, rows: u16) -> Result<(), PtyError> {
        let lock = self
            .instances
            .lock()
            .map_err(|e| PtyError::Io(e.to_string()))?;

        let instance = lock
            .get(pty_id)
            .ok_or_else(|| PtyError::NotFound(pty_id.to_string()))?;

        instance
            .master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| PtyError::ResizeFailed(e.to_string()))?;

        debug!(pty_id = %pty_id, cols, rows, "pty resized");
        Ok(())
    }

    pub fn close(&self, pty_id: &str) -> Result<(), PtyError> {
        let mut lock = self
            .instances
            .lock()
            .map_err(|e| PtyError::Io(e.to_string()))?;

        if lock.remove(pty_id).is_some() {
            info!(pty_id = %pty_id, "pty session closed");
            Ok(())
        } else {
            Err(PtyError::NotFound(pty_id.to_string()))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;
    use tokio::time::timeout;

    #[tokio::test]
    async fn test_pty_lifecycle() {
        let manager = PtyManager::new();
        let (pty_id, mut rx) = manager
            .create_pty(None, 80, 24, None)
            .expect("create pty should succeed");

        manager
            .resize(&pty_id.to_string(), 100, 30)
            .expect("resize should succeed");

        // Write a newline or simple echo
        manager
            .write_input(&pty_id.to_string(), b"\n")
            .expect("write input should succeed");

        // Receive output with timeout
        let out = timeout(Duration::from_secs(3), rx.recv()).await;
        assert!(out.is_ok(), "should receive pty output within timeout");

        manager
            .close(&pty_id.to_string())
            .expect("close should succeed");
    }
}
