# Kairo

Kairo is a remote computer platform: a local client makes a remote Linux host feel like a
computer rather than a server panel. The same machinery also maintains a **managed userspace**
on any host it runs on — an independent environment with its own packages, services,
configuration and dotfiles, separable from the host's own resources.

```
Kairo clients (web / desktop)  <-- Kairo Protocol (WebSocket / tunnel) --> kairo-agent
                                                                       agent -> kairo-core -> platform adapters (apt, pacman, systemd, ...)
```

## Layout

| Path | What it is |
|---|---|
| `crates/kairo-discovery` | Host discovery: OS, init system, package managers, privileges |
| `crates/kairo-bridge` | Platform adapters behind traits, selected by capability |
| `crates/kairo-core` | Managed userspace: state store, packages, services, config engine, dots, permissions, audit |
| `crates/kairo-protocol` | Wire protocol (protobuf framing, size caps) |
| `crates/kairo-transport` | WebSocket + reverse tunnel transport |
| `apps/kairo-agent` | Headless agent: terminal, files, processes, metrics, remote GUI, service supervision |
| `apps/kairo-cli` | `kairo` operator CLI |
| `apps/kairo-web`, `apps/kairo-desktop` | Client shell (browser + Tauri) |
| `packages/kairo-runtime` | TypeScript client library |
| `engineering/` | Living engineering docs: roadmap, architecture, status, security review, test matrix, decisions, handoff |

## Building

Prerequisites: Rust 1.96+, Node 20+ with pnpm (clients only), `protoc` (protobuf compiler),
and on Linux the Tauri stack (`libwebkit2gtk-4.1-dev`, `libgtk-3-dev`, ...) for the desktop crate.

```sh
cargo check --workspace
cargo test --workspace
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
```

Note for clean checkouts of the desktop crate: `tauri.conf.json` expects a sidecar binary at
`apps/kairo-desktop/src-tauri/binaries/kairo-backend-<target>` — build `kairo-agent` and copy it
there before checking the desktop app.

## The kairo CLI

The CLI operates the managed userspace of the machine it runs on (default data dir `~/.kairo`,
override with `--data-dir`; add `--json` for machine-readable reports).

```sh
kairo status                        # host + userspace summary

kairo config apply system.json      # apply desired state: files, packages, services
kairo config drift system.json      # what would change
kairo config validate system.json

kairo pkg list                      # managed packages (receipt-backed)
kairo pkg install manifests/*.json  # real artifact installs, checksum-verified
kairo pkg rollback <name>           # restore the previous version
kairo pkg list --target host        # host packages via the native adapter
kairo pkg install --target host curl

kairo svc define service.json       # define a supervised service
kairo svc list                      # definitions and their state
# start/stop happen in the running kairo-agent process, which supervises them

kairo dots save ~/my-dots           # store a profile (profile.json + files/)
kairo dots apply mydots             # layer it onto your home directory
kairo dots drift mydots             # what changed since the last apply
kairo dots restore mydots           # put the previous state back
kairo dots export mydots --to ~/dots-repo   # git-backed export/import
```

Existing unmanaged dotfiles are never overwritten without `--authorize-existing`, and every
overwritten original is backed up.

## Running the agent

```sh
kairo-agent --bind 0.0.0.0:9137 --auth-token <token>
```

The agent supervises managed services (definitions flagged `autostart` come up with it), exposes
the terminal/file/process/GUI surfaces to clients, and records privileged actions in its audit log.

## Documentation

Living engineering documentation — including the current implementation status, security review
with open findings, and the actual test matrix — is in [engineering/](engineering/INDEX.md).
