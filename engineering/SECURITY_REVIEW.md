# Kairo Security Review

Scope: the code as committed at baseline plus findings from source review on 2026-11-11.
Updated whenever security-sensitive functionality changes.

## Threat model

Assets: the remote host (files, processes, services, credentials), the managed Kairo
environment, client sessions, and audit integrity.

Adversaries considered:
1. **Unauthenticated network peer** reaching the agent port.
2. **Authenticated client with limited authorization** attempting operations above its level.
3. **Malicious package/artifact** delivered into the managed environment.
4. **Compromised agent process** attempting to escape the managed boundary into host resources.
5. **Compromised client** injecting oversized/malformed protocol messages.

## Trust boundaries

| Boundary | Control today | Status |
|---|---|---|
| Network → agent listener | bearer auth token; per-IP rate limit (5 failures / 60s window, 300s lockout) | IMPLEMENTED (`server.rs`) |
| Client session → core APIs | `AuthContext` + `OperationLevel` (Read < Modify < Privileged) | IMPLEMENTED, coarse (`auth.rs`) |
| Managed → host filesystem | `ExecutionTarget::Managed` path resolution under `managed_root` | PARTIAL — see SEC-01/02 |
| Privileged host ops | requires `is_elevated` or `has_sudo && confirmed` | IMPLEMENTED |
| Transport encryption | delegated to reverse proxy / tunnel; agent speaks plain WS on localhost/LAN | NOT VERIFIED in-repo |
| Secrets at rest | auth token from config/env; no secret store | MISSING (M3/M4 requirement) |

## Findings

### SEC-01 — Managed path traversal is silently clamped instead of rejected (Medium)
`crates/kairo-core/src/fs.rs::resolve_path` folds `..` components and drops a leading drive/root,
so `../../etc/shadow` resolves to an in-root path rather than returning an error. Nothing escapes,
but callers get a *different* path than requested with no signal. Production behavior should reject
traversal explicitly (error) and cover it with a test. **Fix planned: M2.**

### SEC-02 — No symlink / canonicalization defense for managed paths (High)
`fs::read`/`fs::write`/`remove_dir_all` follow symlinks and junctions. A symlink planted inside the
managed root (e.g. by a malicious package) resolves outside it on the next managed operation.
`canonicalize`-based containment plus refusal to traverse symlinks out of root is required.
**Fix planned: M2 (with tests planting a symlink to an outside directory).**

### SEC-03 — `OperationLevel::Read` authorizes every actor (Medium)
`PermissionManager::require_level(auth, Read)` returns `Ok(())` unconditionally, so any
`AuthContext` (including one constructed for an unauthenticated actor) may read managed content.
Authentication of the *connection* is enforced separately in the session, but the permission model
itself has no notion of identity strength. **Fix planned: M2 (session-bound identities).**

### SEC-04 — Managed package install is a registry write, not an installation (High, integrity)
`PackageApi::install(..., ExecutionTarget::Managed, ...)` inserts the requested name into an
in-memory `HashMap` with version `"1.0.0"` and reports success. No artifact is fetched, no checksum
verified, nothing lands on disk. This is exactly the "fake installation" pattern that must not ship:
it reports success for packages that do not exist. **Fix planned: M6 (real artifact pipeline).**

### SEC-05 — Managed state is lost on agent restart (Medium, reliability/security)
Managed service/package state is `RwLock<HashMap<..>>` in the process. Restart loses it; a
"stopped" service silently returns to its default state. Persisted, integrity-checked state is
required before any managed-service claim is credible. **Fix planned: M3/M7.**

### SEC-06 — Agent logs the auth token in the startup line (Low/Medium)
`server.rs` `info!(auth_token=[redacted] ...)` — verified that the field is redacted at emit time in
the current source (`auth_token=[redacted]`); re-check on every change to that macro. Ensure no
other log statement prints tokens. **Action: grep gate before release.**

### SEC-07 — Session lifecycle lacks expiry/revocation (Medium)
Tokens are long-lived bearer tokens; there is no expiry, rotation, or revocation list. Required by
the production scope (§G). **Fix planned: M11.**

### SEC-08 — No protocol size/rate limits beyond handshake rate limiting (Medium)
Oversized messages and unbounded command output are not uniformly bounded; tunnel buffers are
32KiB duplex but message-level caps need auditing in `session.rs`. **Fix planned: M11 with tests.**

## Verified good practices

- Workspace denies `unsafe_code`; `unwrap_used` denied by lint config.
- Service names are validated against an allowlist before reaching `systemctl` (`systemd.rs`).
- Package name validation module exists in `kairo-bridge/src/package/validation.rs`; host package
  commands are built as argv arrays, not shell strings (verified for apt/pacman adapters).
- Per-IP rate limiter prevents trivial auth brute force.
- Audit log records actor, target, action, severity, and success for every core mutation.

## Open questions to resolve with evidence (not assumptions)

1. Is the reverse tunnel relay authenticating agents with the same token? (read `tunnel.rs` end-to-end)
2. Does the web client persist tokens in IndexedDB with acceptable lifetime? (audit `packages/kairo-runtime`)
3. Are TLS roots validated for tunnel connections (`rustls-tls-native-roots` feature implies yes)?
