use kairo_protocol::v1::{ProcessInfo, ProcessState};
use std::sync::Mutex;
use sysinfo::{Pid, ProcessesToUpdate, System};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum ProcessError {
    #[error("process not found: {0}")]
    NotFound(String),
    #[error("failed to kill process: {0}")]
    KillFailed(String),
}

#[derive(Debug)]
pub struct ProcessManager {
    system: Mutex<System>,
}

impl Default for ProcessManager {
    fn default() -> Self {
        Self::new()
    }
}

impl ProcessManager {
    pub fn new() -> Self {
        let mut sys = System::new();
        sys.refresh_processes(ProcessesToUpdate::All, true);
        Self {
            system: Mutex::new(sys),
        }
    }

    pub fn list_processes(&self) -> Vec<ProcessInfo> {
        let mut sys = match self.system.lock() {
            Ok(s) => s,
            Err(poisoned) => poisoned.into_inner(),
        };

        sys.refresh_processes(ProcessesToUpdate::All, true);

        let mut list = Vec::new();
        for (pid, proc_) in sys.processes() {
            let pid_u32 = pid.as_u32();
            let exec_name = proc_.name().to_string_lossy().to_string();
            let args: Vec<String> = proc_
                .cmd()
                .iter()
                .map(|s| s.to_string_lossy().to_string())
                .collect();

            let state = match proc_.status() {
                sysinfo::ProcessStatus::Run => ProcessState::Running,
                sysinfo::ProcessStatus::Sleep | sysinfo::ProcessStatus::Idle => {
                    ProcessState::Running
                }
                sysinfo::ProcessStatus::Stop => ProcessState::Stopped,
                sysinfo::ProcessStatus::Zombie => ProcessState::Zombie,
                _ => ProcessState::Running,
            };

            let owner = proc_
                .user_id()
                .map(|u| u.to_string())
                .unwrap_or_else(|| "system".to_string());

            list.push(ProcessInfo {
                process_id: pid_u32.to_string(),
                pid: pid_u32,
                executable: exec_name,
                arguments: args,
                state: state as i32,
                owner,
            });
        }

        list.sort_by_key(|p| p.pid);
        list
    }

    pub fn kill_process(&self, pid_str: &str, _signal: i32) -> Result<(), ProcessError> {
        let pid_num: u32 = pid_str
            .parse()
            .map_err(|_| ProcessError::NotFound(pid_str.to_string()))?;

        let mut sys = match self.system.lock() {
            Ok(s) => s,
            Err(poisoned) => poisoned.into_inner(),
        };

        sys.refresh_processes(ProcessesToUpdate::All, true);

        let pid = Pid::from_u32(pid_num);
        if let Some(proc_) = sys.process(pid) {
            let success = proc_.kill();
            if success {
                Ok(())
            } else {
                Err(ProcessError::KillFailed(format!(
                    "kill failed for pid {pid_num}"
                )))
            }
        } else {
            Err(ProcessError::NotFound(pid_str.to_string()))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_list_processes() {
        let manager = ProcessManager::new();
        let procs = manager.list_processes();
        assert!(!procs.is_empty(), "expected running processes");
        let my_pid = std::process::id();
        assert!(
            procs.iter().any(|p| p.pid == my_pid),
            "expected current test process to be listed"
        );
    }
}
