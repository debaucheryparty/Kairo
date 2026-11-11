# Kairo Architecture

This document describes the architecture as it actually exists in the repository.
Verified against the source on 2026-11-11 (see TEST_MATRIX.md for build evidence).

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

## Component map (verified)

### Crates

| Crate | Responsibility | Key modules |
|---|---|---|
| `crates/kairo-common` | Shared small types (ids) | `id.rs` |
| `crates/kairo-protocol` | Wire protocol: protobuf-generated messages + envelope | `message.rs`, `build.rs` (prost), `proto/kairo/v1/*.proto` |
| `crates/kairo-transport` | Connection layer: WebSocket client, reverse tunnel with virtual streams, fallback | `websocket.rs`, `tunnel.rs` (largest), `fallback.rs` |
| `crates/kairo-discovery` | Host discovery: OS/init/packages/privileges/isolation/display/hardware → `SystemProfile` | `os_info.rs`, `init.rs`, `packages.rs`, `privileges.rs`, `isolation.rs`, `display.rs`, `hardware.rs` |
| `crates/kairo-bridge` | Platform adapter layer behind traits, selected by capabilities | `traits.rs` (`PlatformAdapter`, `ServiceOps`, `PackageOps`), `selector.rs` (capability-based selection), `package/{apt,pacman,unsupported,validation}.rs`, `service/{systemd,openrc,unsupported}.rs`, `common/{runner,process,lock}.rs` |
| `crates/kairo-core` | Platform-independent APIs with authorization + audit | `auth.rs` (levels), `audit.rs` (ring buffer), `fs.rs` (boundary-enforced filesystem), `package.rs`, `service.rs`, `process.rs`, `env.rs` (reserved-key protection), `system.rs` (boundaries/resources), `target.rs` (`ExecutionTarget`) |

### Apps / packages

| Path | Role |
|---|---|
| `apps/kairo-agent` | Headless agent binary + library. WebSocket server with auth token, per-IP rate limiting, reverse-tunnel client, session handling; handlers: `pty` (portable-pty), `fs`, `process`, `system`, `app_manager` (installed apps), `gpu`, `gui/x11` (X11 screen capture via x11rb: composite/damage/xfixes/xtest), `media`, `notification`, `metrics`. Constructs `KairoCore` in `session.rs`. |
| `apps/kairo-web` | React web client (desktop shell UI: window manager, dock, file manager, terminal, remote surface viewer, spotlight). Talks to the agent via `packages/kairo-runtime`. |
| `apps/kairo-desktop` | Tauri desktop shell wrapping the web client. |
| `packages/kairo-runtime` | TypeScript client library: protocol envelope, session server connection, token handling. |

### Workspace layout

- Cargo workspace members: agent, desktop (src-tauri), protocol, transport, common, discovery, bridge, core.
- pnpm workspace: `apps/*`, `packages/*`.
- Lints: workspace-wide `unsafe_code = deny`, `unwrap_used = deny`, `expect_used = warn`.

## Data flows

1. **Session establishment**: client connects (direct WebSocket to agent, or via relay tunnel).
   Handshake exchanges `SystemProfile` (discovered on the agent) and capabilities; auth token
   required unless `no_auth` (dev only). Failed auths feed the per-IP rate limiter.
2. **Interactive use**: terminal (PTY), filesystem ops, process/app management, metrics, remote
   GUI (X11 damage events → dirty rectangles → client surface), media and notifications.
3. **Host management**: agent handlers call `KairoCore` APIs; core checks `AuthContext` against
   `OperationLevel` (Read < Modify < Privileged), executes through the bridge adapter, records
   audit events. Host operations run native tools (`apt`, `pacman`, `systemctl`, `rc-service`);
   managed operations act inside the managed root.

## Security boundaries

- **Client ↔ agent**: WebSocket; auth token; rate limiting on handshake failures. TLS terminates
  outside the agent process today (reverse proxy / tunnel) — documented in SECURITY_REVIEW.md.
- **Managed ↔ host**: `ExecutionTarget` + `SystemBoundaries.managed_root`; path resolution must
  confine managed operations (current enforcement details and gaps in SECURITY_REVIEW.md).
- **Privilege**: `OperationLevel::Privileged` requires elevated or confirmed sudo identity.
- **Unsafe code**: denied workspace-wide.

## Known architectural debts (tracked, not hidden)

1. Managed packages are a registry-only stub (no real artifact installation) — M6.
2. Managed services are in-memory only (not persisted, not supervised) — M7.
3. Filesystem boundary normalization silently clamps `..` and does not defend against symlinks — M2.
4. No declarative configuration, dotfiles management, or operator CLI yet — M4/M5/M9.
5. README describes an older vision and references docs/INDEX.md which does not exist.
