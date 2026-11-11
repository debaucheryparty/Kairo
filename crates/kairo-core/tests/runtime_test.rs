#![allow(clippy::unwrap_used, clippy::expect_used)]

use std::path::Path;
use std::sync::Arc;
use std::time::{Duration, Instant};

use kairo_core::{
    ManagedServiceSpec, ManagedUserspace, RestartPolicy, ServiceState, ServiceStatus,
    ServiceSupervisor,
};
use tempfile::TempDir;


fn make_supervisor(data_dir: &Path) -> Arc<ServiceSupervisor> {
    let space = Arc::new(ManagedUserspace::init(data_dir).unwrap());
    Arc::new(ServiceSupervisor::new(space, Duration::from_millis(50)))
}

fn long_running_spec(name: &str) -> ManagedServiceSpec {
    #[cfg(windows)]
    let (command, args) = (
        "ping".to_string(),
        vec!["-n".to_string(), "30".to_string(), "127.0.0.1".to_string()],
    );
    #[cfg(not(windows))]
    let (command, args) = ("sleep".to_string(), vec!["30".to_string()]);

    ManagedServiceSpec {
        name: name.to_string(),
        description: format!("{name} test service"),
        command,
        args,
        working_dir: None,
        env: Vec::new(),
        restart_policy: RestartPolicy::Never,
        autostart: false,
    }
}

fn exiting_spec(name: &str, code: i32, log_line: &str) -> ManagedServiceSpec {
    #[cfg(windows)]
    let (command, args) = (
        "cmd".to_string(),
        vec![format!("/c echo {log_line} & exit /b {code}")],
    );
    #[cfg(not(windows))]
    let (command, args) = (
        "sh".to_string(),
        vec!["-c".to_string(), format!("echo {log_line}; exit {code}")],
    );

    ManagedServiceSpec {
        name: name.to_string(),
        description: format!("{name} exiting service"),
        command,
        args,
        working_dir: None,
        env: Vec::new(),
        restart_policy: RestartPolicy::Never,
        autostart: false,
    }
}

