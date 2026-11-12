# Kairo Engineering Decisions

Append-only ADR log. Superseded decisions stay here with their replacement noted.

## ADR-0001 - Establish the engineering/ documentation system
- **Date:** 2026-11-11
- **Decision:** Maintain MASTER_ROADMAP, ARCHITECTURE, IMPLEMENTATION_STATUS, SECURITY_REVIEW,
  TEST_MATRIX, DECISIONS, HANDOFF at the repo root as project infrastructure.
- **Context:** Autonomous multi-phase development needs persistent memory that survives sessions.
- **Consequences:** Docs must be updated during work, not after; the code and test results always
  win over the docs when they disagree.

## ADR-0002 - Commit the pre-existing uncommitted work as the baseline
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
  work); stash/discard (forbidden - would discard working code).
- **Consequences:** Git history shows the baseline import as its own commits. No force-push; push
  only after verification.

## ADR-0003 - Linux verification runs on an InstaBox Debian 13 machine
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

## ADR-0004 - Extend the existing architecture; no rewrite
- **Date:** 2026-11-11
- **Decision:** New production scope (userspace, declarative config, dots, real packages, runtime,
  CLI) is implemented inside/alongside the existing crate structure: kairo-core for platform APIs,
  new crates only where a distinct boundary is justified (config engine, dots, runtime, cli).
  Existing agent/transport/protocol/web behavior is preserved.
- **Context:** The existing stack compiles and has real tests; a rewrite would discard working,
  verified functionality for preference.
- **Consequences:** Managed package semantics change (SEC-04) with tests updated to the new
  contract, not deleted.

## ADR-0005 - Managed packages must install real artifacts with integrity checks
- **Date:** 2026-11-11
- **Decision:** Managed installation = acquire artifact (source), verify checksum, unpack/install
  into the managed root, write a persisted receipt; remove = reverse via receipt. A package is
  installed only after its artifact is on disk and verified. Host package operations stay native.
- **Context:** Current implementation records names in memory (SEC-04); the directive explicitly
  forbids registry-only installs.
- **Consequences:** Requires persistent package store (M3), dependency ordering, and rollback
  support in M6.
## ADR-0008 — Managed services are supervised real processes; one core per agent process
- **Date:** 2026-11-11
- **Decision:** A `ServiceSupervisor` in kairo-core launches managed services as real child
  processes with restart policies (never / on-failure-with-cap / always), streaming their output
  into the userspace logs directory, and persisting definitions (name, command, args, env,
  working dir, policy, autostart) via the state store. Stop is SIGTERM with a 5 s grace period
  then SIGKILL on Unix; immediate termination on Windows (no portable graceful-stop API without
  console integration). The agent's Server owns ONE KairoCore shared by all sessions.
- **Context:** The in-memory managed-service toggles (SEC-05) were neither real nor persistent;
  per-session KairoCore instances would race on the same persisted state files.
- **Alternatives:** systemd units for managed services (makes systemd mandatory — forbidden),
  Docker (forbidden as a requirement), per-session supervisors (state races).
- **Consequences:** adds unix-only `libc` for SIGTERM; the workspace-wide `unsafe_code = deny`
  lint is overridden for the single, documented `libc::kill` call. HTTP health checks for
  services are deferred (process-liveness is the v1 health model).

## ADR-0009 — Declarative configuration applies files, packages and services idempotently
- **Date:** 2026-11-11
- **Decision:** A versioned `ConfigDocument` (schema v1) carries three sections — managed files
  (path relative to the userspace root + UTF-8 content + optional Unix mode), managed packages
  (reusing package manifests), and managed services (reusing service specs). `apply` validates the
  whole document first (version, names, paths, duplicates), then applies files (with in-memory
  backups and rollback on later failure), packages (dependency-ordered, individually
  transactional), then services (stop-before-redefine, start when autostart). Every step reports
  Applied/Skipped/Failed; re-applying an in-sync document changes nothing. The applied document is
  persisted in the userspace state store. `drift` compares a document against live state without
  changing anything.
- **Context:** M4 requires desired-state semantics over the M3/M6/M7 subsystems.
- **Alternatives:** all-or-nothing rollback including packages (requires staging every artifact
  before applying anything — deferred), section-scoped dependencies (deferred to schema v2),
  YAML/TOML documents (JSON now; the CLI can add formats later).
