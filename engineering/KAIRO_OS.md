# Kairo OS — Architecture and Direction

**Status:** adopted direction (ADR-0012) · **Date:** 2026-11-20 · **Supersedes:** the
"remote-computer platform" framing of MASTER_ROADMAP.md where they conflict · **Preserves:**
all completed work M0–M9, M8-era agent/protocol/transport code, and the engineering doc system.

This document is the technical foundation for the Kairo OS product: a complete, independently
usable desktop operating environment that runs on an existing Linux machine and is accessed
from a browser. It evaluates the existing codebase against that goal, designs the target
architecture, and states what is reused, changed, built, or forked. The milestone plan lives in
[MASTER_ROADMAP.md](MASTER_ROADMAP.md) (amended); decisions are recorded in
[DECISIONS.md](DECISIONS.md) (ADR-0012 onward).

---

## 1. Product definition

A user points Kairo at an existing VPS or Linux machine. They open a URL in a browser and get a
complete desktop: compositor-driven window management, workspaces, real applications (X11 and
Wayland), a terminal, a file manager, notifications, audio, clipboard, settings, and system
monitoring. Closing the tab does not destroy the session; reconnecting resumes it.

Hard rules, restated as architectural invariants:

1. **The host OS is never replaced or re-imaged.** Kairo provisions a userspace on top of it.
2. **The browser is the only required client.** No desktop app is needed to use Kairo. The
   browser renders a real remote desktop; it does not simulate one in React.
3. **The host is used through controlled adapters.** Kairo owns the desktop experience and its
   system APIs; it never shells out to arbitrary host desktop state.
4. **Isolation where practical.** Desktop environments run in isolated contexts (containers,
   user namespaces, systemd scopes) chosen per host capability.
5. **Real execution, no simulation.** Applications run as real Linux processes on the remote
   machine. The client streams pixels and events; it hosts nothing.
6. **Platform backends are replaceable.** Linux is the first target; Windows is a separate
   native backend behind the same trait seams, never a fake implementation.
7. **Least privilege, reversible provisioning.** Root is requested explicitly, per change, with
   a capability report before provisioning. No SSH private keys ever reach the host.
8. **No ShojiWM dependency.** Kairo's desktop experience is built on maintained upstream
   components and its own configuration; ShojiWM is not a foundational dependency.

The distinction that keeps this honest: **Kairo owns the desktop session; the host provides
only the kernel, device drivers, and (optionally) packages.**

---

## 2. Current state assessed against the vision

Evidence-based summary of what exists at HEAD `f634106` (test counts from TEST_MATRIX gate 13:
Windows 149 / Linux 154, fmt + clippy clean).

### 2.1 What already serves the vision

