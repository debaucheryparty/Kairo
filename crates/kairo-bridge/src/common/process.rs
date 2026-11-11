use crate::error::BridgeError;
use crate::traits::ProcessOps;
use kairo_protocol::v1::{ProcessInfo, ProcessState};
use std::sync::Mutex;
use sysinfo::{Pid, ProcessesToUpdate, Signal, System};

#[derive(Debug)]
pub struct CommonProcessManager {
    system: Mutex<System>,
}

impl Default for CommonProcessManager {
    fn default() -> Self {
        Self::new()
    }
}

impl CommonProcessManager {
    #[must_use]
    pub fn new() -> Self {
        let mut sys = System::new();
        sys.refresh_processes(ProcessesToUpdate::All, true);
        Self {
            system: Mutex::new(sys),
        }
    }
}

impl ProcessOps for CommonProcessManager {
    fn list_processes(&self) -> Result<Vec<ProcessInfo>, BridgeError> {
        let mut sys = self.system.lock().unwrap_or_else(|e| e.into_inner());
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

        Ok(list)
    }

    fn kill_process(&self, pid: u32, signal: i32) -> Result<(), BridgeError> {
        let mut sys = self.system.lock().unwrap_or_else(|e| e.into_inner());
        sys.refresh_processes(ProcessesToUpdate::All, true);

        let pid_sys = Pid::from_u32(pid);
        let Some(proc_) = sys.process(pid_sys) else {
            return Err(BridgeError::ExecutionFailed(format!(
                "process {pid} not found"
            )));
        };

        let sig = match signal {
            9 => Signal::Kill,
            15 => Signal::Term,
            2 => Signal::Interrupt,
            1 => Signal::Hangup,
            _ => Signal::Term,
        };

        if proc_.kill_with(sig).unwrap_or(false) {
            Ok(())
        } else {
            Err(BridgeError::ExecutionFailed(format!(
                "failed to send signal {signal} to process {pid}"
            )))
        }
    }
}
