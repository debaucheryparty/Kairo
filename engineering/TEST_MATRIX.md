# Kairo Test Matrix

Only actually executed results are recorded. Platforms:
- **Windows** dev host: Windows 11, PowerShell 5.1, rustc/cargo 1.96.0, Node 24.20.0
- **Linux** verification host: InstaBox machine `m_agq3cscsuugpmq6rcmyfurqrlq` (Debian 13 trixie,
  kernel 6.18.60-instabox, x86_64, 4 vCPU, 8 GiB, rustc 1.99.0, Node 22.23.3, pnpm, docker,
  passwordless sudo)

## Workspace verification (Rust)

| Command | Date | Platform | Result | Evidence |
|---|---|---|---|---|
| `cargo check --workspace` | 2026-11-11 | Windows | PASS (2 unused-import warnings, fixed) | session logs |
| `cargo test --workspace --no-fail-fast` (baseline, pre-fmt) | 2026-11-11 | Windows | 1 failure: stale exact-count assertion in `filesystem_test` (session now creates the managed root); all other suites pass | test-run3.log |
| `cargo test -p kairo-core` / `-test filesystem_test` (post-fix) | 2026-11-11 | Windows | PASS 6/6 · 2/2 | core_test updated to current bridge runner API |
| `cargo fmt --all` | 2026-11-11 | Windows | applied (pre-existing debt) | commit history |
| `cargo test --workspace` (post-fmt baseline) | 2026-11-11 | Windows | PASS: 104 tests, 0 failed | test-run4.log |
| `cargo clippy --workspace --all-targets -- -D warnings` (baseline) | 2026-11-11 | Windows | PASS after removing 2 leftover imports | clippy2.log |
| `cargo test --workspace` (after M2 fs hardening) | 2026-11-11 | Windows | PASS: 106 tests, 0 failed | test-run5.log |
| `cargo test --workspace` (after M3 userspace) | 2026-11-11 | Windows | PASS: 113 tests, 0 failed | test-run6.log |
| `cargo clippy --workspace --all-targets -- -D warnings` (after M3) | 2026-11-11 | Windows | **PASS (exit 0)** | clippy3.log |
| `cargo check --workspace` | 2026-11-11 | Linux | PASS (after installing `protobuf-compiler` + webkit2gtk dev packages + building the agent sidecar into `apps/kairo-desktop/src-tauri/binaries/` per tauri.conf.json externalBin — gitignored, so a clean checkout needs this prep step; M10 work) | /tmp/kairo-check.log on box |
| `cargo fmt --all -- --check` | 2026-11-11 | Linux | PASS (gates 3–7) | /tmp/kairo-fmt.log |
| `cargo clippy -D warnings` | 2026-11-11 | Linux | PASS (gate 4 found 4 rustc-1.99-only lint errors, fixed in 6c74259; gate 7 re-confirmed after M3) | /tmp/kairo-clippy.log |
| `cargo test --workspace` (gates 3–6) | 2026-11-11 | Linux | verification found and fixed 4 real defects: apt-lock false positive (109754d), Xvfb display race (caf03ed), windows-only traversal expectation (6c74259), parallel tests sharing one display (5dd6c19) | /tmp/kairo-test.log |
| `cargo test --workspace` (gate 7, after M3) | 2026-11-11 | Linux | **PASS: 115 tests, 0 failed** | /tmp/kairo-test.log |
| `cargo test --workspace` (after M6 packages, gate 8) | 2026-11-11 | Windows | **PASS: 120 tests, 0 failed** (HTTP test run with `KAIRO_TEST_HTTP=1`) | test-run7.log |
| `cargo test --workspace` (after M6, gate 8, `KAIRO_TEST_HTTP=1`) | 2026-11-11 | Linux | **PASS: 123 tests, 0 failed**; fmt + clippy `-D warnings` PASS; real HTTP artifact acquisition verified against a local server on the box | /tmp/kairo-test.log on box |
| `cargo test --workspace` (after M7 runtime, gate 9d, `KAIRO_TEST_HTTP=1`) | 2026-11-11 | Windows | **PASS: 126 tests, 0 failed** | test-run8.log |
| `cargo test --workspace` (after M7, gate 9d, `KAIRO_TEST_HTTP=1`) | 2026-11-11 | Linux | **PASS: 129 tests, 0 failed**; fmt + clippy `-D warnings` PASS; SIGTERM-based graceful stop exercised on the box | /tmp/kairo-test.log on box |
| `cargo test --workspace` (after M4 config engine + protocol cap, gate 10, `KAIRO_TEST_HTTP=1`) | 2026-11-12 | Windows | **PASS: 133 tests, 0 failed** | test-run9.log |
| `cargo test --workspace` (gate 10, `KAIRO_TEST_HTTP=1`) | 2026-11-12 | Linux | **PASS: 137 tests, 0 failed**; fmt + clippy `-D warnings` PASS | /tmp/kairo-test.log on box |
| `cargo test --workspace` (after M5 dots, gate 11, `KAIRO_TEST_HTTP=1`) | 2026-11-12 | Windows | **PASS: 142 tests, 0 failed** | test-run10.log |
| `cargo test --workspace` (gate 11, `KAIRO_TEST_HTTP=1`) | 2026-11-12 | Linux | **PASS: 147 tests, 0 failed**; clippy `-D warnings` PASS; fmt initially found rustfmt drift from hand-built code — fixed in 07f09d3, fmt re-verified PASS on the box | /tmp/kairo-test.log on box |