| Asset | State | Role in Kairo OS |
|---|---|---|
| kairo-protocol framing + handshake (20-byte header, 16 MiB cap, capability list, `SystemProfile` in ack) | tested | unchanged transport for control plane; additive `desktop.v1` capability |
| Surface opcodes 70–78 (input, frames w/ sequence + dirty rect + `codec` string, configure, focus, lifecycle, list) | tested end-to-end | becomes the per-app window channel inside the desktop stream |
| GPU-stream opcodes 80–83 (`StartGpuStreamRequest{width,height,fps,codec,bitrate}`) | negotiation shape exists, encoder is a stub | the negotiation shape for the full-desktop stream |
| Frame relay in `session.rs` (`latest_frames` latest-wins + `Notify` writer, 30 ms slow-send warning) | working | exactly the right congestion model for video; reused for the desktop channel |
| `apps/kairo-web` React shell (Dock, TopBar, Spotlight, Workspaces, WindowManager, RemoteSurfaceViewer with raw-RGBA canvas + input capture) | working UI | becomes the desktop client: hosts the remote desktop view + chrome |
| `packages/kairo-runtime` TS client (hand-rolled protobuf codec, resilient transport with backoff, full typed API) | working | extended with desktop/stream/audio/clipboard messages |
| Reverse tunnel (`kairo-transport`) + relay path | working | stays as the NAT-traversal access path |
| Managed userspace: fixed layout, checksummed state envelopes, transactional package installs with receipts + rollback, service supervisor with restart policies + log capture, declarative config, dots | tested | the provisioning + app-store substrate for desktop environments |
| `kairo-discovery` `SystemProfile` (os/init/packages/GPU/**isolation**: cgroups, namespaces, userns) | tested | grows into the pre-provisioning capability report |
| `kairo-bridge` adapters (apt/pacman, systemd/openrc) with `CommandRunner` mock seam | tested | host integration adapter layer; grows display/audio/isolation adapters |
| Agent scaffolding: auth token + rate limit, PTY manager, filesystem/process/metrics handlers, logging with rotation/retention (M8) | tested | reused as the supervisor's foundation |
| X11 window capture + XTEST input (`gui/x11.rs`, 1.5k lines) | working, Linux-only | becomes ONE `DisplayProvider` backend — still valuable for single-app streaming and as the XWayland fallback; **not** the desktop path |

### 2.2 What must change (specific code)

- `gui/x11.rs` capture: synchronous `get_image` Z_PIXMAP polling at ~8 MB/frame raw RGBA — no
  encoder anywhere. The desktop stream needs a real encoder path (see §6). The
  `RemoteGuiBackend` trait and `SurfaceDamageFrame{codec}` wire type survive; the backend
  implementation changes.
- `gui/x11.rs::spawn_app`: forces `GDK_BACKEND=x11`, `QT_QPA_PLATFORM=xcb`, `MOZ_ENABLE_WAYLAND=0`,
  fixed `Xvfb :100..250` display allocation, fixed 1920x1080, no WM — an app-window streaming
  design, not a desktop. Desktop sessions launch apps inside a session compositor environment
  (`WAYLAND_DISPLAY`/`XDG_RUNTIME_DIR` per session).
- `runtime.rs` supervisor: one process per service, no process groups/cgroups — killing a
  compositor would orphan its apps. Needs `setsid` + cgroup delegation (discovery already
  reports cgroup v2) or a session-manager process.
- `server.rs`/`session.rs`: session == one WS connection with singleton managers
  (`AppManager` owns one global backend). Needs a first-class **desktop session registry**:
  N desktop environments per host, reattach, viewer arbitration, per-session state.
- `gpu.rs::start_stream`: returns a fabricated endpoint; no encoder, hardcoded stats. Becomes
  the real encode pipeline entry point.
- `app_manager.rs`: reads host `/usr/share/applications`; managed desktops must list apps from
  the userspace/desktop root.
- `session.rs` capabilities/handshake: `protocol_version` checks `== 1` (M11 remainder); the
  desktop needs negotiated capabilities (codec, audio, clipboard support).
- `install.sh`: root-only, downloads an unsigned tarball, no desktop stack provisioning, and
  CI produces no `kairo-agent-$TARGET.tar.gz` asset for it to download (already a gap).
- Wire gaps: `SurfaceInputEvent` is stringly-typed; no cursor-shape, no audio opcode, no
  clipboard opcode, no multi-monitor geometry, no session-resume messages.

### 2.3 What becomes secondary (kept, not deleted)

- `media.rs` (MPRIS player control): superseded by real desktop audio routing; retained for
  host-mode media control.
- `notification.rs` (in-memory stub, no producer): replaced by the desktop notification bus per
  session; the opcode surface stays.
- `system.rs` docker/systemctl wrappers (service ops already route through core/bridge).
- Per-window X11 capture survives as the "single application stream" mode.

### 2.4 Gaps nothing in the repo covers today

1. Compositor lifecycle management (launch headless, virtual outputs, resize, supervision of a
   process tree).
2. Video encode on the host (VAAPI/NVENC/x264/libvpx) — nothing exists; frames are raw RGBA.
3. Browser-side decode (WebCodecs) and audio playback — zero code.
4. Audio capture/transport (no opcode, no PipeWire integration).
5. Clipboard sync (no opcode; xfixes feature enabled but unused).
6. Isolation execution (discovery reports namespaces/cgroups; nothing creates them).
7. Desktop session orchestration: reattach, persistence across agent restarts, viewer sharing.
8. Provisioning: installing/verifying the desktop stack per distro (no-root and root paths).

---

## 3. System component diagram

```
                        Browser (React/TS client — the remote access surface)
   ┌───────────────────────────────────────────────────────────────────────────┐
   │  Desktop chrome (dock/topbar/launcher — Kairo-owned UI)                    │
   │  Desktop canvas: video decode (WebCodecs) · input capture · clipboard      │
   │  Audio out (WebAudio/Opus) · file transfer · connection mgmt               │
   └───────────────▲───────────────────────────────────────────────────────────┘
                   │ wss://  (video+audio+input+control over one authenticated port)
                   ▼
   ┌───────────────────────────────────────────────────────────────────────────┐
   │  KAIRO AGENT (Rust, one per host)                                          │
   │  ┌─────────────┐  ┌──────────────────┐  ┌───────────────────────────────┐ │
   │  │ Session mgr │  │ Desktop session  │  │ Access layer                  │ │
   │  │ (auth, rate │  │ orchestrator     │  │ HTTPS/WSS + capability report │ │
   │  │ limit, resum)│ │ spawn/attach/kill│  │ reverse tunnel (no inbound)   │ │
   │  └─────────────┘  └────────┬─────────┘  └───────────────────────────────┘ │
   │                            │ supervise (setsid/cgroup)                    │
   │                    ┌───────▼────────────────────────────┐                 │
   │                    │ DESKTOP ENVIRONMENT (per session)  │                 │
   │                    │  compositor (sway headless)        │                 │
   │                    │  wayvnc → agent WS bridge ─────────┼──► video stream │
   │                    │  pipewire (audio) ─────────────────┼──► audio stream │
   │                    │  xdg portals · mako · xwayland     │                 │
   │                    │  apps: terminal, file mgr, ...     │                 │
   │                    └───────┬────────────────────────────┘                 │
   │  ┌─────────────────────────▼──────────────────────────────────────────┐   │
   │  │ KAIRO CORE (platform-independent)                                  │   │
   │  │ userspace · packages · services · config · dots · audit · auth     │   │
   │  │ ExecutionTarget::{Host, Managed}                                   │   │
   │  └───────┬────────────────────────────────────────────────────────────┘   │
   │  ┌───────▼────────────────────────────────────────────────────────────┐   │
   │  │ PLATFORM ADAPTERS (trait family, §5)                               │   │
   │  │ Linux: apt/pacman · systemd/openrc · display(wlroots/sway) ·       │   │
   │  │        audio(pipewire) · isolation(podman/bwrap/systemd)           │   │
   │  │ Windows: Win32 · services · DWM · native fs · (separate backend,   │   │
   │  │          implemented independently, never faked)                   │   │
   │  └────────────────────────────────────────────────────────────────────┘   │
   └───────────────────────────────────────────────────────────────────────────┘
                   │ adapters only — no arbitrary privileged shell API
                   ▼
            Host Linux machine (kernel, drivers, packages; untouched otherwise)
```

---

## 4. Component responsibility breakdown

### Kairo Core (platform-independent, `crates/kairo-core` + new `crates/kairo-desktop`)
- Identity, auth context, permission levels, audit.
- Desktop-session model: definition, lifecycle states, persisted session registry (state-store
  envelopes), reattach tokens.
- Application lifecycle abstraction: app catalog per desktop root (freedesktop entries from the
  userspace + host), launch/close semantics.
- Configuration management (existing declarative engine) extended with desktop-environment
  documents (compositor settings, autostart apps, workspace layout).
- Filesystem/process/system abstractions over `ExecutionTarget::{Host, Managed}` (existing).
- Package receipts + rollback (existing) — the app-install substrate.

### Kairo Agent (`apps/kairo-agent` + new `crates/kairo-agent-desktop`)
- Host discovery + **capability report** (extends `kairo-discovery`; §8).
- Secure access: token auth, rate limiting, TLS termination, single-port WSS serving the web
  client + streams; reverse tunnel for no-inbound deployments.
- Desktop-session orchestration: spawn/stop/supervise the environment (compositor + wayvnc +
  pipewire + portals as a supervised process tree, setsid + cgroup scope), reattach, cleanup.
- Streaming coordination: video (bridge VNC/encoder → protocol frames), audio, clipboard,
  cursor, input — with per-session QoS and reconnect (keyframe-on-attach).
- System operations through adapters; resource monitoring (existing metrics).
- NO arbitrary privileged shell surface as an API; privileged actions are discrete, audited,
  approval-gated operations.

### Kairo Platform Adapters (`crates/kairo-bridge` → expanded)
- Linux backend: package (apt/pacman — existing), init/service (systemd/openrc — existing),
  **display** (headless wlroots/sway lifecycle, virtual outputs, IPC), **audio** (PipeWire
  user services), **isolation** (podman rootless / bwrap / systemd scope — capability-gated),
  networking (port checks, firewall guidance only — never silently modifies).
- Windows backend: Win32/services/filesystem/processes/display capture — implemented
  independently behind the same traits (§5); clearly tiered as supported / partial / unavailable.

### Kairo Desktop (the remote environment itself — NOT a codebase Kairo forks)
- A real compositor session: upstream components installed and configured by the agent
  (compositor config is generated Kairo-owned state, versioned in the userspace).
- Kairo's desktop design lives in: compositor configuration (keybindings, workspaces, bars),
  autostart application set, theming, and the client chrome — not in a forked compositor tree
  (decision deferred to ADR-0013 §technology evaluation).

### Kairo Client (`apps/kairo-web` + `packages/kairo-runtime`)
- Remote display canvas (decode + render + cursor compositing), keyboard/pointer capture
  (including pointer lock and IME forwarding), clipboard sync, audio out, file transfer,
  connection management (resume, quality adaptation), resolution/DPI management.
- The existing Dock/TopBar/Spotlight/Workspaces chrome renders around the desktop canvas;
  chrome actions translate to desktop-session protocol calls. The client simulates nothing:
  everything visible is either remote pixels or Kairo's own UI calling real APIs.

---

## 5. Platform abstraction design

One trait family, owned by a new `crates/kairo-platform` (or grown inside `kairo-bridge` —
final placement in the implementation milestone). Rules:

- **Core never sees a platform type.** Traits return platform-neutral data (already the pattern:
  `SystemProfile`, `ServiceStatus`, `PackageReceipt`).
- **No fake implementations.** A backend that cannot support a capability returns
  `Unsupported(reason)` — the existing `UnsupportedPackageManager` pattern — never a stub that
  pretends to work. Capabilities are tiered: `Supported` / `Partial{limits}` / `Unavailable`,
  reported in the capability report and surfaced in the UI.
- **Every capability query is cheap and side-effect-free.** Adapters detect, they do not mutate;
  mutation goes through explicit, audited, approval-gated operations.

Trait family (Rust, async where I/O-bound; names indicative):

| Trait | Linux impl (first) | Windows impl (separate, later) |
|---|---|---|
| `PlatformSystem` | os-info/probe (exists via discovery) | Win32/WMI |
| `ProcessManager` | exists (sysinfo) — add process-group mgmt | Job Objects |
| `FilesystemProvider` | exists (`FilesystemApi` + boundary) | native APIs |
| `ServiceManager` | systemd/openrc (exists) | Windows services |
| `PackageManager` | apt/pacman (exists) | winget/choco (later) |
| `DisplayProvider` | headless wlroots/sway + wayvnc | DWM/dxgi capture |
| `InputProvider` | uinput/compositor IPC/XTEST | SendInput |
| `AudioProvider` | PipeWire session routing | WASAPI |
| `NetworkProvider` | port/firewall probe (read-only) | netsh probe (read-only) |
| `IsolationProvider` | podman rootless / bwrap / systemd scope | Windows Sandbox / containers (later) |
| `WindowManager` (desktop control) | sway IPC (workspaces, layout, focus) | n/a until Windows backend exists |

Placement rule: `RemoteGuiBackend` (existing) becomes the window-level view over
`DisplayProvider + WindowManager`; the X11 backend remains a `DisplayProvider` implementation
for single-app streaming and non-compositor hosts.

---

## 6. Desktop execution and streaming architecture

### 6.1 Execution model (chosen stack: sway headless + wayvnc — ADR-0013)

One desktop session = one supervised process tree, one isolation context, one stream endpoint:

1. Agent reads the capability report → picks the isolation tier (§7) and verifies the compositor
   stack (§10 matrix).
2. Agent provisions the session root from the managed userspace (compositor config is
   Kairo-generated state; app catalog; fonts; dbus session).
3. Agent launches the session tree:
   ```
   dbus-run-session
     └─ sway  (WLR_BACKENDS=headless  WLR_LIBINPUT_NO_DEVICES=1  WLR_RENDERER=pixman)
         ├─ wayvnc 127.0.0.1:<port> --detached      (video + RFB input + clipboard sync)
         ├─ pipewire + wireplumber                  (audio sink for v2; per-session instance)
         ├─ mako                                    (notification daemon)
         ├─ xdg-desktop-portal(-wlr)                (app dialogs / screencast)
         ├─ wl-clipboard + cliphist                 (clipboard keeper — headless has none otherwise)
         └─ apps from the catalog (X11 via XWayland, Wayland native)
   ```
   Headless wlroots needs **no seat, no DRM, no logind, no root**. Virtual outputs come from the
   headless backend (`HEADLESS-1`) and `swaymsg create_output` / `swaymsg output … mode` for
   client-driven resolution. No GPU is required (`WLR_RENDERER=pixman`); `/dev/dri` presence
   upgrades rendering and enables hardware encode later.
4. **Supervision**: the tree runs under `setsid` + a systemd user scope (or the session
   container, §7) so teardown kills the whole tree — this requires the supervisor change in §2.2
   (process-group/cgroup kill). `wayvnc --detached` + `wayvncctl` lets the agent attach/detach
   the video server independently of the compositor lifecycle, and manage clients
   (list/disconnect) per viewer.
5. **Session control**: sway's i3-compatible IPC (`swaymsg`, event streams for window/workspace
   events) is the agent's window-management API — workspaces, focus, layout, app-to-surface
   mapping. This replaces per-window composite redirection as the desktop control plane.
6. **Reattach**: client authenticates → lists sessions → attaches; the agent re-binds the RFB
   stream and (in v2) requests a keyframe. Sessions persist across viewer disconnects and,
   later, across agent restarts (state-store backed, new `kind` envelope per ADR-0006).

### 6.2 Streaming model

Three channels over the existing authenticated connection — the agent is the **only**
network listener; the desktop stack binds localhost only:

- **Video v1**: wayvnc (ZRLE/Tight; H.264-in-RFB is unusable without a GPU encoder — wayvnc's
  OpenH264 path requires DRM-PRIME dmabuf) bridged by the agent's TCP⇄WS relay
  (websockify-equivalent, tokio-tungstenite — tens of lines, reusing the agent's auth and
  session context). RFB bytes pass as opaque binary WS messages; control/input/clipboard stay
  protobuf. The React client embeds **noVNC** (MPL-2.0, active, v1.7.0 2026-04).
- **Video v2**: capture via wlr-screencopy (or sway 1.12 window capture) → software encode
  (x264 — fastest, GPL; or openh264 crate — BSD-friendly but slower) → WS binary subchannel →
  WebCodecs `VideoDecoder` → canvas. Browser support is ~95% (Chrome/Edge 94+, Firefox 130
  desktop, Safari 16.4+). Keyframe-on-attach, FPS/bitrate adaptation are ours to implement.
  Hardware encode via VAAPI when `/dev/dri` exists. The `SurfaceFrame.codec` string and the
  `StartGpuStreamRequest{codec,bitrate,fps}` negotiation (opcodes 80–83) carry this without a
  wire redesign.
- **Audio (v2)**: per-session PipeWire virtual sink → Opus → WebRTC audio track
  (jitter/congestion handling for free) — the neko-proven pattern; an interim WS→AudioWorklet
  path with a self-managed jitter buffer is the fallback if avoiding ICE/TURN. RFB cannot carry
  audio at all.
- **Input/clipboard/cursor/file transfer**: v1 gets input + text clipboard from RFB itself
  (wayvnc syncs via `wlr-data-control-unstable-v1`; the clipboard keeper keeps selections alive
  headlessly). File transfer is a new chunked protobuf channel (the 16 MiB cap forces chunking
  anyway). Cursor shape and multi-monitor geometry become new protocol messages so they survive
  the v2 codec switch.

---

## 7. Linux environment isolation strategy

Tiered by host capability, chosen per capability report, never silently. The controlling rule:
**audio and IPC are per-session, never shared with the host** — each session runs its own
PipeWire instance and its own `XDG_RUNTIME_DIR`; sharing host sockets across sessions is an
anti-pattern (mixing, leakage, permission fights — the mistake every reviewed product avoids).

| Tier | Requires | Mechanism | What it isolates | Limits / caveats |
|---|---|---|---|---|
| T0 (fallback) | nothing | systemd user scope (`systemd-run --user --scope`) + `setsid` + dedicated `XDG_RUNTIME_DIR` + prlimit | process-tree lifetime; memory ceilings only if cgroup v2 is delegated to users | FS/IPC shared with the host user; session is labeled "shared-privilege" in the UI |
| T1 (preferred, no root) | unprivileged user namespaces | **rootless podman**, one container per desktop session (compositor + apps + per-session PipeWire + wayvnc inside); native overlay needs kernel ≥ 5.13, else fuse-overlayfs (`/dev/fuse`) | FS view, IPC, optional network namespace, real memory/CPU/pids caps via rootless cgroup delegation | Blocked by Ubuntu 24.04's AppArmor unprivileged-userns restriction unless a profile is installed (root) — falls back to T0 with the restriction surfaced in the capability report |
| T2 (root granted) | root approval | rootful **podman** (daemonless — not docker-group membership, which is root-equivalent) per session with per-session UID, `--memory/--cpus/--pids-limit`, private tmpfs/shm, isolated network; or per-session system users + systemd scopes with `MemoryMax`/`CPUQuota`/sandboxing directives | everything except the kernel | provisioning plan is approval-gated (§9) |

Additional layers regardless of tier: the agent itself is hardened with landlock/seccomp and
never runs as root; sessions persist via `loginctl enable-linger` (self-linger without root;
other users need approval); nested VMs are rejected (nested virt is essentially unavailable on
VPS — probed via `/dev/kvm` + `lscpu` flags, never assumed).

This matches the industry pattern (KasmVNC, neko, Selkies, Coder envbox all run **one container
per desktop session**; systemd scopes are the no-container fallback; nobody uses a VM per
session).

---

## 8. Host compatibility and capability report

`kairo-discovery::SystemProfile` already reports os/init/packages/GPU/isolation. The capability
report extends it with display and audio probes and a **verdict** (not just data):

| Probe (all read-only) | Decides |
|---|---|
| `systemd-detect-virt` (+ `--container`) | VM/container context; headless constraints |
| `unshare --user --map-root-user true`, `apparmor_restrict_unprivileged_userns`, `max_user_namespaces` | T2 isolation feasibility |
| cgroup v2 (`stat -fc %T /sys/fs/cgroup`), `systemctl --user` health, `loginctl` linger | T0 resource control + persistence |
| `/dev/dri`, `lsmod vkms/virtio_gpu`, `glxinfo`/`vulkaninfo` if present | hardware encode availability |
| distro + version vs the compatibility matrix (§10) | package stack availability tier |
| `pipewire --version`, user bus (`dbus-user-session`) | audio feasibility |
| docker/podman presence + rootless check | T1/T2 mechanics |
| free RAM, disk, `/dev/shm`, zram/swap | session capacity gates |
| listening ports/firewall reachability (self-probe) | access-path decision (direct vs tunnel) |

The report is produced **before any provisioning**; provisioning steps that need root are
enumerated with exact commands and presented for approval (SEC-11, §9).

Verified compatibility baseline (details in §10): Debian 13, Ubuntu 24.04, Arch, Fedora 42+
carry a good sway/wlroots/wayvnc/pipewire stack; Ubuntu 22.04 and Debian 12 ship wlroots 0.15
(supported with degraded features or a Nix overlay); no distribution works without packages.

---

## 9. Security and privilege model

Existing (kept): bearer token + `constant_time_eq`, per-IP auth rate limiting, one core per
process, 16 MiB frame cap, audit log, `OperationLevel` gates, checksummed state, zip-slip
defenses, M8 log hygiene.

New trust boundaries introduced by the desktop:

1. **The desktop session is a new untrusted surface.** Apps running in the session must not be
   able to reach the agent's APIs or the host beyond the session's isolation tier. The
   isolation tier IS the security control — T0 sessions are explicitly labeled as sharing the
   host user's privileges.
2. **Provisioning = privileged change with approval.** Every provisioning plan is a dry-run
   capability report + explicit command list; execution requires `confirmed` auth semantics
   (existing `AuthContext`) at `Privileged` level, one approval per plan, audited. No silent
   sysctl/package changes.
3. **The agent is the only network listener.** Compositor/wayvnc/pipewire bind localhost;
   the browser authenticates once at the agent; session endpoints are unauthorized without the
   agent's session tokens (short-lived, per-stream — folds into SEC-07 expiry work).
4. **No SSH private keys to the host.** The agent never receives keys; onboarding uses the
   existing token model.
5. **Video/input channels are DoS surfaces.** Frame budget/QoS per session (already: latest-
   wins + slow-send warning; extend with FPS caps and per-session quotas), bounded queues
   (M11 remainder), input rate limits.
6. **New findings to open in SECURITY_REVIEW** (proposed SEC-11..14): provisioning approval
   gate; session isolation tier enforcement; per-stream token lifetime; clipboard
   confidentiality between concurrent sessions.

---

## 10. Host compatibility matrix

*(verified against distro package indexes 2026-11; sources in the technology evaluation)*

| Host | sway/wlroots | wayvnc | pipewire | portal | verdict |
|---|---|---|---|---|---|
| Debian 13 | 1.10 / 0.18 | 0.9.1 | 1.4 | 1.20 | **good** — reference target |
| Ubuntu 24.04 | 1.9 / 0.17 | 0.7.2 | 1.0.5 | 1.18 | **good**; AppArmor userns restriction degrades rootless isolation (needs profile or root) |
| Arch | 1.12 / 0.20 | 0.10.2 | 1.6 | 1.22 | **good**; rolling churn risk |
| Fedora 42+ | 1.10 / 0.19 | 0.9.1 | 1.4 | 1.20 | **good**; SELinux documenting needed |
| Fedora 40/41 | 1.9–1.10 / 0.18 | 0.8–0.9 | 1.0 | 1.18–1.20 | acceptable |
| Ubuntu 22.04 | 1.7 / **0.15** | 0.4.1 | 0.3.48 | 1.14 | **degraded tier** — old wlroots; support ends 2027-04; Nix overlay or feature-gate |
| Debian 12 | 1.7 / **0.15** | 0.5.0 | 0.3.65 | 1.16 | **degraded tier** — same wlroots issue |
| Windows | — | — | — | — | separate native backend; not in the Linux matrix |

Without root, the only realistic full-stack route is Nix (newest sway/wayvnc available
anywhere) or per-user extraction of leaf packages — core compositor stacks effectively require
an approved `apt/dnf/pacman` step. This constraint drives the approval-gated provisioning model.

---

## 11. Technology evaluation

Research pass 2026-11-20; versions verified against official repos/distro indexes; items that
could not be re-verified are marked ⚠︎ in the uncertainty ledger (§13).

### 11.1 Compositor / desktop stack

| Candidate | Headless, no root | X11 apps | Wayland apps | WM/workspaces + agent IPC | Clipboard | Audio | Streaming options | License | Maintenance | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| **sway + wayvnc** | **yes** — headless backend needs no seat/DRM/logind; `swaymsg create_output` | yes (XWayland) | native | **best-in-class**: i3-compatible IPC + event streams | wayvnc via wlr-data-control + keeper | none over RFB (side channel) | wayvnc→noVNC; screencopy→encode later | MIT / ISC | very active (sway 1.12 2026-05; wayvnc 0.10.2 2026-09) | **primary choice** |
| Smithay custom compositor | yes | yes (XWayland) | native | whatever we build — native capture + input injection | full control | full control | own encoder from day one | MIT | library active (0.7.0), docs sparse | **strategic second** — weeks-to-months effort; revisit if sway IPC limits us |
| labwc | yes ⚠︎ | yes | native | stacking WM, weak scripting (small IPC) | via wayvnc | none over RFB | wayvnc | GPL-2.0 | active (0.20.3) | usable as user-choice WM; not the platform |
| river | yes ⚠︎ | yes | native | WM split into separate process (0.4.0+); young | via wayvnc | none | wayvnc | GPL-3.0 ⚠︎ | active, niche | not yet |
| Weston RDP backend | yes, per-client sessions | yes | native | weak WM automation | RDP ⚠︎ | RDP ⚠︎ | RDP → gateway needed | MIT ⚠︎ | slowed | niche |
| GNOME g-r-d headless | single-user mode ⚠︎; system mode wants GDM | yes | native | D-Bus remote-desktop APIs | RDP | **yes — PipeWire→RDP audio** | RDP → gateway (Guacamole/IronRDP) | GPL-2.0 | GNOME core | only if consumer-RDP polish outweighs footprint + GPL |
| KDE Plasma + krdp | **no** — headless login unsupported | yes | native | Plasma scripting | yes | RDP | RDP | GPL | active | reject for headless VPS |
| Xvfb + i3/Xfce + x11vnc/xrdp | yes, trivially | **best** | **no** | i3 IPC excellent | yes | separate bridge | x11vnc→noVNC; xrdp→Guacamole | mixed | Xorg in maintenance | **transitional fallback** — the existing x11rb machinery fits here; fails the Wayland requirement |

### 11.2 Streaming stack

| Stack | Browser client | Audio | Clipboard | File transfer | CPU (2 vCPU, 1080p, est.) | Latency | License | Integration effort |
|---|---|---|---|---|---|---|---|---|
| **noVNC + wayvnc + agent WS bridge** | high (noVNC v1.7.0 2026-04, MPL-2.0) | none in RFB — separate channel | text bidirectional | custom channel (ours) | low for desktop work (dirty-rect); saturates on video playback | good; TCP HOL on bad links | MPL-2.0 / ISC / MIT | **low** — websockify-equivalent in agent + embed noVNC |
| KasmVNC | high (own client) | built-in | yes | yes ⚠︎ | low; SIMD encoders | good | **modified/mixed — inspect before bundling** | medium; X11-only |
| Guacamole (guacd + common-js) | high | RDP RDPSND | rich | drive redirection / SFTP | extra guacd hop; H.264 in 1.6 needs GPU | good | Apache-2.0 | medium — Java/guacd ops; JS client embeddable |
| IronRDP (Rust WASM) | medium | ⚠︎ | ⚠︎ | ⚠︎ | RDP server side cheap | good | MIT/Apache ⚠︎ | medium-high; must also run xrdp/g-r-d |
| neko (WebRTC) | high (v3 TS core) | yes (Opus track) | yes | limited | H.264 usually GPU; CPU fallback | best (congestion control) | Apache-2.0 | high — adopts its container/server model |
| Selkies-gstreamer | high | yes | yes | yes ⚠︎ | x264/VP8/VP9 software fallback confirmed | best | GPL-3.0 ⚠︎ | high — Python/GStreamer stack |
| **custom screencopy → x264/openh264 → WS → WebCodecs** | build it; VideoDecoder ~95% support (Chrome 94+, Firefox 130 desktop, Safari 16.4+) | WS+AudioWorklet DIY or WebRTC track | trivial (our protocol) | trivial (chunked protobuf) | 0.5–1.5 vCPU/session encode | good on clean links; DIY congestion control | our choice (x264 GPL vs openh264 BSD-slower) | medium-high — the real work is client QoS |

Notes: H.264-in-RFB ("Open H.264") is only shipped server-side by QEMU today; neatvnc/wayvnc's
H.264 needs a GPU (DRM-PRIME) — on a GPU-less VPS, ZRLE/Tight is the v1 reality and the v2
pipeline must encode in the agent, not in the VNC server.

### 11.3 Ranked recommendation

1. **sway headless + wayvnc + agent TCP⇄WS bridge + noVNC client** — smallest path to a real
   desktop in the browser on a 2 vCPU no-GPU VPS, no root, no new licensing surface.
2. **Audio** next: per-session PipeWire → Opus → WebRTC track (neko-proven); WS+AudioWorklet as
   the ICE/TURN-free fallback.
3. **Video v2**: agent-side screencopy → x264/openh264 → WebCodecs decode; keep ZRLE as
   automatic fallback for low-end links; VAAPI when `/dev/dri` exists.
4. **Smithay custom compositor** stays the long-term option if sway's IPC proves limiting for
   multi-tenant control; not v1.
5. X11 (Xvfb + existing x11rb backend) remains a supported `DisplayProvider` for single-app
   streaming and non-wlroots hosts — it is the fallback, not the destination.

---

## 12. Dependency and licensing assessment

Kairo is MIT-licensed. Runtime-linked and shipped components matter; components
apt-installed on the customer's host by the provisioning plan are the customer's packages and
impose no obligations on Kairo's distribution.

| Component | Role | License | Distribution impact |
|---|---|---|---|
| sway / wlroots | compositor | MIT | clean to ship, embed, configure |
| wayvnc / neatvnc | video server | ISC / MIT ⚠︎ (neatvnc) | clean |
| noVNC | browser client | MPL-2.0 | file-level copyleft only — safe to embed/link |
| x264 (v2 option) | encoder | GPL-2.0 | **binary distribution of Kairo linking x264 would force GPL** — ship it as an optional separately-installed package (apt-installed), or use openh264 |
| openh264 crate (v2 option) | encoder | BSD-2 (Cisco binary) | clean; slower/lower quality than x264 — documented tradeoff |
| libvpx (v2 option) | VP8/VP9 encoder | BSD | clean — licensing-safe fallback |
| GStreamer webrtcbin (v2 audio/video) | WebRTC pipeline | LGPL-2.1+ | dynamic linking ok; apt-installed anyway |
| Podman/bwrap/systemd | isolation | Apache-2.0 / GPL (host tools) | run on host, not shipped — no impact |
| PipeWire / wireplumber / mako / foot / cliphist | session stack | LGPL/MIT/ISC variants ⚠︎ per-package | apt-installed by provisioning — customer's packages |
| tracing-appender, ureq, rustls, prost, etc. | existing Rust deps | MIT/Apache | clean (recorded in prior ADRs) |
| React/Vite/Tailwind/xterm/zustand | client deps | MIT/BSD | clean |

Rule adopted: **Kairo's own binaries stay MIT-clean** (no GPL linking); GPL components
(x264, GNOME stack if ever used) are installed as unmodified host packages through the
approval-gated provisioning plan.

---

## 13. Risks and unresolved decisions

### Risks (ranked)

1. **Ubuntu 24.04 AppArmor unprivileged-userns restriction** breaks rootless podman/bwrap out of
   the box; escape hatches need root. No-root Ubuntu 24.04 hosts degrade to T0 — the capability
   report must say so explicitly, and the UI must label shared-privilege sessions.
2. **No hard resource limits without cgroup delegation or root** — a runaway session can OOM the
   host and get the VPS suspended. Mitigations: probe `Delegate=` on `user@.service`, prefer T1/T2,
   enable zram, cap per-session memory via containers.
3. **Bandwidth/CPU of ZRLE for motion-heavy content** on 2 vCPU — one encoded session is the
   realistic ceiling. v1 positions Kairo for productivity desktops; the v2 encode pipeline and
   FPS caps are the mitigation; QoS work is scheduled, not optional.
4. **Cross-session leakage** via shared namespaces (`/dev/shm`, XDG_RUNTIME_DIR, sockets) on
   multi-tenant hosts — the per-session-everything rule (§7) is the control; T0 sessions must
   not be offered as multi-tenant.
5. **sway's tiling-first UX** differs from consumer expectations; IPC-driven floating layouts
   and Kairo's own chrome must carry the experience. Alternative (labwc as user-choice WM)
   exists if needed.
6. **The hand-written TS protobuf codec** drifts (already missing opcodes 62–64); desktop
   protocol growth should switch the client to generated codecs or add a lockstep test.
7. **wlroots API churn on rolling distros** (0.19→0.20 breaks out-of-tree builds) — Kairo
   configures/launches upstream binaries rather than building against wlroots, limiting exposure.
8. **Old distro stacks** (Ubuntu 22.04 / Debian 12: wlroots 0.15) — supported only in degraded
   tier or via a Nix overlay; standard support for 22.04 ends 2027-04.

### Uncertainty ledger (verify by experiment before relying on them)

- sway headless + XWayland + wayvnc in a minimal VPS container/VM (the ADR-0013 smoke test).
- wayvnc clipboard sync specifics and edge cases (issue #254) on the target stack versions.
- GNOME single-user headless mode without GDM (only relevant if that path is ever chosen).
- Weston RDP audio/clipboard; Smithay public capture-API specifics (only if that path opens).
- KasmVNC license text and audio codec (only if evaluated as an alternative).
- Per-session memory/CPU numbers in §7 are estimates pending measurement on the verification box.
- IronRDP web-client audio/clipboard coverage (only if RDP-via-WASM is ever revisited).

### Unresolved decisions (deliberately deferred, with trigger conditions)

1. **Custom Smithay compositor** — trigger: sway IPC cannot express a required multi-tenant or
   capture policy.
2. **VP8/AV1 vs H.264 as v2 default** — trigger: licensing posture after the first distribution
   attempt; VP8/libvpx is the safe default until measured.
3. **WebRTC (ICE/TURN) vs pure-WS media transport** — trigger: audio phase; decide by measuring
   AudioWorklet jitter-buffer quality vs WebRTC track on real networks.
4. **Multi-viewer sharing / SFU (LiveKit)** — trigger: a real collaborative-session requirement.
5. **Windows backend scope** — trait family is designed (§5); implementation sequencing waits
   until the Linux desktop path is proven.
6. **Workspace-bar implementation split** (compositor-native bar vs client chrome) — trigger:
   first usability test of the end-4 chrome over a real compositor stream.
