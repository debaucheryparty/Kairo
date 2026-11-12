# Kairo Handoff — for the next engineer or AI

Complete continuation document. Read this first, then
[MASTER_ROADMAP.md](MASTER_ROADMAP.md) and [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md),
then verify claims against the code — the code and test results always win over documents.

**Last updated:** 2026-11-12 · **Branch:** `main` · **HEAD:** `732ab41` · **Working tree:** clean
**Repo:** `C:\Users\sahil\Downloads\Kairo` = github.com/debaucheryparty/Kairo (public)

---

## 1. What this project is

Kairo is a remote-computer platform: a local client (web/Tauri) makes a remote Linux host feel like
a computer, and the same machinery maintains a **managed userspace** — an independent environment
with its own packages, services, configuration and dotfiles — separable from the host's own
resources at every call site via `ExecutionTarget::{Host, Managed}`.

```
clients <-- Kairo Protocol (WS / reverse tunnel) --> kairo-agent
                                                     └─ kairo-core ─ platform adapters (apt, pacman, systemd, openrc)
```

Crate map and data flows: [ARCHITECTURE.md](ARCHITECTURE.md). Code style rules (mandatory):
`Docs/KAIRO_CODE_RULES.md` — short functions, no comments that restate code, no `unwrap` in real
paths, `cargo fmt` + `clippy -D warnings` before every commit, imperative lowercase commit subjects
(~50 chars), one coherent change per commit.

---

## 2. What is DONE (all verified on Windows **and** Linux)

Commit ledger (oldest first). Every commit below is on `origin/main`:

| Commit | Content |
|---|---|
| `4807878` | Baseline import: 89 pre-existing uncommitted entries (3 whole crates, UI rework, protos) verified & committed |
| `10919e3` | M2 filesystem hardening: traversal rejected (not clamped), canonicalize symlink containment incl. dangling-link create targets, atomic temp+rename writes |
| `2cb0a09` | Fix: unreadable (root-owned) apt lock files must not read as "lock held" |
| `8305542` | Fix: Xvfb display allocation race (global spawn lock + display claim) |
| `df432e5` | Fix: toolchain-portable tests/lints (cfg-shadowed bindings, as_chunks_mut, byte str) |
| `14bf901` | Fix: parallel remote-surface tests get distinct Xvfb displays |
| `a047757` | M3 managed userspace: fixed layout under `<data_dir>/managed` + SHA-256-checksummed, generation-tracked JSON state store with corrupt-file quarantine |
| `f0625ef` | M6 real managed packages: manifest → artifact (local path / `file://` / http(s), streamed SHA-256, 512 MiB cap) → hardened tar.gz extraction (zip-slip, links rejected, 2 GiB cap) → receipts; dependency ordering w/ cycle detection; upgrade + rollback; env-gated live HTTP test |
| `f7d7f8b` | M7 service supervisor: real processes, restart policies w/ backoff, log capture, SIGTERM→SIGKILL stop (Unix), persisted definitions + autostart |
| `0d63bda` | Architecture fix: the agent's `Server` owns ONE `KairoCore` shared by all sessions (per-session cores raced on state files) |
| `fc3dc87` | Supervisor lint-clean on Linux (scoped, documented `unsafe_code` allow for `libc::kill`) |
| `8389097` | M11-lite: protocol frames capped at 16 MiB at decode, before allocation; lying length headers rejected early |
| `fc6d4d3` | M4 config engine: versioned `ConfigDocument` (files/packages/services), validate-before-apply, idempotent steps, file rollback on later failure, drift detection, applied doc persisted |
| `a499629` + `07f09d3` | M5 Kairo Dots: profiles w/ inheritance + `{{var}}` templates, conflict gate + backups, restore, drift, git-backed export/import |
| `b086352` | M9 CLI (`kairo` binary): status, config, pkg (managed+host, rollback), svc define/list/remove, dots workflow, `--json` |
| `071b9a4` | README rewrite + `engineering/INDEX.md` + doc synchronisation |
| `6df3f83` | M8 observability: `--log-dir` daily-rotated file logs (optionally JSON lines), 14-day retention prune |
| `732ab41` | M8 session correlation span (`session_id` on every session log line) + error classification on session end |

**Verified state (gate 13):** `cargo check/test/fmt/clippy -D warnings` all green.
Tests: **Windows 149**, **Linux 154** (Linux has extra `#[cfg(unix)]` tests).

