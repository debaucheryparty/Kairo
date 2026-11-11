# Kairo Engineering Decisions

Append-only ADR log. Superseded decisions stay here with their replacement noted.

## ADR-0001 — Establish the engineering/ documentation system
- **Date:** 2026-11-11
- **Decision:** Maintain MASTER_ROADMAP, ARCHITECTURE, IMPLEMENTATION_STATUS, SECURITY_REVIEW,
  TEST_MATRIX, DECISIONS, HANDOFF at the repo root as project infrastructure.
- **Context:** Autonomous multi-phase development needs persistent memory that survives sessions.
- **Consequences:** Docs must be updated during work, not after; the code and test results always
  win over the docs when they disagree.

## ADR-0002 — Commit the pre-existing uncommitted work as the baseline
- **Date:** 2026-11-11
- **Decision:** The working tree contained 89 changed entries (60 modified, 6 deleted, 23 untracked
  including three whole crates: kairo-bridge, kairo-core, kairo-discovery, plus new protos, a web UI
  rework, and Docs/). This work is required by the workspace `Cargo.toml` and cannot be built or
  tested without. It is verified (workspace check + tests) and then committed as baseline commits,
  kept separate from subsequent engineering work.
- **Context:** Directive §6 forbids including pre-existing user changes without authorization; the
  repository owner instructed "do it" for the ownership directive, and no coherent engineering
  baseline can exist while the crates under test are untracked.
- **Alternatives:** Leave everything uncommitted (violates the commit discipline; risks losing
  work); stash/discard (forbidden — would discard working code).
- **Consequences:** Git history shows the baseline import as its own commits. No force-push; push
  only after verification.

## ADR-0003 — Linux verification runs on an InstaBox Debian 13 machine
- **Date:** 2026-11-11
- **Decision:** Use the owner-provided InstaBox account (agent-browser template = Debian 13 with
  Rust 1.99/Node 22/pnpm/Docker, 4 vCPU, 8 GiB) as the Linux integration host. The API key is stored
  **outside the repository** at `%USERPROFILE%\.instabox\api_key` and never committed.
- **Context:** Development host is Windows; the production scope requires real Linux verification
  (apt/systemd paths, headless install, managed packages). The free plan only allows the
  agent-browser/android/omarchy/ci templates; `universal` was rejected by the API (403).
- **Alternatives:** WSL (no systemd by default, not a clean host); GitHub Actions only (slower
  loop); Docker on Windows (container, not host semantics).
- **Consequences:** Machines auto-pause after 30 min idle; exec calls cap at 600s so long builds
  run with nohup + polling. Machine id and setup live in HANDOFF.md.

## ADR-0004 — Extend the existing architecture; no rewrite
- **Date:** 2026-11-11
- **Decision:** New production scope (userspace, declarative config, dots, real packages, runtime,
  CLI) is implemented inside/alongside the existing crate structure: kairo-core for platform APIs,
  new crates only where a distinct boundary is justified (config engine, dots, runtime, cli).
  Existing agent/transport/protocol/web behavior is preserved.
- **Context:** The existing stack compiles and has real tests; a rewrite would discard working,
  verified functionality for preference.
- **Consequences:** Managed package semantics change (SEC-04) with tests updated to the new
  contract, not deleted.

## ADR-0005 — Managed packages must install real artifacts with integrity checks
- **Date:** 2026-11-11
- **Decision:** Managed installation = acquire artifact (source), verify checksum, unpack/install
  into the managed root, write a persisted receipt; remove = reverse via receipt. A package is
  installed only after its artifact is on disk and verified. Host package operations stay native.
- **Context:** Current implementation records names in memory (SEC-04); the directive explicitly
  forbids registry-only installs.
- **Consequences:** Requires persistent package store (M3), dependency ordering, and rollback
  support in M6.
