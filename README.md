# Kairo

A remote computer platform. Kairo makes a remote Linux VPS feel like a computer rather than a server management panel.

## Architecture

```
Kairo Client (local)  ←→  Kairo Protocol  ←→  Kairo Agent (VPS)
```

The desktop shell runs locally. Computation runs remotely. The protocol synchronizes state.

## Development

### Prerequisites

- Rust 1.96+
- Node.js 20+
- pnpm

### Rust (Agent)

```sh
cargo check          # type-check
cargo build          # build
cargo clippy         # lint
cargo test           # test
```

### TypeScript (Client)

```sh
pnpm install         # install dependencies
pnpm dev:web         # start web client dev server
pnpm typecheck       # type-check all packages
```

## Documentation

See [docs/INDEX.md](docs/INDEX.md) for the full documentation index.