Git identity: commits must be authored **and** committed as `aikyaam <httpsahilxd@gmail.com>`.
The sandbox injects `GIT_AUTHOR_*`/`GIT_COMMITTER_*` env vars (`zwork@local`) that override repo
config — remove those four env vars before any commit/rebase. History was rewritten once
(with the owner's explicit authorization, `--force-with-lease`) to fix wrong authors; do not
rewrite again without a new explicit instruction.

---

## 3. Environment playbook (how verification actually runs)

### Windows dev host
Windows 11, PowerShell 5.1, rustc 1.96. Local gates:

```powershell
cargo test --workspace --no-fail-fast
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
```

### Linux verification box (required for real Linux evidence)
InstaBox machine `m_agq3cscsuugpmq6rcmyfurqrlq` (name `app`), Debian 13 trixie, 4 vCPU / 8 GiB,
rustc 1.99, Node 22, passwordless sudo, repo at `/data/home/Kairo`.
API key: `%USERPROFILE%\.instabox\api_key` (**never commit**). Free plan = **1 sandbox — do not
delete this machine.** API: `POST https://api.instabox.sh/v1/machines/{id}/exec` (bash -lc, max
600 s per call — long work goes through `nohup … &` then polling), `GET /v1/machines/{id}/files`.

**Sync procedure (the box is a pure checkout):**

```bash
cd /data/home/Kairo
git fetch origin && git reset --hard origin/main   # NOT pull --ff-only (rewritten history)
git log --oneline -1                                # verify HEAD == pushed HEAD
export KAIRO_TEST_HTTP=1 CARGO_INCREMENTAL=0
cargo test --workspace --no-fail-fast --message-format=short > /tmp/t.log 2>&1; echo "EXIT=$?" >> /tmp/t.log
cargo fmt --all -- --check > /tmp/f.log 2>&1; echo "EXIT=$?" >> /tmp/f.log
cargo clippy --workspace --all-targets -- -D warnings > /tmp/c.log 2>&1; echo "EXIT=$?" >> /tmp/c.log
```

Then fetch `/tmp/{t,f,c}.log` back via exec and record **actual** numbers in
[TEST_MATRIX.md](TEST_MATRIX.md). Never report a gate you did not see pass.

**Box prerequisites (already installed; the M10 installer must reproduce this list):**
`protobuf-compiler`, `libwebkit2gtk-4.1-dev build-essential libxdo-dev libssl-dev
libayatana-appindicator3-dev librsvg2-dev libgtk-3-dev`, `xvfb xterm x11-utils x11-xserver-utils
xfonts-base`, and the agent sidecar step (below).

**Known traps on this box:** `/data` is 20 GiB and fills with incremental caches — run gates with
`CARGO_INCREMENTAL=0` and `rm -rf target/debug/incremental` when space gets tight (df -h /data).
The Tauri desktop crate needs a sidecar built first:
`cargo build -p kairo-agent && cp target/debug/kairo-agent apps/kairo-desktop/src-tauri/binaries/kairo-backend-x86_64-unknown-linux-gnu`
(it is gitignored; without it `cargo check --workspace` fails on a clean checkout — this is
documented M10 work).

---

## 4. What is LEFT

Roadmap detail and completion criteria: [MASTER_ROADMAP.md](MASTER_ROADMAP.md).
Status per subsystem: [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md).

### M8 — Observability (done, gate 13)
`logging.rs` composes the stdout layer with an optional daily-rotated file layer
(`--log-dir`, JSON lines via `--log-json`), prunes rotated files older than 14 days, wraps the
session loop in a `session_id` correlation span, and classifies session errors
(auth/transport/protocol/backend). Design notes: ADR-0011. Retention is policy, not config.

### M10 — Installer / lifecycle (next)
Needed: `install.sh` (exists, never executed — verify on the box), upgrade path, uninstall with
data preservation, headless Linux first-class, and **encode the prerequisites list above** (protoc,
Tauri deps, font packages, sidecar). Where: `scripts/` + documentation. Verify by fresh-clone
install on the Linux box into a clean directory; record exact commands and output in TEST_MATRIX.

### M11 remainder — transport/session hardening
Done: 16 MiB frame cap, per-IP auth rate limiting, single core per process.
Needed: session token **expiry and revocation** (SEC-07), socket-level message caps at the
tungstenite layer, uniform command-output bounds, protocol version negotiation (SEC-08 remainder).
Where: `apps/kairo-agent/src/server.rs` + `session.rs` + `crates/kairo-transport`.
`session.rs` is large (~1.3k lines) — it already has `with_components`/`with_core` constructors;
keep changes surgical and add targeted tests rather than restructuring.

### M12 — Final release gate
1. Fresh `git clone` of `origin/main` into an empty dir on Windows **and** the Linux box; run all
   four gates there (this is what "builds from a clean checkout" means).
2. Dependency audit (`cargo tree` review; check licenses/versions; no `cargo audit` installed —
   add or document an equivalent).
3. Security review pass over [SECURITY_REVIEW.md](SECURITY_REVIEW.md): close or explicitly accept
   each open finding (SEC-03, SEC-06 recheck, SEC-07, SEC-08 remainder).
4. Upgrade test: install v0-style state (or an older commit's data dir), then run the current
   binary against it — the state store's `kind` check and schema version must fail loudly or
   migrate explicitly.
5. Failure-injection: kill a supervised service repeatedly (restart policy caps), interrupt an
   install mid-download (no partial dir, no receipt), corrupt `state/*.json` (quarantine + fresh
   generation).
6. Final deliverables report: feature inventory, platform matrix, install/config/CLI/API docs,
   test results, known limitations — **every claim backed by a TEST_MATRIX row**.

---

## 5. How to work here (rules that keep this repo healthy)

1. **Read before writing**: `Docs/KAIRO_CODE_RULES.md`, the module you will touch, and its tests.
2. **Smallest correct change.** No speculative abstractions, no placeholder implementations, no
   comments restating code. Comment only non-obvious *why* (security invariants, platform quirks).
3. **Every behaviour change gets a test**, and the test must fail without the change.
4. **Gates before every commit**: `cargo fmt --all`, `cargo clippy --workspace --all-targets -- -D
   warnings`, `cargo test --workspace`. Commit with the owner's identity (see §2).
5. **Linux-only code is invisible to Windows clippy/test.** Anything under `#[cfg(unix)]` (symlink
   behaviour, `libc::kill`, mode bits) must be verified on the box before claiming it works. This
   bit us twice (unsafe-lint deny, apt-lock false positive).
6. **One `KairoCore` per process.** The agent's `Server` builds it once and hands `Arc` clones to
   sessions. Do not reintroduce per-session cores — the state store assumes a single writer.
7. **State is JSON envelopes with checksums** (`crates/kairo-core/src/state.rs`): `{kind,
   generation, data, checksum}`, atomic temp+rename, corrupt files quarantined as
   `*.corrupt-<ts>`. New persisted subsystems must go through `load_state`/`store_state`, add a
   new `kind`, and handle quarantine.
8. **Managed root boundary**: every managed filesystem operation goes through
   `FilesystemApi` (traversal + symlink containment + atomic writes are already enforced there).
   Dotfiles are the *only* deliberate exception (ADR-0010) and stay behind the authorization gate.
9. **Supervision lives in the long-running agent process.** A one-shot CLI cannot supervise —
   `kairo svc start/stop` intentionally route the operator to the agent. If CLI-driven control is
   needed, implement a local client over the existing protocol rather than faking supervision.
10. **Windows quoting pitfalls** in scripts: prefer `edit`/`write` tools over shell `-replace` with
    nested quotes; when using PowerShell, remember `\` is not an escape and files may be LF or CRLF
    (the tools will tell you when the ending differs).
11. **Never weaken a test to make it pass.** If behaviour legitimately changed, rewrite the
    assertion to the new contract and note it in the commit body (this happened for the
    `filesystem_test` listing and the `core_test` bridge API).
12. **Documentation discipline**: update IMPLEMENTATION_STATUS/TEST_MATRIX/HANDOFF as you go; put
    every significant architecture decision in DECISIONS.md as a new ADR; never mark something
    PRODUCTION_READY on the strength of unit tests alone.

---

## 6. Quick state check before you start

```powershell
git -C C:\Users\sahil\Downloads\Kairo log --oneline -3
git -C C:\Users\sahil\Downloads\Kairo status --porcelain
cargo test --workspace --no-fail-fast        # expect: all green, ~149 tests on Windows
```

Then pick the first unfinished milestone (§4, in order) and follow §5. The next concrete task is
**M10 installer/lifecycle**.
