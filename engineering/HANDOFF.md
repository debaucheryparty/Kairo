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
2. Baseline committed (27314f5) after full verification; pushed to origin/main.
3. Repaired two stale pre-existing test defects (not weakened — updated to current behavior):
   core_test bridge-runner API usage; filesystem e2e exact-count vs. managed-root creation.
4. M2 filesystem hardening (b55aab8): managed-root traversal now rejected explicitly; symlink
   escapes blocked via canonicalize containment (incl. dangling-symlink create targets); writes
   atomic via temp+rename. Windows 106 tests, Linux 108 tests pass.
5. M3 managed userspace (6464ce1): fixed layout under the managed root (config/packages/services/
   state/logs/cache/tmp) with a persistent manifest; integrity-checked JSON state store (kind +
   generation + sha-256 checksum, atomic replace, corrupt-file quarantine, fresh-generation
   recovery). KairoCore initializes it and degrades to a warning if the filesystem refuses.
   Windows 113 tests, Linux 115 tests, all four gates green on both platforms.
6. Linux verification on InstaBox found and fixed four real defects: apt-lock false positive
   (109754d), Xvfb display-allocation race (caf03ed), windows-only traversal test expectation
   (6c74259), parallel tests sharing one display (5dd6c19).
7. engineering/ documentation system live and synchronized.

## Immediate next actions (in order)

1. M6 real managed packages (SEC-04): artifact acquisition + checksum verify + receipts +
   rollback on top of the M3 state store; replace the register-only stub in
   `kairo-core/src/package.rs` and update core_test expectations to the new contract.
2. M7 service runtime/supervision persisted via the same store (SEC-05).
3. M4 declarative configuration engine; M5 dots; M9 CLI.

## Verification environment (Linux)

- InstaBox machine `m_agq3cscsuugpmq6rcmyfurqrlq` (name `app`), template agent-browser
  (Debian 13 trixie), 4 vCPU / 8 GiB, sudo passwordless, Rust 1.99, Node 22, pnpm, docker.
- **Free plan limit: 1 sandbox.** Do not delete this machine — it is the only Linux host available.
- Repo checkout: `/data/home/Kairo`. InstaBox API key: `%USERPROFILE%\.instabox\api_key`
  (outside the repo; never commit).
- Installed for Kairo: protobuf-compiler, webkit2gtk/gtk dev stack, xvfb, xterm, x11-utils,
  x11-xserver-utils, xfonts-base. Sidecar prep: build kairo-agent → copy to
  `apps/kairo-desktop/src-tauri/binaries/kairo-backend-x86_64-unknown-linux-gnu`.
- Gates are run as nohup scripts (/tmp/kairo-gate*.sh), logs /tmp/kairo-{check,test,clippy,fmt}.log.

## Tests executed and actual results (session 1, final)

| Gate | Windows | Linux (Debian 13 box) |
|---|---|---|
| `cargo check --workspace` | PASS | PASS |
| `cargo test --workspace --no-fail-fast` | **PASS 106/0** | **PASS 108/0** (incl. unix-only symlink-containment test) |
| `cargo fmt --all -- --check` | PASS | PASS |
| `cargo clippy --workspace --all-targets -- -D warnings` | PASS | PASS (rustc 1.99 strictness fixed in 6c74259) |

Full evidence and per-suite counts: TEST_MATRIX.md. Linux prerequisites documented there.

## Immediate next actions (in order)

1. M3 managed userspace: persistent layout under the managed root (config/, packages/, services/,
   state/, logs/, cache/), integrity-checked persisted state (SEC-05), init/migration-safe.
2. M6 real managed packages (SEC-04): artifact acquisition + checksum verify + receipts + rollback,
   replacing the register-only stub; depends on M3 store.
3. M4 declarative configuration engine; M5 dots; M7 service runtime/supervision; M9 CLI.
4. M10 installer should consume the Linux prerequisites list in TEST_MATRIX.md.
5. Rewrites of README and docs/INDEX.md when the CLI/install story lands (M9/M10).

## Known failures / open problems

- None failing at handoff on either platform. Security weaknesses beyond the fixed SEC-01/02/09/10
  are catalogued in SECURITY_REVIEW.md (SEC-03…08 remain open, planned per roadmap).
- `README.md` describes the old vision and links a non-existent `docs/INDEX.md` — rewrite when the
  CLI/install story lands (M9/M10).
- InstaBox free plan: 1 sandbox total; the Linux box doubles as the user's general machine —
  leave it running and do not delete it.

## Important architectural context

- `ExecutionTarget::{Host,Managed}` is the product's core boundary; managed state root is
  `<data_dir>/managed` (`kairo-core/src/system.rs`).
- `cargo fmt`/`clippy` gates are enforced repo-wide; lints deny `unsafe_code` and `unwrap_used`.
- Commit style: imperative, lowercase, ≤50-char first line, one coherent change per commit.
