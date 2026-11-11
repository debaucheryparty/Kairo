//! Supervision of managed services: real processes, restart policies, log
//! capture, and definitions persisted through the integrity-checked state
//! store so they survive agent restarts.
//!
//! One supervisor instance owns the userspace root. The agent creates a
//! single KairoCore per process and shares it across sessions; tests create
//! short-lived supervisors on isolated roots. `start_service` must be called
//! from a tokio runtime context because it schedules the supervision task.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tokio::process::Command;
use tokio::sync::watch;

use crate::error::CoreError;
use crate::state::{load_state, store_state};
use crate::userspace::ManagedUserspace;

const SERVICES_KIND: &str = "kairo-managed-services";
const STOP_GRACE: Duration = Duration::from_secs(5);

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum RestartPolicy {
    Never,
    /// Restart on non-zero exit, at most `max_restarts` consecutive times.
    OnFailure {
        max_restarts: u32,
    },
    Always,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ManagedServiceSpec {
    pub name: String,
    pub description: String,
    pub command: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub working_dir: Option<String>,
    #[serde(default)]
    pub env: Vec<(String, String)>,
    pub restart_policy: RestartPolicy,
    #[serde(default)]
    pub autostart: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct PersistedServices {
    #[serde(default)]
    services: Vec<PersistedService>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
struct PersistedService {
    spec: ManagedServiceSpec,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ServiceState {
    Stopped,
    Running,
    Exited,
    Failed,
}

#[derive(Debug, Clone)]
pub struct ServiceStatus {
    pub name: String,
    pub description: String,
    pub state: ServiceState,
    pub pid: Option<u32>,
    pub restarts: u32,
    pub autostart: bool,
}

struct RuntimeState {
    state: ServiceState,
    pid: Option<u32>,
    restarts: u32,
}

struct ServiceEntry {
    spec: ManagedServiceSpec,
    runtime: std::sync::Mutex<RuntimeState>,
    stop_tx: watch::Sender<bool>,
    stop_rx: watch::Receiver<bool>,
    task: tokio::sync::Mutex<Option<tokio::task::JoinHandle<()>>>,
}

impl ServiceEntry {
    fn new(spec: ManagedServiceSpec) -> Arc<Self> {
        let (stop_tx, stop_rx) = watch::channel(false);
        Arc::new(Self {
            spec,
            runtime: std::sync::Mutex::new(RuntimeState {
                state: ServiceState::Stopped,
                pid: None,
                restarts: 0,
            }),
            stop_tx,
            stop_rx,
            task: tokio::sync::Mutex::new(None),
        })
    }

    fn is_running(&self) -> bool {
        self.runtime
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .state
            == ServiceState::Running
    }

    fn set_runtime(&self, state: ServiceState, pid: Option<u32>, restarts: Option<u32>) {
        let mut runtime = self
            .runtime
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        runtime.state = state;
        runtime.pid = pid;
        if let Some(count) = restarts_or_current(&runtime.restarts, restarts) {
            runtime.restarts = count;
        }
    }
}

fn restarts_or_current(current: &u32, new: Option<u32>) -> Option<u32> {
    new.or(Some(*current))
}

pub struct ServiceSupervisor {
    space: Arc<ManagedUserspace>,
    services: Arc<std::sync::Mutex<HashMap<String, Arc<ServiceEntry>>>>,
    restart_backoff: Duration,
}

impl ServiceSupervisor {
    #[must_use]
    pub fn new(space: Arc<ManagedUserspace>, restart_backoff: Duration) -> Self {
        Self {
            space,
            services: Arc::new(std::sync::Mutex::new(HashMap::new())),
            restart_backoff,
        }
    }

    fn services_file(&self) -> PathBuf {
        self.space.root().join("state").join("services.json")
    }

    fn load_persisted(&self) -> Result<PersistedServices, CoreError> {
        Ok(
            load_state::<PersistedServices>(&self.services_file(), SERVICES_KIND)?
                .map_or_else(PersistedServices::default, |doc| doc.data),
        )
    }

    fn persist(&self, persisted: &PersistedServices) -> Result<(), CoreError> {
        store_state(&self.services_file(), SERVICES_KIND, persisted)?;
        Ok(())
    }

    fn validate_spec(spec: &ManagedServiceSpec) -> Result<(), CoreError> {
        crate::package::manifest::validate_name(&spec.name)?;
        if spec.command.is_empty() {
            return Err(CoreError::InvalidArgument(format!(
                "service '{}' has no command",
                spec.name
            )));
        }
        Ok(())
    }

    fn entry(&self, name: &str) -> Result<Arc<ServiceEntry>, CoreError> {
        let map = self
            .services
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        if let Some(entry) = map.get(name) {
            return Ok(Arc::clone(entry));
        }
        drop(map);

        let persisted = self.load_persisted()?;
        let spec = persisted
            .services
            .iter()
            .find(|existing| existing.spec.name == name)
            .map(|existing| existing.spec.clone())
            .ok_or_else(|| CoreError::NotFound(format!("service '{name}' is not defined")))?;

        let entry = ServiceEntry::new(spec);
        let mut map = self
            .services
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        Ok(Arc::clone(map.entry(name.to_string()).or_insert(entry)))
    }

    /// Registers or replaces a service definition and persists it. Running
    /// services must be stopped before they are redefined.
    pub fn define_service(&self, spec: ManagedServiceSpec) -> Result<(), CoreError> {
        Self::validate_spec(&spec)?;

        if let Ok(entry) = self.entry(&spec.name)
            && entry.is_running()
        {
            return Err(CoreError::InvalidArgument(format!(
                "service '{}' is running; stop it before redefining",
                spec.name
            )));
        }

        let mut persisted = self.load_persisted()?;
        persisted
            .services
            .retain(|existing| existing.spec.name != spec.name);
        persisted
            .services
            .push(PersistedService { spec: spec.clone() });
        self.persist(&persisted)?;

        let mut map = self
            .services
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        map.insert(spec.name.clone(), ServiceEntry::new(spec));
        Ok(())
    }

    /// Removes a persisted definition; running services must be stopped
    /// first. Superseded files (logs) are kept.
    pub fn remove_service(&self, name: &str) -> Result<(), CoreError> {
        if let Ok(entry) = self.entry(name)
            && entry.is_running()
        {
            return Err(CoreError::InvalidArgument(format!(
                "service '{name}' is running; stop it before removing"
            )));
        }

        let mut persisted = self.load_persisted()?;
        persisted
            .services
            .retain(|existing| existing.spec.name != name);
        self.persist(&persisted)?;

        let mut map = self
            .services
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        map.remove(name);
        Ok(())
    }

    /// Launches the service under a supervision task applying the restart
    /// policy. Must be called from a tokio runtime context.
    pub async fn start_service(&self, name: &str) -> Result<(), CoreError> {
        let entry = self.entry(name)?;
        if entry.is_running() {
            return Ok(());
        }

        entry
            .stop_tx
            .send(false)
            .map_err(|_| CoreError::InvalidArgument("service supervisor is gone".to_string()))?;
        {
            let mut runtime = entry
                .runtime
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            runtime.restarts = 0;
        }

        let task_entry = Arc::clone(&entry);
        let logs_dir = self.space.logs_dir();
        let backoff = self.restart_backoff;
        let handle = tokio::spawn(async move {
            supervise(task_entry, logs_dir, backoff).await;
        });
        *entry.task.lock().await = Some(handle);
        Ok(())
    }

    /// Stops a running service: SIGTERM with a grace period on Unix (then
    /// SIGKILL), immediate termination on Windows. Waits for the supervision
    /// task to record the final state.
    pub async fn stop_service(&self, name: &str) -> Result<(), CoreError> {
        let entry = self.entry(name)?;

        if !entry.is_running() {
            return Ok(());
        }
        entry
            .stop_tx
            .send(true)
            .map_err(|_| CoreError::InvalidArgument("service supervisor is gone".to_string()))?;

        let task = entry.task.lock().await.take();
        if let Some(handle) = task {
            let _ = tokio::time::timeout(STOP_GRACE * 2, handle).await;
        }
        Ok(())
    }

    /// Starts every persisted definition flagged for autostart. Called once
    /// per agent process at startup (from a tokio context).
    pub async fn start_autostart(&self) -> Result<Vec<String>, CoreError> {
        let persisted = self.load_persisted()?;
        let mut started = Vec::new();
        for service in &persisted.services {
            if service.spec.autostart {
                self.start_service(&service.spec.name).await?;
                started.push(service.spec.name.clone());
            }
        }
        Ok(started)
    }

    /// Restores persisted definitions into memory without starting them.
    pub fn load_definitions(&self) -> Result<Vec<String>, CoreError> {
        let persisted = self.load_persisted()?;
        let mut map = self
            .services
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let mut names = Vec::new();
        for service in persisted.services {
            names.push(service.spec.name.clone());
            map.entry(service.spec.name.clone())
                .or_insert_with(|| ServiceEntry::new(service.spec));
        }
        Ok(names)
    }

    /// Lists all known services: live entries plus persisted definitions
    /// that have not been started in this process yet (reported stopped).
    #[must_use]
    pub fn list(&self) -> Vec<ServiceStatus> {
        let map = self
            .services
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let mut statuses: Vec<ServiceStatus> = map
            .values()
            .map(|entry| {
                let runtime = entry
                    .runtime
                    .lock()
                    .unwrap_or_else(std::sync::PoisonError::into_inner);
                ServiceStatus {
                    name: entry.spec.name.clone(),
                    description: entry.spec.description.clone(),
                    state: runtime.state.clone(),
                    pid: runtime.pid,
                    restarts: runtime.restarts,
                    autostart: entry.spec.autostart,
                }
            })
            .collect();
        let present: std::collections::HashSet<String> = map.keys().cloned().collect();
        drop(map);

        match self.load_persisted() {
            Ok(persisted) => {
                for service in persisted.services {
                    if !present.contains(&service.spec.name) {
                        statuses.push(ServiceStatus {
                            name: service.spec.name.clone(),
                            description: service.spec.description.clone(),
                            state: ServiceState::Stopped,
                            pid: None,
                            restarts: 0,
                            autostart: service.spec.autostart,
                        });
                    }
                }
            }
            Err(e) => {
                tracing::warn!(error = %e, "cannot read persisted services for listing");
            }
        }

        statuses.sort_by(|a, b| a.name.cmp(&b.name));
        statuses
    }
}

async fn supervise(entry: Arc<ServiceEntry>, logs_dir: PathBuf, backoff: Duration) {
    let mut stop_rx = entry.stop_rx.clone();
    let mut restarts: u32 = 0;

    loop {
        if *stop_rx.borrow_and_update() {
            entry.set_runtime(ServiceState::Stopped, None, Some(restarts));
            return;
        }

        let mut child = match spawn_service(&entry.spec).await {
            Ok(child) => child,
            Err(e) => {
                tracing::warn!(
                    service = %entry.spec.name,
                    error = %e,
                    "failed to spawn managed service"
                );
                entry.set_runtime(ServiceState::Failed, None, Some(restarts));
                return;
            }
        };
        let pid = child.id();
        entry.set_runtime(ServiceState::Running, pid, Some(restarts));

        let log_path = logs_dir.join(format!("{}.log", entry.spec.name));
        spawn_log_forwarders(&mut child, &log_path);

        let status = wait_supervised(&mut child, &mut stop_rx, pid).await;
        let success = status.as_ref().is_ok_and(|s| s.success());

        if *stop_rx.borrow_and_update() {
            entry.set_runtime(ServiceState::Stopped, None, Some(restarts));
            return;
        }

        match &entry.spec.restart_policy {
            RestartPolicy::Never => {
                entry.set_runtime(
                    if success {
                        ServiceState::Exited
                    } else {
                        ServiceState::Failed
                    },
                    None,
                    Some(restarts),
                );
                return;
            }
            RestartPolicy::OnFailure { max_restarts } if success || restarts >= *max_restarts => {
                entry.set_runtime(
                    if success {
                        ServiceState::Exited
                    } else {
                        ServiceState::Failed
                    },
                    None,
                    Some(restarts),
                );
                return;
            }
            RestartPolicy::Always | RestartPolicy::OnFailure { .. } => {
                restarts += 1;
                tracing::info!(
                    service = %entry.spec.name,
                    restarts,
                    "managed service exited; restarting after backoff"
                );
                tokio::time::sleep(backoff).await;
            }
        }
    }
}

/// Waits for the child, honoring the stop signal: on stop, SIGTERM first
/// (Unix) and SIGKILL after the grace period.
async fn wait_supervised(
    child: &mut tokio::process::Child,
    stop_rx: &mut watch::Receiver<bool>,
    pid: Option<u32>,
) -> Result<std::process::ExitStatus, std::io::Error> {
    let mut escalated = false;
    loop {
        if *stop_rx.borrow_and_update() && !escalated {
            if let Some(pid) = pid {
                signal_terminate(pid);
            }
            escalated = true;
        }

        if escalated {
            match tokio::time::timeout(STOP_GRACE, child.wait()).await {
                Ok(status) => return status,
                Err(_) => {
                    // A failed kill means the child already exited on its
                    // own; the wait below still yields the real status.
                    let _ = child.start_kill();
                    return child.wait().await;
                }
            }
        }

        tokio::select! {
            status = child.wait() => return status,
            _ = stop_rx.changed() => continue,
        }
    }
}

async fn spawn_service(spec: &ManagedServiceSpec) -> Result<tokio::process::Child, CoreError> {
    let mut command = Command::new(&spec.command);
    command.args(&spec.args);
    command.stdin(std::process::Stdio::null());
    command.stdout(std::process::Stdio::piped());
    command.stderr(std::process::Stdio::piped());
    if let Some(dir) = &spec.working_dir {
        command.current_dir(dir);
    }
    for (key, value) in &spec.env {
        command.env(key, value);
    }
    command.spawn().map_err(CoreError::Io)
}

/// Appends stdout and stderr to the service log file for this run.
fn spawn_log_forwarders(child: &mut tokio::process::Child, log_path: &Path) {
    if let Some(parent) = log_path.parent()
        && let Err(e) = std::fs::create_dir_all(parent)
    {
        tracing::warn!(path = %parent.display(), error = %e, "cannot create service log dir");
        // Streams without a log file still need draining to avoid the
        // child blocking on a full pipe.
        drain(child.stdout.take());
        drain(child.stderr.take());
        return;
    }

    let stdout_file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_path);
    let stderr_file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_path);

    match (stdout_file, stderr_file) {
        (Ok(out), Ok(err)) => {
            if let Some(stream) = child.stdout.take() {
                tokio::spawn(forward_to_file(stream, out));
            }
            if let Some(stream) = child.stderr.take() {
                tokio::spawn(forward_to_file(stream, err));
            }
        }
        (Err(e), _) | (_, Err(e)) => {
            tracing::warn!(path = %log_path.display(), error = %e, "cannot open service log file");
            drain(child.stdout.take());
            drain(child.stderr.take());
        }
    }
}

async fn forward_to_file(
    mut stream: impl tokio::io::AsyncRead + Send + Unpin + 'static,
    file: std::fs::File,
) {
    use tokio::io::AsyncReadExt;
    use tokio::io::AsyncWriteExt;
    let mut file = tokio::fs::File::from(file);
    let mut buf = vec![0u8; 8192];
    loop {
        match stream.read(&mut buf).await {
            Ok(0) | Err(_) => break,
            Ok(n) => {
                if file.write_all(&buf[..n]).await.is_err() {
                    break;
                }
            }
        }
    }
}

fn drain(stream: Option<impl tokio::io::AsyncRead + Send + Unpin + 'static>) {
    if let Some(mut stream) = stream {
        tokio::spawn(async move {
            use tokio::io::AsyncReadExt;
            let mut buf = vec![0u8; 8192];
            loop {
                match stream.read(&mut buf).await {
                    Ok(0) | Err(_) => break,
                    Ok(_) => {}
                }
            }
        });
    }
}

fn signal_terminate(pid: u32) {
    #[cfg(unix)]
    {
        // SIGTERM lets managed services shut down cleanly; wait_supervised
        // escalates to SIGKILL after the grace period.
        //
        // Safety: libc::kill only sends a signal to the given pid; it cannot
        // cause memory unsafety. A stale pid fails with ESRCH, which is
        // ignored — the supervision task still observes the child exiting.
        #[allow(unsafe_code)]
        let _ = unsafe { libc::kill(pid as libc::pid_t, libc::SIGTERM) };
    }
    #[cfg(not(unix))]
    {
        let _ = pid;
    }
}
