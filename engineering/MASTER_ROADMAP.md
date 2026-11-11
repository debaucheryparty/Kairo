# Kairo Master Roadmap

Kairo is a remote computer platform: a local client (web/desktop) operates a remote Linux host
through the Kairo Agent, with the host managed as an independent environment (managed userspace,
packages, services, configuration) rather than as a raw shell panel.

This roadmap covers the complete production scope. Statuses live in
[IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md); test evidence in
[TEST_MATRIX.md](TEST_MATRIX.md).

## Subsystems and phases

| Phase | Subsystem | Depends on | Scope |
|---|---|---|---|
| M0 | Engineering docs | — | This directory; kept synchronized with the code |
| M1 | Baseline integrity | M0 | Workspace check/test/fmt/clippy clean; pre-existing uncommitted work verified and committed |
| M2 | Core hardening | M1 | Filesystem boundary enforcement (traversal rejection, symlink/canonicalization), atomic writes, audit persistence |
| M3 | Managed userspace | M2 | Persistent managed root layout (config, packages, services, state, logs, cache, tmp), init/migration-safe, ownership boundaries |
| M4 | Declarative configuration | M3 | Versioned schema, desired/actual state, drift detection, idempotent apply, dependency ordering, transaction + rollback, backups |
| M5 | Kairo Dots | M4 | Declarative profiles, managed dotfiles with templates, backup/restore, conflict + drift detection, import/export. Host dotfiles are never touched without explicit authorization |
| M6 | Managed packages | M3 | Real artifact acquisition (source, checksum verification, unpack/install into managed root), receipts, dependency graph, rollback. Replaces the current register-only managed install |
| M7 | Service runtime | M3 | Process supervision, restart policies, env injection, log capture, health checks, graceful shutdown, crash detection |
| M8 | Observability | M2 | Structured logs, correlation IDs, log rotation/retention, error classification |
| M9 | CLI | M3–M8 | Headless-first operator CLI over userspace, config, dots, packages, runtime |
| M10 | Install/lifecycle | M9 | Host detection, install/upgrade/uninstall, headless Linux first-class, data preservation |
| M11 | Agent/transport hardening | M2 | Bounded queues, backpressure, heartbeats, protocol versioning negotiation, session revocation |
| M12 | Cross-platform verification | M1 | Windows (dev host) and Linux (Debian 13 verification box) verified; macOS documented as unimplemented until real adapters + tests exist |

## Release milestones

- **R0 (internal)** — M0–M1 complete, all engineering docs live, baseline committed and pushed.
- **R1 (alpha)** — M2–M4 complete on Windows + Linux with tests; managed config reproducible.
- **R2 (beta)** — M5–M9 complete; packages install real artifacts; runtime supervises real apps; CLI usable headless.
- **R3 (production)** — M10–M12 complete; install/upgrade/recovery verified on clean hosts; security review closed or accepted; docs sufficient for independent operation.

## Production completion criteria (gate to R3)

1. `cargo check --workspace`, `cargo test --workspace`, `cargo fmt --all -- --check`,
   `cargo clippy --workspace --all-targets -- -D warnings` all clean on Windows and Linux.
2. Managed package install performs a real, checksum-verified artifact installation with a
   persisted receipt; removing it leaves no orphans.
3. Applying a declarative profile twice produces no changes (idempotence) and drift is detected.
4. A supervised managed app survives agent restart per its restart policy and is stopped cleanly.
5. Path traversal, symlink escape, and oversized-message attempts are rejected by tests.
6. Fresh-clone build from clean checkout on both platforms.
7. No plaintext secrets in repo, config, or logs; audit log records privileged actions.
8. Every claim in IMPLEMENTATION_STATUS.md agrees with the code and TEST_MATRIX.md evidence.

## Explicitly out of scope / deferred

- New kernel, Linux distribution, mandatory Docker/systemd, graphical-first design.
- macOS support until a real adapter and a macOS test host exist (documented, not claimed).
- Rewriting working agent/transport/web functionality without a demonstrated reason.
