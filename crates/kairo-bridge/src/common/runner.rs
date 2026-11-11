use crate::error::BridgeError;
use std::collections::HashMap;
use std::process::{Command, Output, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

pub trait CommandRunner: Send + Sync {
    fn run(
        &self,
        binary: &str,
        args: &[&str],
        timeout: Duration,
        env: &[(&str, &str)],
    ) -> Result<Output, BridgeError>;
}

#[derive(Default, Clone)]
pub struct RealCommandRunner;

impl CommandRunner for RealCommandRunner {
    fn run(
        &self,
        binary: &str,
        args: &[&str],
        timeout: Duration,
        env: &[(&str, &str)],
    ) -> Result<Output, BridgeError> {
        let mut cmd = Command::new(binary);
        cmd.args(args);
        cmd.stdin(Stdio::null());
        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());

        for (k, v) in env {
            cmd.env(k, v);
        }

        let mut child = cmd.spawn().map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                BridgeError::BackendNotFound(binary.to_string())
            } else {
                BridgeError::Io(e)
            }
        })?;

        let start = Instant::now();
        let poll_interval = Duration::from_millis(15);

        loop {
            match child.try_wait() {
                Ok(Some(_status)) => {
                    return child.wait_with_output().map_err(BridgeError::Io);
                }
                Ok(None) => {
                    if start.elapsed() >= timeout {
                        let _ = child.kill();
                        let _ = child.wait();
                        return Err(BridgeError::Timeout(timeout));
                    }
                    thread::sleep(poll_interval);
                }
                Err(e) => {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err(BridgeError::Io(e));
                }
            }
        }
    }
}

#[derive(Default, Clone)]
pub struct MockCommandRunner {
    responses: Arc<Mutex<HashMap<String, MockResponse>>>,
}

#[derive(Clone)]
pub struct MockResponse {
    pub exit_code: i32,
    pub stdout: Vec<u8>,
    pub stderr: Vec<u8>,
    pub simulate_timeout: bool,
}

impl MockCommandRunner {
    #[must_use]
    pub fn new() -> Self {
        Self {
            responses: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn set_response(
        &self,
        binary: &str,
        first_arg: &str,
        exit_code: i32,
        stdout: &[u8],
        stderr: &[u8],
    ) {
        let key = format!("{binary} {first_arg}");
        let mut map = self.responses.lock().unwrap_or_else(|e| e.into_inner());
        map.insert(
            key,
            MockResponse {
                exit_code,
                stdout: stdout.to_vec(),
                stderr: stderr.to_vec(),
                simulate_timeout: false,
            },
        );
    }

    pub fn set_timeout(&self, binary: &str, first_arg: &str) {
        let key = format!("{binary} {first_arg}");
        let mut map = self.responses.lock().unwrap_or_else(|e| e.into_inner());
        map.insert(
            key,
            MockResponse {
                exit_code: -1,
                stdout: Vec::new(),
                stderr: Vec::new(),
                simulate_timeout: true,
            },
        );
    }
}

impl CommandRunner for MockCommandRunner {
    fn run(
        &self,
        binary: &str,
        args: &[&str],
        timeout: Duration,
        _env: &[(&str, &str)],
    ) -> Result<Output, BridgeError> {
        let first_arg = args.first().copied().unwrap_or("");
        let key = format!("{binary} {first_arg}");

        let resp = {
            let map = self.responses.lock().unwrap_or_else(|e| e.into_inner());
            map.get(&key).cloned().or_else(|| map.get(binary).cloned())
        };

        let resp = resp.ok_or_else(|| {
            BridgeError::BackendNotFound(format!("no mock registered for '{key}'"))
        })?;

        if resp.simulate_timeout {
            return Err(BridgeError::Timeout(timeout));
        }

        #[cfg(unix)]
        use std::os::unix::process::ExitStatusExt;
        #[cfg(windows)]
        use std::os::windows::process::ExitStatusExt;

        let status = if resp.exit_code == 0 {
            #[cfg(unix)]
            {
                std::process::ExitStatus::from_raw(0)
            }
            #[cfg(windows)]
            {
                std::process::ExitStatus::from_raw(0)
            }
        } else {
            #[cfg(unix)]
            {
                std::process::ExitStatus::from_raw(resp.exit_code << 8)
            }
            #[cfg(windows)]
            {
                std::process::ExitStatus::from_raw(resp.exit_code as u32)
            }
        };

        Ok(Output {
            status,
            stdout: resp.stdout,
            stderr: resp.stderr,
        })
    }
}