- **Consequences:** file rollback is exact; a partially applied package/service set stays applied
  and is visible in the report (each step is individually transactional). Schema v2 will need a
  migration path through the state store's kind check.
## ADR-0010 — Kairo Dots touch host home files behind an authorization gate
- **Date:** 2026-11-12
- **Decision:** Dotfile profiles apply into the user's real home directory (paths are
  home-relative), which deliberately crosses the managed-root boundary. Protections: applying
  over an existing *unmanaged* file requires explicit authorization per apply; every overwritten
  original is copied into the userspace `dots-backups/` tree; `restore` uses those backups (and
  removes files Kairo created); drift detection compares the last-applied rendered content.
  Profiles layer over an inherited base, render `{{var}}` templates (undefined variables are
  errors, never silently kept), and are git-backed: export inits+commits, import clones.
- **Context:** Dotfile management is the point of Kairo Dots; confinement to the managed root
  would make it useless. The authorization gate implements the directive's "never overwrite host
  dotfiles without explicit user authorization".
- **Alternatives:** symlink farm (stow-style — reversible but surprising on Windows), hardlinks
  (fragile across editors), copying without backups (violates rollback requirements).
- **Consequences:** The host home is a new trust surface: documented in SECURITY_REVIEW; the
  restore path is the tested rollback. Templates that reference undefined variables fail the
  apply instead of rendering placeholders.

## ADR-0006 - Integrity-checked state store primitive in kairo-core
- **Date:** 2026-11-11
- **Decision:** Persistent state is stored as JSON envelopes `{kind, generation, data, checksum}`
  (SHA-256 over kind + generation + canonical JSON of data), written atomically via temp+rename.
  A file failing its checksum or parse is quarantined as `<name>.corrupt-<timestamp>` and treated
  as absent; recovery is a fresh generation 1. Schema-kind mismatches and schema-drift errors are
  hard errors, not silent resets.
- **Context:** M3 userspace, M4 configuration, M6 package receipts and M7 service definitions all
  need the same durability/integrity semantics; process-local state was catalogued as SEC-05.
- **Alternatives:** sqlite (heavier, new dependency class, harder to inspect), crc32 (insufficient
  integrity for the directive's registry-integrity requirement), no checksum (unverifiable).
- **Consequences:** `sha2` added to kairo-core. Single-writer-per-file assumption documented.
- **Dependency note:** per Docs/KAIRO_CODE_RULES.md §3.5 this adds one new, widely-maintained,
  MIT/Apache dual-licensed crate with no transitive weight beyond digest primitives.


## ADR-0007 — Real managed packages acquire artifacts over local paths and HTTP(S)
- **Date:** 2026-11-11
- **Decision:** Package manifests carry name, version, description, dependencies (`name` or
  `name@version`), one artifact source (absolute local path / `file://` / `http(s)://`), a SHA-256
  checksum and a payload kind (`single_file` or `tar_gz`). Acquisition streams to the userspace
  tmp dir while hashing, capped at 512 MiB; extraction rejects absolute paths, `..` (zip-slip)
  and any links, caps unpacked size at 2 GiB, and preserves the executable bit on Unix. Install
  is transactional (version directory removed on failure); receipts live in
  `state/package-registry.json`; upgrades supersede receipts while keeping old files so rollback
  can restore them without re-downloading.
- **Context:** ADR-0005 required real installs; the registry-only stub (SEC-04) is replaced.
- **Alternatives:** tar-only without gz (less common), zip support (deferred, extra dependency),
  allowing package symlinks (rejected — untrusted links are an escape vector), no size caps
  (disk-exhaustion risk).
- **Consequences:** adds `tar`, `flate2`, `ureq` (rustls) to kairo-core — each the standard,
  maintained choice for its job. Dependency sets that cannot be ordered (cycles, missing deps)
  fail before any artifact is touched; artifact-level failures are reported per package in the
  response. HTTP acquisition is verified end-to-end by the env-gated `KAIRO_TEST_HTTP=1` test
  that runs against a local node server on Windows and Linux.
