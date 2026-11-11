use std::process::{Command, Output, Stdio};
use std::thread;
use std::time::{Duration, Instant};

/// Runs a command with stdin closed and a strict bounded timeout.
/// If the command takes longer than `timeout`, it is killed and `None` is returned.
pub fn run_with_timeout(mut cmd: Command, timeout: Duration) -> Option<Output> {
    cmd.stdin(Stdio::null());
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    let mut child = cmd.spawn().ok()?;
    let start = Instant::now();
    let poll_interval = Duration::from_millis(15);

    loop {
        match child.try_wait() {
            Ok(Some(_status)) => {
                return child.wait_with_output().ok();
            }
            Ok(None) => {
                if start.elapsed() >= timeout {
                    let _ = child.kill();
                    let _ = child.wait();
                    return None;
                }
                thread::sleep(poll_interval);
            }
            Err(_) => {
                let _ = child.kill();
                let _ = child.wait();
                return None;
            }
        }
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use super::*;

    #[test]
    fn test_run_fast_command() {
        let mut cmd = Command::new("cmd");
        #[cfg(windows)]
        cmd.args(["/c", "echo fast"]);
        #[cfg(not(windows))]
        let mut cmd = Command::new("echo");
        #[cfg(not(windows))]
        cmd.arg("fast");

        let out = run_with_timeout(cmd, Duration::from_secs(2));
        assert!(out.is_some());
        let output = out.unwrap();
        assert!(output.status.success());
    }

    #[test]
    fn test_run_timeout_command() {
        #[cfg(windows)]
        let cmd = {
            let mut c = Command::new("powershell");
            c.args(["-Command", "Start-Sleep -Milliseconds 1500"]);
            c
        };
        #[cfg(not(windows))]
        let mut cmd = {
            let mut c = Command::new("sleep");
            c.arg("1.5");
            c
        };

        let start = Instant::now();
        let out = run_with_timeout(cmd, Duration::from_millis(100));
        let elapsed = start.elapsed();

        assert!(out.is_none(), "command should have timed out");
        assert!(elapsed < Duration::from_millis(1200), "should abort early");
    }
}