## Suite counts (baseline run, `--no-fail-fast`, Windows)

| Suite | Result |
|---|---|
| kairo-agent unit (lib) | 14 passed |
| kairo-agent tests/audit_test | 3 passed |
| kairo-agent tests/bridge_e2e_test | 1 passed |
| kairo-agent tests/discovery_test | 6 passed |
| kairo-agent tests/filesystem_test | 2 passed (after fix) |
| kairo-agent tests/handshake_test | 3 passed |
| kairo-agent tests/media_and_notification_test | 3 passed |
| kairo-agent tests/metrics_test | 1 passed |
| kairo-agent tests/process_test | 1 passed |
| kairo-agent tests/remote_surface_test | 3 passed |
| kairo-agent tests/system_test | 1 passed |
| kairo-agent tests/terminal_test | 2 passed |
| kairo-bridge tests/bridge_test | 11 passed |
| kairo-common unit | 5 passed |
| kairo-core tests/core_test | 8 passed (6 original + 2 boundary tests) |
| kairo-core tests/userspace_test | 7 passed (M3) |
| kairo-discovery unit | 35 passed |
| kairo-transport unit | 5 passed |
| kairo-protocol unit | 3 passed |

## Linux environment prerequisites (found by verification; M10 installer inputs)

- `protobuf-compiler` (kairo-protocol build.rs needs `protoc`)
- Tauri desktop crate: `libwebkit2gtk-4.1-dev build-essential libxdo-dev libssl-dev
  libayatana-appindicator3-dev librsvg2-dev libgtk-3-dev`
- Agent sidecar prep: build `kairo-agent`, copy to
  `apps/kairo-desktop/src-tauri/binaries/kairo-backend-<target>` per `tauri.conf.json` externalBin
- Remote GUI: `xvfb xterm x11-utils x11-xserver-utils xfonts-base` (xterm without bitmap fonts
  does not draw → no damage frames)

## Known gaps (not yet covered)

1. No real-host integration test drives `apt`/`systemctl` end-to-end (bridge tests use mocks;
   the Debian box can run these — M6).
2. No tests for kairo-web / kairo-runtime (TypeScript) — `pnpm typecheck` only, not yet automated
   in this matrix.
3. Failure-injection, upgrade/migration, and performance tests are roadmap M4+ work.
4. Windows full `clippy` was re-run after M3 and passes; both platforms are at the same gate
   standard.
