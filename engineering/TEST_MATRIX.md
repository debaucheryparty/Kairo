# Kairo Test Matrix

Only actually executed results are recorded. Platform: Windows dev host unless stated.
- Host: Windows 11, PowerShell 5.1, rustc/cargo 1.96.0, Node 24.20.0, git 2.52.0
- Linux verification host: InstaBox `app` machine `m_agq3cscsuugpmq6rcmyfurqrlq`
  (Debian 13 trixie, kernel 6.18.60-instabox, x86_64, 4 vCPU, 8 GiB, Rust 1.99.0, Node 22.23.3,
  pnpm, Docker, passwordless sudo)

## Workspace verification (Rust)

| Command | Date | Platform | Result | Evidence |
|---|---|---|---|---|
| `cargo check --workspace` | 2026-11-11 | Windows | PASS, 1m45s, 2 unused-import warnings → fixed | scratch logs (transient); warnings eliminated in same session |
| `cargo test --workspace --no-fail-fast` (pre-fmt) | 2026-11-11 | Windows | 1 failure: `filesystem_test::test_filesystem_e2e_over_websocket` (stale exact-count assertion vs. newly created managed root); all others pass (see counts below) | test-run3.log |
| `cargo test -p kairo-agent --test filesystem_test` (post-fix) | 2026-11-11 | Windows | PASS 2/2 | |
| `cargo test -p kairo-core` (post-fix) | 2026-11-11 | Windows | PASS 6/6 | core_test updated to current bridge runner API |
| `cargo fmt --all` | 2026-11-11 | Windows | applied; pre-existing debt in session.rs + others | commit history |
| `cargo test --workspace --no-fail-fast` (post-fmt) | 2026-11-11 | Windows | **PASS: 104 tests, 0 failed (exit 0)** | test-run4.log |
| `cargo clippy --workspace --all-targets -- -D warnings` | 2026-11-11 | Windows | **PASS (exit 0)** after removing 2 unused imports in core_test.rs | clippy2.log |
| `cargo test --workspace --no-fail-fast` (after M2 hardening) | 2026-11-11 | Windows | **PASS: 106 tests, 0 failed** | test-run5.log |
| `cargo check --workspace` | 2026-11-11 | **Linux** (Debian 13, rustc 1.99) | PASS after installing `protobuf-compiler` + webkit2gtk dev packages and building the agent sidecar binary into `apps/kairo-desktop/src-tauri/binaries/` (tauri.conf.json externalBin; gitignored — a clean checkout needs this prep step, documented as M10 work) | /tmp/kairo-check.log on box |
| `cargo fmt --all -- --check` | 2026-11-11 | Linux | PASS | /tmp/kairo-fmt.log |
| `cargo clippy -D warnings` | 2026-11-11 | Linux | **PASS** (gate 4, exit 0) after fixing 4 rustc-1.99-only lint errors | /tmp/kairo-clippy.log |
| `cargo test --workspace` (gate 6, final) | 2026-11-11 | Linux | **PASS: 108 tests, 0 failed (exit 0)** | /tmp/kairo-test.log |

## Linux environment prerequisites (found by verification; M10 installer inputs)

- `protobuf-compiler` (kairo-protocol build.rs needs `protoc`)
- Tauri desktop crate: `libwebkit2gtk-4.1-dev build-essential libxdo-dev libssl-dev
  libayatana-appindicator3-dev librsvg2-dev libgtk-3-dev`
- Agent sidecar prep: build `kairo-agent`, copy to
  `apps/kairo-desktop/src-tauri/binaries/kairo-backend-<target>` per `tauri.conf.json` externalBin
- Remote GUI: `xvfb xterm x11-utils x11-xserver-utils xfonts-base` (xterm without bitmap fonts
  does not draw → no damage frames)
| `cargo test --workspace --no-fail-fast` (after M2 hardening) | 2026-11-11 | Windows | **PASS: 106 tests, 0 failed** | test-run5.log |
| `cargo check --workspace` | 2026-11-11 | **Linux** (Debian 13, rustc 1.99) | PASS after installing `protobuf-compiler` + webkit2gtk dev packages and building the agent sidecar binary into `apps/kairo-desktop/src-tauri/binaries/` (tauri.conf.json externalBin; gitignored — a clean checkout needs this prep step, documented as M10 work) | /tmp/kairo-check.log on box |
| `cargo fmt --all -- --check` | 2026-11-11 | Linux | PASS | /tmp/kairo-fmt.log |
| `cargo test --workspace` | 2026-11-11 | Linux | found 5 real failures (apt-lock false positive, Xvfb display race, windows-only traversal expectation, 4 newer-clippy lint errors); all fixed and re-verified — see gate 4 | /tmp/kairo-test.log |
| `cargo clippy -D warnings` | 2026-11-11 | Linux | 4 lint errors on rustc 1.99 (fixed: cfg-shadowed bindings, as_chunks_mut, byte str) — gate 4 pending re-run | /tmp/kairo-clippy.log |

## Suite counts (pre-fmt run, `--no-fail-fast`)

| Suite | Result |
|---|---|
| kairo-agent unit (lib) | 14 passed |
| kairo-agent tests/audit_test | 3 passed |
| kairo-agent tests/bridge_e2e_test | 1 passed |
| kairo-agent tests/discovery_test | 6 passed |
| kairo-agent tests/filesystem_test | 1 passed / 1 failed → fixed |
| kairo-agent tests/handshake_test | 3 passed |
| kairo-agent tests/media_and_notification_test | 3 passed |
| kairo-agent tests/metrics_test | 1 passed |
| kairo-agent tests/process_test | 1 passed |
| kairo-agent tests/remote_surface_test | 3 passed |
| kairo-agent tests/system_test | 1 passed |
| kairo-agent tests/terminal_test | 2 passed |
| kairo-bridge tests/bridge_test | 11 passed |
| kairo-common unit | 5 passed |
| kairo-core tests/core_test | 6 passed (after API repair) |
| kairo-discovery unit | 35 passed |
| kairo-transport unit | 5 passed |
| kairo-protocol unit | 3 passed |

## Known gaps (not yet covered)

1. No Linux run of the workspace suite (InstaBox machine ready; clone + build next).
2. No integration test exercises `apt`/`systemctl` against a real host (bridge tests use mocks).
3. No tests for kairo-web / kairo-runtime (TypeScript) — `pnpm typecheck` only.
4. No failure-injection, upgrade/migration, or performance tests yet (roadmap M4+).
5. `cargo clippy -D warnings` gate not yet executed this session.
