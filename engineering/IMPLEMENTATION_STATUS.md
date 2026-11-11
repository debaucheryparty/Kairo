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
| **Declarative configuration engine** | NOT_STARTED | — | — | M4 |
| **Kairo Dots (dotfiles/profiles)** | NOT_STARTED | — | — | M5 |
| **Real managed packages** | TESTED | `crates/kairo-core/src/package*.rs` | `tests/package_test.rs` (7 + env-gated HTTP test) | artifact acquisition (local + HTTP), sha-256 verify, hardened tar.gz extraction, dependency ordering, transactional install, persisted receipts, upgrade/rollback — replaces the registry-only stub (SEC-04 fixed) |
| **Service runtime (supervision)** | NOT_STARTED | — | — | managed services today are in-memory toggles (M7) |
| **Operator CLI** | NOT_STARTED | — | — | M9 |
| **Install/lifecycle** | PARTIAL | `scripts/install.sh` (Linux) | never executed | no Windows path, no upgrade/uninstall (M10) |
| **Observability (structured logs, rotation)** | PARTIAL | tracing-subscriber in agent | none | correlation IDs absent (M8) |
| Windows host support | PARTIAL | workspace compiles on Windows (verified) | unit tests on Windows only | no native Windows adapter for service/package ops yet; not claimed as supported |
| macOS host support | NOT_STARTED | — | — | explicitly unsupported until a real adapter + tests exist |

## Known limitations (honest list)

1. Managed package/service state is process-local memory; restarting the agent loses it.
2. `ExecutionTarget::Managed` filesystem ops have no persistence guarantees beyond plain files.
3. No tests exist for kairo-web or kairo-runtime (TS).
4. CI runs only a desktop-release workflow; no workspace test CI yet.