async fn wait_for_status(
    supervisor: &ServiceSupervisor,
    name: &str,
    predicate: impl Fn(&ServiceState) -> bool,
    timeout: Duration,
) -> ServiceStatus {
    let deadline = Instant::now() + timeout;
    loop {
        if let Some(status) = supervisor.list().into_iter().find(|s| s.name == name)
            && predicate(&status.state)
        {
            return status;
        }
        if Instant::now() > deadline {
            panic!("service '{name}' did not reach the expected state in time");
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
}

#[tokio::test]
async fn test_service_lifecycle_start_stop_and_logs() {
    let temp = TempDir::new().unwrap();
    let supervisor = make_supervisor(temp.path());

    supervisor
        .define_service(long_running_spec("sleeper"))
        .unwrap();
    supervisor.start_service("sleeper").await.unwrap();

    let running = wait_for_status(
        &supervisor,
        "sleeper",
        |s| *s == ServiceState::Running,
        Duration::from_secs(10),
    )
    .await;
    assert!(running.pid.unwrap_or(0) > 0);

    supervisor.stop_service("sleeper").await.unwrap();
    let stopped = wait_for_status(
        &supervisor,
        "sleeper",
        |s| *s == ServiceState::Stopped,
        Duration::from_secs(15),
    )
    .await;
    assert!(stopped.pid.is_none());

    // Starting again works after a stop.
    supervisor.start_service("sleeper").await.unwrap();
    wait_for_status(
        &supervisor,
        "sleeper",
        |s| *s == ServiceState::Running,
        Duration::from_secs(10),
    )
    .await;
    supervisor.stop_service("sleeper").await.unwrap();
}

#[tokio::test]
async fn test_service_stdout_is_captured_to_log_file() {
    let temp = TempDir::new().unwrap();
    let supervisor = make_supervisor(temp.path());

    supervisor
        .define_service(exiting_spec("logger", 0, "supervisor-log-line"))
        .unwrap();
    supervisor.start_service("logger").await.unwrap();
    wait_for_status(
        &supervisor,
        "logger",
        |s| *s == ServiceState::Exited,
        Duration::from_secs(10),
    )
    .await;

    let log = std::fs::read_to_string(temp.path().join("logs/logger.log")).unwrap();
    assert!(log.contains("supervisor-log-line"), "log content: {log}");
}

#[tokio::test]
async fn test_restart_policy_on_failure_caps_restarts() {
    let temp = TempDir::new().unwrap();
    let supervisor = make_supervisor(temp.path());

    let mut spec = exiting_spec("crasher", 3, "boom");
    spec.restart_policy = RestartPolicy::OnFailure { max_restarts: 2 };
    supervisor.define_service(spec).unwrap();
    supervisor.start_service("crasher").await.unwrap();

    let status = wait_for_status(
        &supervisor,
        "crasher",
        |s| *s == ServiceState::Failed,
        Duration::from_secs(15),
    )
    .await;
    assert_eq!(status.restarts, 2, "should have restarted exactly twice");
}

#[tokio::test]
async fn test_definitions_persist_across_supervisors() {
    let temp = TempDir::new().unwrap();
    let first = make_supervisor(temp.path());

    let mut spec = long_running_spec("persisted");
    spec.autostart = true;
    first.define_service(spec).unwrap();

    // A fresh supervisor over the same userspace sees the definition
    // (stopped) and starts it on autostart, like an agent restart would.
    let second = make_supervisor(temp.path());
    let loaded = second
        .list()
        .into_iter()
        .find(|s| s.name == "persisted")
        .expect("persisted definition visible");
    assert_eq!(loaded.state, ServiceState::Stopped);

    let started = second.start_autostart().await.unwrap();
    assert_eq!(started, vec!["persisted".to_string()]);
    wait_for_status(
        &second,
        "persisted",
        |s| *s == ServiceState::Running,
        Duration::from_secs(10),
    )
    .await;
    second.stop_service("persisted").await.unwrap();

    // A non-autostart service stays stopped after "restart"; the flagged
    // one is started again.
    let manual = long_running_spec("manual");
    first.define_service(manual).unwrap();
    let third = make_supervisor(temp.path());
    let started = third.start_autostart().await.unwrap();
    assert_eq!(started, vec!["persisted".to_string()]);
    let status = third
        .list()
        .into_iter()
        .find(|s| s.name == "manual")
        .expect("definition visible after load");
    assert_eq!(status.state, ServiceState::Stopped);
    third.stop_service("persisted").await.unwrap();
}

#[tokio::test]
async fn test_remove_rules_and_definition_replacement() {
    let temp = TempDir::new().unwrap();
    let supervisor = make_supervisor(temp.path());

    supervisor
        .define_service(long_running_spec("temp"))
        .unwrap();
    supervisor.start_service("temp").await.unwrap();
    wait_for_status(
        &supervisor,
        "temp",
        |s| *s == ServiceState::Running,
        Duration::from_secs(10),
    )
    .await;

    // Running services cannot be removed or redefined.
    assert!(supervisor.remove_service("temp").is_err());
    assert!(
        supervisor
            .define_service(long_running_spec("temp"))
            .is_err()
    );

    supervisor.stop_service("temp").await.unwrap();
    wait_for_status(
        &supervisor,
        "temp",
        |s| *s == ServiceState::Stopped,
        Duration::from_secs(15),
    )
    .await;

    supervisor.remove_service("temp").unwrap();
    assert!(supervisor.list().is_empty());
    // The persisted definition is gone too: a fresh supervisor sees nothing.
    let fresh = make_supervisor(temp.path());
    assert!(fresh.load_definitions().unwrap().is_empty());
}

#[tokio::test]
async fn test_start_unknown_service_fails() {
    let temp = TempDir::new().unwrap();
    let supervisor = make_supervisor(temp.path());
    let err = supervisor.start_service("ghost").await.unwrap_err();
    assert!(err.to_string().contains("not defined"));
}
