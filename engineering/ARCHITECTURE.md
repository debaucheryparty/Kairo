# Kairo Architecture

This document describes the architecture as it actually exists in the repository.
Verified against the source on 2026-11-20 (HEAD `f634106`; see TEST_MATRIX.md for build
evidence: gate 13, Windows 149 / Linux 154 tests). The target architecture for the Kairo OS
direction is [KAIRO_OS.md](KAIRO_OS.md).

## System overview

```
+---------------------+        +-------------------+        +---------------------------+
|  Local clients      |        |  Transport         |        |  Remote host (Linux/Win)  |
|  kairo-web (React)  |<-----> |  WebSocket direct  |<-----> |  kairo-agent              |
|  kairo-desktop      |        |  reverse tunnel    |        |   |- Session               |
|  (Tauri shell)      |        |  (relay fallback)  |        |   |    |- handlers        |
+---------------------+        +-------------------+        |   |    |- KairoCore       |
                                                             |   |         |- Bridge      |
                                                             |   |            |- adapters |
                                                             +---------------------------+
```

The client presents a desktop-like shell for a remote machine. Computation and state live on the
remote host; the agent exposes them over the Kairo Protocol. Kairo additionally maintains a
*managed* environment on the host (distinct from the host's own resources) — that boundary is the
core architectural idea: every operation carries an `ExecutionTarget` of `Host` or `Managed`.
Under the Kairo OS direction (ADR-0012), the web client becomes the primary product surface and
the remote side grows full desktop-environment sessions (see KAIRO_OS.md).

## Component map (verified)

### Crates

| Crate | Responsibility | Key modules |
|---|---|---|
| `crates/kairo-common` | Shared small types (ids) | `id.rs` |
| `crates/kairo-protocol` | Wire protocol: protobuf-generated messages + envelope (20-byte header, 16 MiB cap, opcode in flags) | `message.rs`, `build.rs` (prost), `proto/kairo/v1/*.proto` |
| `crates/kairo-transport` | Connection layer: WebSocket client (wss-capable via rustls), reverse tunnel with virtual streams, fallback | `websocket.rs`, `tunnel.rs` (largest), `fallback.rs` |
| `crates/kairo-discovery` | Host discovery: OS/init/packages/privileges/isolation/display/hardware → `SystemProfile` | `os_info.rs`, `init.rs`, `packages.rs`, `privileges.rs`, `isolation.rs`, `display.rs`, `hardware.rs` |
| `crates/kairo-bridge` | Platform adapter layer behind traits, selected by capabilities | `traits.rs` (`PlatformAdapter`, `ServiceOps`, `PackageOps`), `selector.rs`, `package/{apt,pacman,validation}.rs`, `service/{systemd,openrc}.rs`, `common/{runner,process,lock}.rs` |
| `crates/kairo-core` | Platform-independent APIs with authorization + audit; managed userspace | `auth.rs`, `audit.rs`, `fs.rs` (boundary-enforced), `package*.rs` (real artifact installs + receipts), `service.rs` + `runtime.rs` (supervisor), `config.rs` (declarative engine), `dots.rs`, `userspace.rs`, `state.rs` (checksummed envelopes), `target.rs` (`ExecutionTarget`) |

### Apps / packages

| Path | Role |
|---|---|
| `apps/kairo-agent` | Headless agent binary + library. WebSocket server with auth token, per-IP rate limiting, reverse-tunnel client, session handling; handlers: `pty` (portable-pty), `fs`, `process`, `system`, `app_manager` (freedesktop .desktop catalog), `gpu` (detection only — streaming is a stub), `gui/x11` (X11 capture via x11rb: composite/damage/xtest, raw-RGBA frames), `media` (MPRIS via playerctl), `notification` (in-memory stub), `metrics`; `logging.rs` (M8: rotation, retention, JSON option, correlation spans). One shared `KairoCore` per process. |
| `apps/kairo-web` | React 19 + Vite web client: end-4-derived desktop shell (dock, top-bar islands, spotlight, workspaces, window manager, boot flow) with `RemoteSurfaceViewer` rendering raw-RGBA surface frames on canvas and feeding input events back. Talks to the agent via `packages/kairo-runtime`. |
| `apps/kairo-desktop` | Tauri desktop shell wrapping the web client + agent sidecar on localhost (optional distribution channel). |
| `packages/kairo-runtime` | TypeScript client library: byte-exact envelope mirror, hand-written protobuf codec, resilient transport (backoff/failover), typed API incl. surface streaming. |
| `apps/kairo-cli` | Headless operator CLI (status, config, packages, services, dots). |

### Workspace layout

- Cargo workspace members: agent, cli, desktop (src-tauri), protocol, transport, common, discovery, bridge, core.
- pnpm workspace: `apps/*`, `packages/*`.
- Lints: workspace-wide `unsafe_code = deny`, `unwrap_used = deny`, `expect_used = warn`.

## Data flows

1. **Session establishment**: client connects (direct WebSocket to agent, or via relay tunnel).
   Handshake exchanges `SystemProfile` (discovered on the agent) and capabilities; auth token
   required unless `no_auth` (dev only). Failed auths feed the per-IP rate limiter.
2. **Interactive use**: terminal (PTY with backlog replay), filesystem ops (optimistic
   revision writes + watch), process/app management, metrics, remote GUI (X11 damage → dirty
   rectangles → raw-RGBA `SurfaceFrame` events; per-surface latest-wins relay in the session
   writer; input via XTEST), media and notifications.
3. **Host management**: agent handlers call `KairoCore` APIs; core checks `AuthContext` against
   `OperationLevel` (Read < Modify < Privileged), executes through the bridge adapter
   (host target) or the managed userspace (managed target), records audit events.
4. **Managed lifecycle**: declarative config documents apply files → packages (checksummed,
   transactional, receipts) → services (supervised processes with restart policies, SIGTERM→
   SIGKILL stop, log capture, autostart at agent boot); dots apply to the host home behind the
   authorization gate (ADR-0010).

## Security boundaries

- **Client ↔ agent**: WebSocket; auth token; rate limiting on handshake failures. TLS terminates
  outside the agent process today (reverse proxy / tunnel) — `tls_cert`/`tls_key` exist in
  `AgentConfig` but are not consumed by the listener (tracked in KAIRO_OS.md / M11 remainder).
- **Managed ↔ host**: `ExecutionTarget` + `SystemBoundaries.managed_root`; canonicalize-based
  containment, symlink rejection, atomic temp+rename writes (SEC-01/02 fixed).
- **Privilege**: `OperationLevel::Privileged` requires elevated or confirmed sudo identity;
  host package/service ops are audited.
- **Unsafe code**: denied workspace-wide (single documented `libc::kill` allow in `runtime.rs`).

## Known architectural debts (tracked, not hidden)

1. GPU streaming is a stub: `gpu.rs::start_stream` records state and returns a fabricated
   endpoint; frames are raw RGBA with no encoder (KAIRO_OS.md §6 — desktop streaming milestone).
2. Sessions are 1:1 with WebSocket connections and managers are singletons — no desktop-session
   registry, reattach, or multi-viewer support (KAIRO_OS.md §4).
3. No audio, clipboard-sync, or cursor-shape channels in the protocol.
4. SEC-07 (token expiry/revocation) and SEC-08 remainder (socket-level caps, output bounds)
   open — M11 remainder; SEC-03 open (identity strength) — M12 close-out.
5. The supervisor kills a single process, not a process tree — compositor sessions need
   `setsid`/cgroup-based teardown (KAIRO_OS.md §7).
6. `install.sh` has never been executed; CI produces no Linux agent artifact for it to
   download (M10 + OS-era installer milestone).
7. The web client (shell + streaming) has no automated tests.
8. `packages/kairo-runtime` TS opcode enum has drifted from the Rust enum (missing 62–64).
