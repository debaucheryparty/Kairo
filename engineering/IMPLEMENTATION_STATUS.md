# Kairo Implementation Status

Inventory of every subsystem with honest statuses. Evidence rules:
- IMPLEMENTED = code exists and is wired into the product.
- TESTED = there are automated tests that actually run and pass.
- PRODUCTION_READY = TESTED plus real-platform verification plus review. Never granted for
  compile-only or stubbed behavior.
- Last updated: 2026-11-11.

| Subsystem | Status | Source | Tests | Notes |
|---|---|---|---|---|
| Protocol messages (protobuf) | IMPLEMENTED | `crates/kairo-protocol`, `proto/kairo/v1/` | handshake, remote_surface, bridge_e2e (agent tests) | new media/notification/discovery protos untracked in git until baseline commit |
| Transport (WS client, reverse tunnel, fallback) | IMPLEMENTED | `crates/kairo-transport` | agent handshake/remote_surface; bridge_e2e | bounded queues present; protocol version negotiation not implemented |
| Host discovery → SystemProfile | IMPLEMENTED | `crates/kairo-discovery` | `apps/kairo-agent/tests/discovery_test.rs` | Linux-focused; Windows paths unverified |
| Platform bridge + adapter selection | IMPLEMENTED | `crates/kairo-bridge` | `crates/kairo-bridge/tests/bridge_test.rs` | apt/pacman/systemd/openrc real command execution; unsupported-capability responses exist |
| Core APIs (fs/process/service/package/env/system) | IMPLEMENTED | `crates/kairo-core` | `crates/kairo-core/tests/core_test.rs` (6/6 pass) | audit ring + permission levels + reserved env keys |
| Managed filesystem boundary | TESTED | `crates/kairo-core/src/fs.rs` | core_test: boundary, escape rejection, symlink containment (Linux), atomic write | traversal + symlink escapes rejected explicitly; writes atomic via temp+rename — M2 done |
| Agent server (WS + tunnel + rate limit) | IMPLEMENTED | `apps/kairo-agent/src/server.rs`, `session.rs` | handshake_test | auth token; no session expiry/revocation yet |
| Terminal (PTY) | IMPLEMENTED | `apps/kairo-agent/src/pty.rs` | terminal_test.rs (385 lines) | |
| File manager backend | IMPLEMENTED | `apps/kairo-agent/src/fs.rs` | filesystem_test.rs | |
| Remote GUI (X11 capture/input) | TESTED (Linux) | `apps/kairo-agent/src/gui/` | remote_surface_test.rs | requires Xvfb + xterm + xfonts-base on headless hosts; Xvfb display allocation race fixed 2026-11-11 |
| Metrics | IMPLEMENTED | `apps/kairo-agent/src/metrics.rs` | via session tests | no rotation/retention policy yet |
| Media / notifications / GPU | IMPLEMENTED | `media.rs`, `notification.rs`, `gpu.rs` | media_and_notification_test.rs | |
| Web client shell | IMPLEMENTED | `apps/kairo-web` | none (manual) | large uncommitted UI rework; frontend not prioritized per roadmap |
| Desktop shell (Tauri) | IMPLEMENTED | `apps/kairo-desktop` | none | |
| TS runtime client | IMPLEMENTED | `packages/kairo-runtime` | none | IndexedDB + short-lived session tokens |
| **Managed userspace (persistent layout)** | TESTED | `crates/kairo-core/src/userspace.rs`, `state.rs` | `tests/userspace_test.rs` (7) | fixed layout under managed root, checksummed generation-tracked manifest, corrupt-file quarantine; core degrades gracefully if init fails |
| **Declarative configuration engine** | TESTED | `crates/kairo-core/src/config.rs` | `tests/config_test.rs` (5) | versioned schema v1 (files/packages/services), validate-before-apply, idempotent steps, file rollback on failure, drift detection, applied document persisted |
| **Kairo Dots (dotfiles/profiles)** | TESTED | `crates/kairo-core/src/dots.rs` | `tests/dots_test.rs` (9) | profiles with inheritance + `{{var}}` templates, conflict detection with explicit authorization, automatic backups + restore, drift detection, git-backed export/import (clones or inits+commits) |
| **Real managed packages** | TESTED | `crates/kairo-core/src/package*.rs` | `tests/package_test.rs` (7 + env-gated HTTP test) | artifact acquisition (local + HTTP), sha-256 verify, hardened tar.gz extraction, dependency ordering, transactional install, persisted receipts, upgrade/rollback — replaces the registry-only stub (SEC-04 fixed) |
| **Managed services / runtime supervision** | TESTED | `crates/kairo-core/src/runtime.rs`, `service.rs` | `tests/runtime_test.rs` (6) | real process launch, restart policies with backoff, SIGTERM→SIGKILL stop on Unix, log capture to userspace logs dir, definitions persisted via state store, autostart at agent boot; agent now shares one core across sessions (SEC-05 fixed) |
| **Operator CLI** | TESTED | `apps/kairo-cli` | `tests/cli_test.rs` (4, end-to-end via the real binary) | status, config validate/drift/apply, packages (managed+host, rollback), service define/list/remove, full dots workflow; text and --json output; svc start/stop route to the running agent (one-shot process cannot supervise — documented) |
| **Install/lifecycle** | PARTIAL | `scripts/install.sh` (Linux) | never executed | no Windows path, no upgrade/uninstall (M10) |
| **Observability (structured logs, rotation)** | TESTED | `apps/kairo-agent/src/logging.rs` | `tests/logging_test.rs` (1, end-to-end) + `logging.rs` prune unit test (1) | `--log-dir` adds a daily-rotated `kairo-agent.log.<date>` writer beside stdout, `--log-json` switches both layers to JSON lines; 14-day retention prune at boot and every 6 h; env filter applied once globally at the registry; `session_id` correlation span wraps the session loop incl. the spawned frame-writer task; session ends log an error classification (auth/transport/protocol/backend) |
| Windows host support | PARTIAL | workspace compiles on Windows (verified) | unit tests on Windows only | no native Windows adapter for service/package ops yet; not claimed as supported |
| macOS host support | NOT_STARTED | — | — | explicitly unsupported until a real adapter + tests exist |

## Known limitations (honest list)

1. Managed package/service state is process-local memory; restarting the agent loses it.
2. `ExecutionTarget::Managed` filesystem ops have no persistence guarantees beyond plain files.
3. No tests exist for kairo-web or kairo-runtime (TS).
4. CI runs only a desktop-release workflow; no workspace test CI yet.
