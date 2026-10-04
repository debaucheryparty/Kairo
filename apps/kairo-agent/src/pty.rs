use std::collections::HashMap;
use std::io::Write;
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::thread;

use kairo_common::KairoId;
use kairo_protocol::v1::PtySessionInfo;
use portable_pty::{CommandBuilder, MasterPty, PtySize, native_pty_system};
use thiserror::Error;
use tokio::sync::broadcast;
use tracing::{debug, info};

pub const BACKLOG_CAPACITY: usize = 64 * 1024;

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

#[derive(Debug, Clone)]
pub struct RingBuffer {
    buf: Vec<u8>,
    capacity: usize,
}

impl RingBuffer {
    #[must_use]
    pub fn new(capacity: usize) -> Self {
        Self {
            buf: Vec::with_capacity(capacity),
            capacity,
        }
    }

    pub fn push(&mut self, data: &[u8]) {
        if data.len() >= self.capacity {
            self.buf.clear();
            self.buf
                .extend_from_slice(&data[data.len() - self.capacity..]);
        } else {
            let overflow = (self.buf.len() + data.len()).saturating_sub(self.capacity);
            if overflow > 0 {
                self.buf.drain(..overflow);
            }
            self.buf.extend_from_slice(data);
        }
    }

    #[must_use]
    pub fn get(&self) -> Vec<u8> {
        self.buf.clone()
    }
}

struct PtyInstance {
    master: Box<dyn MasterPty + Send>,
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    output_tx: broadcast::Sender<Vec<u8>>,
    backlog: Arc<Mutex<RingBuffer>>,
    shell: String,
    cols: u16,
    rows: u16,
}

#[derive(Clone)]
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
    ) -> Result<(KairoId, broadcast::Receiver<Vec<u8>>), PtyError> {
        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| PtyError::SpawnFailed(e.to_string()))?;

        let default_shell = if cfg!(windows) {
            "cmd.exe".to_string()
        } else {
            std::env::var("SHELL").unwrap_or_else(|_| {
                if Path::new("/bin/bash").exists() {
                    "/bin/bash".to_string()
                } else {
                    "/bin/sh".to_string()
                }
            })
        };
        let shell_cmd = shell.unwrap_or(&default_shell);

        let mut cmd = CommandBuilder::new(shell_cmd);
        if let Some(dir) = cwd {
            cmd.cwd(dir);
        } else if let Ok(home) = std::env::var("HOME") {
            cmd.cwd(home);
        } else if let Ok(profile) = std::env::var("USERPROFILE") {
            cmd.cwd(profile);
        }
        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");

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

        let (output_tx, output_rx) = broadcast::channel(512);
        let backlog = Arc::new(Mutex::new(RingBuffer::new(BACKLOG_CAPACITY)));

        let pty_id = KairoId::new();
        let pty_id_str = pty_id.to_string();

        let reader_id = pty_id_str.clone();
        let backlog_clone = Arc::clone(&backlog);
        let btx = output_tx.clone();

        thread::spawn(move || {
            let mut buf = [0u8; 4096];
            loop {
                match std::io::Read::read(&mut reader, &mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        let chunk = buf[..n].to_vec();
                        if let Ok(mut bg) = backlog_clone.lock() {
                            bg.push(&chunk);
                        }
                        let _ = btx.send(chunk);
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
            output_tx,
            backlog,
            shell: shell_cmd.to_string(),
            cols,
            rows,
        };

        let mut lock = self
            .instances
            .lock()
            .map_err(|e| PtyError::Io(e.to_string()))?;
        lock.insert(pty_id_str.clone(), instance);

        info!(pty_id = %pty_id_str, "pty session created with 64KB backlog buffer");
        Ok((pty_id, output_rx))
    }

    pub fn attach_pty(
        &self,
        pty_id: &str,
    ) -> Result<(Vec<u8>, broadcast::Receiver<Vec<u8>>), PtyError> {
        let lock = self
            .instances
            .lock()
            .map_err(|e| PtyError::Io(e.to_string()))?;

        let instance = lock
            .get(pty_id)
            .ok_or_else(|| PtyError::NotFound(pty_id.to_string()))?;

        let backlog = match instance.backlog.lock() {
            Ok(b) => b.get(),
            Err(p) => p.into_inner().get(),
        };

        let rx = instance.output_tx.subscribe();
        info!(
            pty_id,
            backlog_len = backlog.len(),
            "reattached to pty session"
        );
        Ok((backlog, rx))
    }

    pub fn list_ptys(&self) -> Result<Vec<PtySessionInfo>, PtyError> {
        let lock = self
            .instances
            .lock()
            .map_err(|e| PtyError::Io(e.to_string()))?;

        let mut list = Vec::new();
        for (id, inst) in lock.iter() {
            list.push(PtySessionInfo {
                pty_id: id.clone(),
                shell: inst.shell.clone(),
                cols: u32::from(inst.cols),
                rows: u32::from(inst.rows),
            });
        }
        Ok(list)
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
        let mut lock = self
            .instances
            .lock()
            .map_err(|e| PtyError::Io(e.to_string()))?;

        let instance = lock
            .get_mut(pty_id)
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

        instance.cols = cols;
        instance.rows = rows;

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
#[allow(clippy::unwrap_used, clippy::expect_used)]
mod tests {
    use super::*;
    use std::time::Duration;
    use tokio::time::timeout;

    #[tokio::test]
    async fn test_pty_lifecycle_and_reattach() {
        let manager = PtyManager::new();
        let (pty_id, mut rx) = manager
            .create_pty(None, 80, 24, None)
            .expect("create pty should succeed");

        manager
            .resize(&pty_id.to_string(), 100, 30)
            .expect("resize should succeed");

        manager
            .write_input(&pty_id.to_string(), b"\n")
            .expect("write input should succeed");

        let out = timeout(Duration::from_secs(3), rx.recv()).await;
        assert!(out.is_ok(), "should receive pty output within timeout");

        drop(rx);

        let (backlog, mut reattach_rx) = manager
            .attach_pty(&pty_id.to_string())
            .expect("attach should succeed");
        assert!(
            !backlog.is_empty(),
            "backlog should contain previous output"
        );

        manager
            .write_input(&pty_id.to_string(), b"\n")
            .expect("write input after reattach");

        let out2 = timeout(Duration::from_secs(3), reattach_rx.recv()).await;
        assert!(out2.is_ok(), "should receive output after reattach");

        manager
            .close(&pty_id.to_string())
            .expect("close should succeed");
    }
}
