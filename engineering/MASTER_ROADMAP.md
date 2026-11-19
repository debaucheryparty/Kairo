# Kairo Master Roadmap

Kairo OS is a complete desktop operating environment that runs on an existing Linux machine and
is accessed from a browser: compositor-driven window management, workspaces, real applications,
terminal, filesystem, notifications, audio, clipboard, settings, and persistent sessions
(ADR-0012). The remote side is the existing Kairo agent extended with desktop-session
orchestration and streaming (design: [KAIRO_OS.md](KAIRO_OS.md)); the host is never re-imaged
and is used through controlled adapters.

This roadmap covers the complete production scope. Statuses live in
[IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md); test evidence in
[TEST_MATRIX.md](TEST_MATRIX.md). M0–M9 are complete and preserved; their contracts
(state store, package receipts, supervisor, audit, logging) are foundations, not legacy.

## Subsystems and phases

| Phase | Subsystem | Depends on | Scope |
|---|---|---|---|
| M0 | Engineering docs | — | This directory; kept synchronized with the code |
| M1 | Baseline integrity | M0 | Workspace check/test/fmt/clippy clean; pre-existing uncommitted work verified and committed |
| M2 | Core hardening | M1 | Filesystem boundary enforcement (traversal rejection, symlink/canonicalization), atomic writes, audit persistence |
| M3 | Managed userspace | M2 | Persistent managed root layout (config, packages, services, state, logs, cache, tmp), init/migration-safe, ownership boundaries |
| M4 | Declarative configuration | M3 | Versioned schema, desired/actual state, drift detection, idempotent apply, dependency ordering, transaction + rollback, backups |
| M5 | Kairo Dots | M4 | Declarative profiles, managed dotfiles with templates, backup/restore, conflict + drift detection, import/export |
| M6 | Managed packages | M3 | Real artifact acquisition, checksums, receipts, dependency graph, rollback |
| M7 | Service runtime | M3 | Process supervision, restart policies, env injection, log capture, graceful shutdown, crash detection |
| M8 | Observability | M2 | Structured logs, correlation IDs, log rotation/retention, error classification |
| M9 | CLI | M3–M8 | Headless-first operator CLI over userspace, config, dots, packages, runtime |
| M10 | Agent install/lifecycle | M9 | install.sh executed and verified on a clean host, upgrade/uninstall with data preservation, release artifact produced by CI |
| M11 | Agent/transport hardening | M2 | Token expiry/revocation (SEC-07), socket-level message caps + output bounds (SEC-08), protocol version negotiation |
| M12 | Cross-platform verification | M1 | Windows + Linux gates; macOS documented as unimplemented |
| M13 | Host capability report + provisioning planner | M3, M9 | Extend `kairo-discovery` with display/audio/isolation/access probes and a per-host verdict; produce a dry-run provisioning plan (exact commands, root needs) gated by explicit approval (SEC-11); per-trait support tiers (ADR-0015) |
| M14 | Desktop session orchestration | M13 | Supervisor teardown via process groups/cgroups; session registry persisted through the state store; sway-headless + wayvnc + mako + portals session launch per KAIRO_OS §6.1; reattach; per-session app catalog; client-driven resolution via sway IPC |
| M15 | Desktop streaming v1 | M14 | Agent RFB⇄WS bridge under agent auth; noVNC embedded in the React client; text clipboard sync (wlr-data-control + keeper); chunked file-transfer channel; `desktop.v1` capability + new protocol messages (cursor shape, multi-monitor geometry, session resume) |
| M16 | Session audio | M15 | Per-session PipeWire sink → Opus → WebRTC track (WS+AudioWorklet fallback); latency and drift acceptance tested |
| M17 | Isolation tiers | M14 | T0/T1/T2 per ADR-0014 behind the capability report; container image per session; per-session IPC/audio rule enforced; T0 labeled shared-privilege |
| M18 | Video v2 encode pipeline | M15 | Agent-side screencopy → x264/openh264 (licensing rule §12) → WebCodecs decode; FPS caps, bitrate adaptation, keyframe-on-attach; ZRLE fallback negotiation |
| M19 | Desktop UX completion | M15–M18 | Settings + theming over the real stream; workspace UI backed by sway IPC; session persistence across agent restarts; multi-viewer arbitration policy; end-4 chrome integration tests |
| M20 | OS installer/lifecycle | M13–M15 | Desktop-stack provisioning per distro matrix (KAIRO_OS §10), no-root and approval-gated paths, upgrade/uninstall with data preservation; supersedes the desktop-scoped remainder of the original M10 |

## Release milestones

- **R0 (internal)** — M0–M1 complete, all engineering docs live, baseline committed and pushed. **Achieved.**
- **R1 (alpha)** — M2–M4 complete on Windows + Linux with tests; managed config reproducible. **Achieved.**
- **R2 (beta, platform)** — M5–M9 complete; packages install real artifacts; runtime supervises real apps; CLI usable headless. **Achieved.**
- **R3 (production, platform)** — M10–M12 complete: install/upgrade/recovery verified on clean hosts; security review closed or accepted; docs sufficient for independent operation.
- **R4 (desktop alpha)** — M13–M15 complete: one real desktop session (sway + wayvnc) streams into the browser on the Debian verification host with input, clipboard and file transfer; reattach works; capability report gates provisioning.
- **R5 (desktop beta)** — M16–M17 + M20 complete: audio works end-to-end; sessions run in a real isolation tier; installer provisions the full stack on a fresh Debian 13 and Ubuntu 24.04 host.
- **R6 (OS production)** — M18–M19 + M12-era gates: adaptive video, persistent sessions, UX complete, every claim backed by TEST_MATRIX evidence.

## Production completion criteria (gate to R6)

1. `cargo check --workspace`, `cargo test --workspace`, `cargo fmt --all -- --check`,
   `cargo clippy --workspace --all-targets -- -D warnings` all clean on Windows and Linux.
2. All R3 criteria remain true (package integrity, idempotence, supervision, boundary tests,
   fresh-clone builds, no plaintext secrets, audit of privileged actions, doc-claim agreement).
3. A desktop session started on the Linux verification host streams to the browser client with
   working input, clipboard, and file transfer; killing and reopening the tab resumes the session.
4. The session tree is fully terminated when the session is stopped (no orphaned compositor,
   VNC, or application processes) — verified by process audit after teardown.
5. Provisioning never modifies the host without a presented plan and explicit approval; every
   privileged step is audited; the capability report's verdict matches observed reality on
   Ubuntu 24.04, Debian 13, Arch, and Fedora (tested on at least Debian 13 + one AppArmor-restricted host).
6. Isolation tier T1 sessions cannot see host user files outside their container (tested);
   audio/IPC sockets are never shared between sessions.
7. The agent's binaries remain MIT-clean: no GPL linking (x264 only as a separately installed
   host package or via openh264 fallback).
8. Web client desktop-shell UI has automated tests covering boot, connect, stream attach,
   and session resume.

## Explicitly out of scope / deferred

- New kernel, Linux distribution build-out, mandatory Docker/systemd (isolation tiers use what
  the host offers — containers are the preferred mechanism, not a requirement).
- macOS support until a real adapter and a macOS test host exist (documented, not claimed).
- Rewriting working agent/transport/protocol functionality without a demonstrated reason;
  desktop-era work extends the existing crates (ADR-0004/0012).
- ShojiWM as a dependency (ADR-0012).
- Windows desktop backend implementation until the Linux path is proven (traits designed in
  KAIRO_OS §5; sequencing deferred there).
