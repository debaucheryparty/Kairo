# Kairo Handoff

Persistent continuation document. Read this first, then MASTER_ROADMAP.md, then verify against
the source — the code always wins over this document.

**Last updated:** 2026-11-11 (session 1)
**Branch:** main · **HEAD at session start:** 673dda3

## Current project state

Kairo is a working remote-computer platform: agent (WebSocket + reverse tunnel, PTY, filesystem,
processes, apps, metrics, X11 remote GUI, media, notifications) ↔ protocol/transport ↔ web and
Tauri clients, with a platform-management layer (`kairo-discovery` → `kairo-bridge` adapters →
`kairo-core` APIs with permissions + audit) wired into the agent session.

The production scope (managed userspace, declarative config, dots, real packages, service
supervision, CLI, install lifecycle) is in early stages — see IMPLEMENTATION_STATUS.md.

## Last completed work (session 1)

1. Recon: verified actual repo (not prior reports). 89 uncommitted entries existed; three whole
   crates (kairo-bridge, kairo-core, kairo-discovery) were untracked while already required by
   the workspace build.
2. Baseline build `cargo check --workspace`: PASS (1m45s). Two unused-import warnings fixed.
3. Repaired two stale pre-existing test defects (not weakened — updated to current behavior):
   - `crates/kairo-core/tests/core_test.rs` used a removed bridge API (`CommandOutput`,
     `set_default_response`); now uses `set_response(binary, first_arg, exit, out, err)` and mocks
     the `systemctl --version` capability probe.
   - `apps/kairo-agent/tests/filesystem_test.rs` asserted an exact listing count; the session now
     creates the managed root under `data_dir`, so the test asserts the written file's presence.
   - `MockCommandRunner` no longer spawns a real shell to synthesize `ExitStatus` (was `cmd /c` /
     `true`); uses `ExitStatus::from_raw(0)` deterministically.
4. Full Windows test suite: all suites pass except the filesystem case above (then fixed, 2/2).
5. `cargo fmt --all` applied (baseline had formatting debt).
6. `engineering/` documentation system created (7 files).
7. InstaBox Linux verification environment prepared (see below).

## Verification environment (Linux)

- InstaBox machine `m_agq3cscsuugpmq6rcmyfurqrlq` (name `app`), template agent-browser
  (Debian 13 trixie), 4 vCPU / 8 GiB, sudo passwordless, Rust 1.99, Node 22, pnpm, docker.
- **Free plan limit: 1 sandbox.** Do not delete this machine — it is the only Linux host available.
  If a second OS (e.g. Arch for pacman tests) is needed, it must replace this one or the plan upgraded.
- API key lives at `%USERPROFILE%\.instabox\api_key` — **outside the repo**, never commit it.
- API: `POST /v1/machines/{id}/exec` (bash -lc, max 600 s per call; use `nohup ... &` for long builds
  then poll), `GET /v1/machines/{id}/files?path=` to read files.
- Machine auto-pauses after 30 min idle; wakes on the next call.

## Tests executed and actual results (session 1)

| Gate | Result |
|---|---|
| `cargo check --workspace` (Windows) | PASS |
| `cargo test --workspace --no-fail-fast` (Windows, pre-fmt) | 1 stale assertion failure → fixed; all else pass |
| `cargo test -p kairo-core` / `filesystem_test` (post-fix) | PASS 6/6 · 2/2 |
| `cargo fmt --all` | applied |
| `cargo test --workspace` post-fmt | run in flight at handoff — see TEST_MATRIX.md |
| clippy `-D warnings`, Linux build/tests | clippy **PASS on Windows**; Linux build/tests not yet run |

## Immediate next actions (in order)

1. Finish post-fmt workspace test run; record result in TEST_MATRIX.md.
2. Run `cargo clippy --workspace --all-targets -- -D warnings`; fix findings.
3. Create baseline commit (pre-existing work + repairs + docs), then `cargo fmt` follow-up commit
   if the fmt diff remains separable; push to `origin/main` (verify push actually succeeded).
4. Clone on the Linux machine and run the full gate there (check/test/fmt/clippy).
5. Begin M2: filesystem boundary hardening (`kairo-core/src/fs.rs`): reject traversal explicitly,
   canonicalize-based symlink containment, atomic writes; tests for each (SEC-01/02).
6. Then M3 userspace, M4 config engine, M6 real packages, M7 runtime, M9 CLI.

## Known failures / open problems

- None failing at handoff. Pre-existing weaknesses are catalogued in SECURITY_REVIEW.md (SEC-01…08).
- `README.md` describes the old vision and links a non-existent `docs/INDEX.md` — needs rewriting
  when the CLI/install story lands (M9/M10).

## Important architectural context

- `ExecutionTarget::{Host,Managed}` is the product's core boundary; managed state root is
  `<data_dir>/managed` (`kairo-core/src/system.rs`).
- `cargo fmt`/`clippy` gates are enforced repo-wide; lints deny `unsafe_code` and `unwrap_used`.
- Commit style: imperative, lowercase, ≤50-char first line, one coherent change per commit.
