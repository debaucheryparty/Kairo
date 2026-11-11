# Kairo — end-4 / illogical-impulse UI Port Manifest

This manifest is the technical specification and source-level contract for porting the **end-4 / illogical-impulse** Quickshell interface into the **Kairo** React / TypeScript client architecture.

---

## 1. Architectural Alignment & Constraints

### 1.1 Kairo Core Architecture
```
Kairo Client (React 19 / TypeScript / Tailwind CSS)
      │
      ▼
Kairo Runtime (@kairo/runtime - WebSocket / Protobuf / Session)
      │
      ▼
Kairo Protocol (Binary RPC / Streaming)
      │
      ▼
Kairo Agent (Rust / Linux Host / X11 / Wayland / PTY / Docker / Systemd)
      │
      ▼
Remote Linux Computer (VPS / Server)
```

### 1.2 Non-Negotiable Architectural Rules
1. **NO FRONTEND POLLING**:
   - Do NOT introduce `setInterval` loops or recurring timers for metrics, process lists, or any other system state.
   - Use Kairo Runtime's existing event subscriptions, WebSocket push messages, and connection stores.
   - If a backend capability does not support push/streaming events, classify it as **Category C (Temporary Fallback)** and document the runtime gap instead of polling.
2. **ZERO QUICKSHELL / HYPRLAND RUNTIME DEPENDENCIES**:
   - We are not executing Quickshell or Hyprland in the web client.
   - Every layout, animation curve, visual surface, and interaction from the QML source is implemented natively in React / TypeScript / CSS.
3. **PRESERVE REMOTE APPLICATION INTEGRATION**:
   - Remote GUI apps (Chrome, Firefox, GIMP, VLC, LibreOffice) stream through `RemoteSurfaceViewer` into Kairo windows.
   - `RemoteSurfaceViewer` remains an internal presentation detail; remote applications present their authentic identity (`APP_META` / `.desktop` identity), never a generic "Surface" label.
   - Do NOT modify `RemoteSurfaceViewer.tsx` or the remote surface transport pipeline.
4. **SINGLE COHERENT UI**:
   - No parallel or dual desktops. Obsolete mock components are replaced directly by the ported end-4 components.

---

## 2. Dependency Categorization (A / B / C)

Every component dependency is classified into one of three strict categories:

- **Category A: FAITHFUL PORT**: The end-4 visual presentation, state, math, animations, and interactions can be ported 1:1 directly in the frontend.
- **Category B: KAIRO ADAPTER**: The visual and interaction design is preserved 1:1, but backend operations connect through an existing Kairo Runtime / Window Manager / Agent API.
- **Category C: TEMPORARY FALLBACK**: Kairo genuinely lacks the required backend streaming capability. Visuals and layout match source, but backend execution is documented as a gap rather than emulated through deceptive polling.

| Component / Subsystem | end-4 Source File | Category | Kairo Integration Strategy |
| :--- | :--- | :---: | :--- |
| **Material 3 Token Engine** | `Appearance.qml`, `Config.qml` | **A** | Direct CSS variable & theme constant engine (`src/styles/tokens.css`). |
| **Icons & Fluent Assets** | `Icons.qml`, `assets/icons/fluent/*` | **A** | Direct reuse of SVG assets from `public/icons/fluent/` and Google Material Symbols Rounded. |
| **Screen Corner Masks** | `screenCorners/ScreenCorners.qml` | **A** | Pure CSS/SVG mask with exact 23px radius geometry. |
| **Desktop Background Clock**| `background/widgets/clock/DigitalClock.qml` | **A** | Pure client time calculation matching typography and 2-line layout. |
| **Tactile On-Screen Keyboard**| `onScreenKeyboard/OnScreenKeyboard.qml`| **A** | Ported tactile keyboard layout, key sizing, modifier state, and window focus input dispatch. |
| **Window Frame Titlebars** | Libadwaita / M3 Window Header | **B** | Controlled via `useWindowManager()` (maximize, minimize, close, snap, restore). |
| **Top Bar Floating Islands** | `bar/BarContent.qml`, `BarGroup.qml` | **B** | Floating 3-island layout connected to local session, window manager, and theme state. |
| **Vertical Application Rail** | `verticalBar/VerticalBarContent.qml` | **B** | Slim 46px rail connected to `useWindowManager().windows` and `useSession()`. |
| **Workspaces Indicators** | `bar/Workspaces.qml` | **B** | Driven by `window-context.tsx` (`activeWorkspace`, `setWorkspace`). |
| **Workspaces Overview** | `overview/OverviewWidget.qml` | **B** | 2x5 grid connected to active windows, window cards, and app launchers. |
| **Search Pill** | `overview/SearchWidget.qml` | **B** | Connected to Kairo application registry (`APP_META`) and terminal run command. |
| **Material 3 Dock** | `dock/Dock.qml`, `DockApps.qml` | **B** | Connected to `dock-store.ts` and window manager launch actions. |
| **Hardware Metrics Pill** | `bar/Resources.qml` | **B** | Connected to `runtimeClient.getMetrics()` on connection events / manual trigger (NO polling). |
| **Settings Application** | `settings/settings.qml` & child configs | **B** | Connected to Kairo local storage preferences, server settings, and theme engine. |
| **Session Screen (Power)** | `sessionScreen/SessionScreen.qml` | **B** | Connected to `useSession().logOut()` and server disconnection. |
| **OSD Pill (Brightness/Volume)**| `onScreenDisplay/OnScreenDisplay.qml`| **B** | Driven by custom window events (`kairo:osd-volume`, `kairo:osd-brightness`) and slider interactions. |
| **Host MPRIS Audio Stream** | `mediaControls/PlayerControl.qml` | **C** | **GAP**: Agent lacks D-Bus MPRIS WebSocket streaming. Desktop widget provides interactive controls with simulated playback. |
| **Anti-Flashbang GLSL Shader** | `services/hyprlandAntiFlashbangShader` | **C** | **GAP**: Web client lacks Hyprland GLSL window composition shaders. Ported via SVG and CSS backdrop filters. |
| **Physical Bluetooth Discovery**| `sidebarRight/bluetoothDevices/*` | **C** | **GAP**: Remote VPS does not expose host Bluetooth hardware. Controlled via local toggle state and Web Bluetooth API. |
| **AI Assistant Live Agent** | `sidebarLeft/aiChat/AiChat.qml` | **C** | **GAP**: Kairo Agent does not yet expose live LLM streaming endpoints. Rendered with preview session and ready for Agent LLM integration. |

---

## 3. Design System & Token Extraction

### 3.1 Sources of Truth
- `dots/.config/quickshell/ii/modules/common/Appearance.qml`
- `dots/.config/quickshell/ii/modules/common/Config.qml`
- `dots/.config/quickshell/ii/modules/common/Icons.qml`

### 3.2 Material 3 Color Tokens
| end-4 Token (`Appearance.qml`) | Hex Value (Dark Mode Default) | Semantic Role |
| :--- | :--- | :--- |
| `m3background` | `#141313` | Deep desktop backdrop |
| `m3onBackground` | `#e6e1e1` | High-contrast text on dark background |
| `m3surface` | `#141313` | Base window / drawer surface |
| `m3surfaceDim` | `#141313` | Dim surface container |
| `m3surfaceBright` | `#3a3939` | High-light surface layer |
| `m3surfaceContainerLowest` | `#0f0e0e` | Deep recessed containers |
| `m3surfaceContainerLow` | `#1c1b1c` | Layer 1 background (cards, bars) |
| `m3surfaceContainer` | `#201f20` | Layer 2 background (elevated cards) |
| `m3surfaceContainerHigh` | `#2b2a2a` | Layer 3 background (dialogs, menus) |
| `m3surfaceContainerHighest`| `#363435` | Layer 4 background (tooltips, active pills)|
| `m3primary` | `#cbc4cb` / `#cfbcff` | Primary accent / highlight |
| `m3onPrimary` | `#322f34` | Text on primary accent |
| `m3primaryContainer` | `#2d2a2f` | Primary tinted container |
| `m3onPrimaryContainer` | `#bcb6bc` | High contrast on primary container |
| `m3secondary` | `#cac5c8` | Secondary action fill |
| `m3secondaryContainer` | `#4d4b4d` | Secondary toggles / pills |
| `m3onSecondaryContainer` | `#ece6e9` | Text on secondary toggles |
| `m3tertiary` | `#d1c3c6` | Tertiary accents |
| `m3error` | `#ffb4ab` | Error & destructive actions |
| `m3onError` | `#690005` | Text on error surfaces |
| `m3outline` | `#948f94` | Card & button borders |
| `m3outlineVariant` | `#49464a` | Subtle container dividers |

### 3.3 Layer Hierarchy (`colors` in `Appearance.qml`)
- **Layer 0 (`colLayer0Base`, `colLayer0`)**: Desktop shell background overlay (`#141313` with variable alpha transparency).
- **Layer 1 (`colLayer1Base`, `colLayer1`)**: Floating islands, Top Bar, Dock, Sidebar root surfaces (`m3surfaceContainerLow`).
- **Layer 2 (`colLayer2Base`, `colLayer2`)**: Cards inside islands, slider tracks, quick toggles (`m3surfaceContainer`).
- **Layer 3 (`colLayer3Base`, `colLayer3`)**: Popups, dialogs, active button states (`m3surfaceContainerHigh`).
- **Layer 4 (`colLayer4Base`, `colLayer4`)**: Tooltips, modal alerts (`m3surfaceContainerHighest`).

### 3.4 Corner Radii (`rounding` in `Appearance.qml`)
- `unsharpen`: `2px`
- `unsharpenmore`: `6px`
- `verysmall`: `8px`
- `small`: `12px`
- `normal`: `17px`
- `large` / `screenRounding`: `23px`
- `windowRounding`: `18px`
- `verylarge`: `30px`
- `full`: `9999px` (`rounded-full`)

### 3.5 Sizes & Geometry (`sizes` in `Appearance.qml`)
- `baseBarHeight`: `40px`
- `baseVerticalBarWidth`: `46px`
- `elevationMargin`: `10px`
- `mediaControlsWidth`: `440px`, `mediaControlsHeight`: `160px`
- `notificationPopupWidth`: `410px`
- `osdWidth`: `180px`
- `sidebarWidth`: `460px`, `sidebarWidthExtended`: `750px`
- `searchWidthCollapsed`: `210px`, `searchWidth`: `360px`
- `wallpaperSelectorWidth`: `1200px`, `wallpaperSelectorHeight`: `690px`

### 3.6 Typography (`font` in `Appearance.qml`)
- **Primary / Main font**: `Plus Jakarta Sans` / `Google Sans Flex` (weights: `400`, `450`, `500`, `600`, `700`)
- **Numbers / Clock font**: `Readex Pro` / `Google Sans Flex` (`wght`: `450`)
- **Monospace font**: `JetBrainsMono Nerd Font` / `JetBrains Mono`
- **Icon fonts**: `Material Symbols Rounded` (FILL: 1, GRAD: 0, opsz: 24)
- **Pixel sizes**:
  - `smallest`: `10px`
  - `smaller`: `12px`
  - `smallie`: `13px`
  - `small`: `15px`
  - `normal`: `16px`
  - `large`: `17px`
  - `larger`: `19px`
  - `huge`: `22px`
  - `hugeass`: `23px`

### 3.7 Animation Curves (`animationCurves` in `Appearance.qml`)
- `expressiveDefaultSpatial`: `cubic-bezier(0.38, 1.21, 0.22, 1.00)`, duration: `500ms`
- `expressiveFastSpatial`: `cubic-bezier(0.42, 1.67, 0.21, 0.90)`, duration: `350ms`
- `expressiveSlowSpatial`: `cubic-bezier(0.39, 1.29, 0.35, 0.98)`, duration: `650ms`
- `expressiveEffects`: `cubic-bezier(0.34, 0.80, 0.34, 1.00)`, duration: `200ms`
- `emphasizedEnter`: `cubic-bezier(0.05, 0.7, 0.1, 1.0)`, duration: `400ms`
- `emphasizedExit`: `cubic-bezier(0.3, 0.0, 0.8, 0.15)`, duration: `200ms`

---

## 4. Visual-Fidelity Checklists for Major Shell Components

### 4.1 TopBar (`BarContent.qml` → `TopBar.tsx`)
- [ ] **Exact Structure**: 3 distinct floating islands separated by open screen space (Left: App/Search; Center: Workspaces + Clock; Right: Status/Tray/Power).
- [ ] **Dimensions**: Total height `40px` (`baseBarHeight`), top margin `8px` (`hyprlandGapsOut`), side margins `10px`.
- [ ] **Positioning**: Fixed at top, centered horizontally, non-blocking click-through between islands.
- [ ] **Spacing**: `gap-2` between controls inside islands; `px-3` internal island padding.
- [ ] **Colors & Surfaces**: Layer 1 background (`m3surfaceContainerLow` with 80% opacity), `border-white/10`, backdrop-filter blur `16px`.
- [ ] **Typography**: Font family `Plus Jakarta Sans`, numbers in `Readex Pro`, size `13px` / `11px`.
- [ ] **Icons**: Sparkle trigger, search, workspace dots, audio, wifi, host badge, keyboard, settings, power.
- [ ] **Border Radius**: Pill containers with `rounded-full` or `rounded-[17px]`.
- [ ] **Shadows**: Elevation shadow `0 8px 32px rgba(0,0,0,0.45)`.
- [ ] **Animations**: `expressiveDefaultSpatial` (500ms) for workspace pill stretch; `expressiveEffects` (200ms) for icon hover.
- [ ] **States**: Hover (tint +10%), Pressed (scale 0.96), Active workspace pill highlight.
- [ ] **Responsive**: Collapses center module width from 360px to 280px to 190px on screens under 1200px / 1000px.

### 4.2 VerticalBar (`VerticalBarContent.qml` → `VerticalBar.tsx`)
- [ ] **Exact Structure**: Single continuous floating vertical rail positioned along left display margin.
- [ ] **Dimensions**: Width `46px` (`baseVerticalBarWidth`), full screen height minus 16px margins.
- [ ] **Positioning**: Fixed left edge, `left-2`, vertically centered.
- [ ] **Spacing**: Vertical flex layout; `gap-3` between icon groups; running indicators positioned directly beneath or adjacent to app icons.
- [ ] **Colors & Surfaces**: Layer 1 container (`m3surfaceContainerLow`), `border-white/10`, backdrop blur.
- [ ] **Typography**: Vertical 2-line clock font in `Readex Pro` (`12px` font size, leading tightly stacked).
- [ ] **Icons**: Sparkle button at top, search icon, vertical running app stack, vertical workspace dots, battery badge (`92`), bottom action triggers.
- [ ] **Border Radius**: Outer container `rounded-[23px]`, inner buttons `rounded-[14px]`.
- [ ] **States**: Active window indicator pill (`w-1 h-3` or `w-2.5 h-1`), hover highlight, active press scale.
- [ ] **Responsive**: Fixed width rail; window manager offsets left client boundary by 56px when active.

### 4.3 Left Sidebar (`SidebarLeftContent.qml` → `SidebarLeft.tsx`)
- [ ] **Exact Structure**: Full-height drawer sliding in from left screen edge with top segmented tabs (`Intelligence` / `Anime`) and bottom command input.
- [ ] **Dimensions**: Width `460px` (`sidebarWidth`), expanding to `750px` on demand; margins `8px`.
- [ ] **Positioning**: Fixed `left-2`, `top-2`, `bottom-2`, z-index 100.
- [ ] **Spacing**: `p-4` internal padding; `gap-3` between conversation bubbles.
- [ ] **Colors & Surfaces**: Layer 1 root surface, Layer 2 conversation cards, Layer 3 model picker pill.
- [ ] **Typography**: Main body text in `Plus Jakarta Sans` `13px`; code snippets in `JetBrains Mono` `12px`.
- [ ] **Icons**: Segmented tab glyphs (`sparkles`, `auto_awesome`), send chevron, copy, edit, code icons.
- [ ] **Border Radius**: Outer drawer `rounded-[23px]`, input pill `rounded-full`, message bubbles `rounded-[17px]`.
- [ ] **Animations**: Slide enter via `emphasizedEnter` (400ms), exit via `emphasizedExit` (200ms).
- [ ] **States**: Model selector dropdown, input focus ring, scroll-to-bottom floating button.

### 4.4 Right Control Center (`SidebarRightContent.qml` → `QuickSettingsPanel.tsx`)
- [ ] **Exact Structure**: Full-height drawer sliding in from right screen edge with uptime header (`Up 48m`), dual sliders, 2x4 quick toggles grid, notification list, and tabbed widgets (Calendar, To-Do, Timer).
- [ ] **Dimensions**: Width `460px`, margins `8px` from screen edges.
- [ ] **Positioning**: Fixed `right-2`, `top-2`, `bottom-2`, z-index 100.
- [ ] **Spacing**: `p-3.5` internal padding, `gap-2.5` between sections.
- [ ] **Colors & Surfaces**: Layer 1 root surface, Layer 2 slider tracks & toggle buttons, Layer 3 notification cards.
- [ ] **Typography**: Headers `Plus Jakarta Sans` `14px` bold, timestamps and stats in `Readex Pro`.
- [ ] **Icons**: Brightness sun, Volume speaker, Wifi, Bluetooth, EasyEffects, Caffeine, Night Light, battery level badge.
- [ ] **Border Radius**: Outer drawer `rounded-[23px]`, toggle buttons `rounded-[17px]`, sliders `rounded-full`.
- [ ] **Animations**: Enter/exit slide transitions with `cubic-bezier(0.05, 0.7, 0.1, 1.0)`.
- [ ] **States**: Active toggles filled with `--color-primary` and inverted text; inactive toggles filled with Layer 2 background.

### 4.5 Quick Sliders (`QuickSliders.qml` → `QuickSliders.tsx`)
- [ ] **Exact Structure**: Dual horizontal slider tracks (Brightness top, Volume bottom) with leading and trailing status glyphs.
- [ ] **Dimensions**: Track height `28px`, full container width.
- [ ] **Colors & Surfaces**: Background track `m3surfaceContainer`, active progress fill `--color-primary`.
- [ ] **Border Radius**: Track and fill `rounded-full`.
- [ ] **States**: Continuous dragging, hover expansion, level counter tooltips.

### 4.6 Workspaces Overview & Search (`OverviewWidget.qml` & `SearchWidget.qml` → `OverviewModal.tsx`)
- [ ] **Exact Structure**: Floating top search pill (`search`, `content_copy`, `calculate`) above a 2x5 grid container of 10 workspace tiles.
- [ ] **Dimensions**: Container width max `1360px`, workspace tiles aspect ratio `16:10` (`aspect-[16/10]`).
- [ ] **Positioning**: Upper screen section; bottom section softly reveals desktop wallpaper and on-screen keyboard through translucent backdrop blur.
- [ ] **Spacing**: 5px workspace tile gap (`workspaceSpacing: 5`).
- [ ] **Colors & Surfaces**: Container `m3surfaceContainerLow` with 90% opacity, `border-white/10`.
- [ ] **Typography**: Workspace watermark numbers in large display font (`text-4xl` / `text-5xl`), search bar text in `Plus Jakarta Sans`.
- [ ] **Content Representation**: Occupied workspaces display miniature window cards with real titlebars, code snippets, and centered app icon glyphs. Empty workspaces display faint watermark numbers.
- [ ] **Animations**: Zoom/fade enter with `expressiveDefaultSpatial`.
- [ ] **States**: Active workspace tile border highlight (`border-white/30` with subtle glow ring), hover tile highlight.

### 4.7 Material 3 Dock (`Dock.qml` & `DockApps.qml` → `Dock.tsx`)
- [ ] **Exact Structure**: Floating bottom container with left pin button (`keep`), app icon sequence, running pill indicators, system trash container, and app launcher grid button.
- [ ] **Dimensions**: Height `56px`, margins `8px` from bottom screen edge.
- [ ] **Positioning**: Fixed bottom center, z-index 30.
- [ ] **Spacing**: `gap-2` between app items; running indicator pill centered directly underneath each active app.
- [ ] **Colors & Surfaces**: Layer 1 container (`m3surfaceContainerLow` with 80% opacity), `border-white/10`, backdrop blur.
- [ ] **Border Radius**: Outer dock `rounded-[23px]`, app buttons `rounded-[16px]`.
- [ ] **Running Indicator**: Authentic end-4 pill indicator (`w-2.5 h-1 rounded-full bg-[#cfbcff]`), not dots or macOS bouncing dots.
- [ ] **States**: Pin toggle (fixed vs auto-hide), app hover lift, running app state.

### 4.8 Settings Application (`settings.qml` → `SettingsApp.tsx`)
- [ ] **Exact Structure**: Left navigation rail with `[=]` expand toggle, `[Config file]` floating action button, navigation categories (`Quick`, `General`, `Bar`, `Background`, `Interface`, `Services`, `Advanced`, `About`), and broad right content pane.
- [ ] **Dimensions**: Window default width `860px`, height `580px`.
- [ ] **Content Surfaces**: Wallpaper preview card with `Random: Konachan` and `Random: osu!` action buttons, Light/Dark preference toggles, 9-palette Material scheme selector, Bar position and style selectors, and Background Clock options.
- [ ] **Border Radius**: Window `rounded-[18px]`, navigation items `rounded-[14px]`, FAB `rounded-[16px]`.
- [ ] **States**: Selected rail tab indicator, toggle switches, continuous sliders.

### 4.9 On-Screen Display (`OnScreenDisplay.qml` → `OnScreenDisplay.tsx`)
- [ ] **Exact Structure**: Floating pill positioned at top center (`fixed top-3 left-1/2 -translate-x-1/2`).
- [ ] **Dimensions**: Width `180px` (`osdWidth`), height `36px`.
- [ ] **Components**: Left status icon (`light_mode` or `volume_up`), label (`Brightness` or `Volume`), numeric value (`69`), and smooth progress bar.
- [ ] **Colors & Surfaces**: Layer 0 pill surface (`#1b1c18` with 90% opacity), accent fill `#b8f397` or `#cfbcff`.
- [ ] **Animations**: `emphasizedEnter` fade-in, auto-dismiss timeout after 1800ms.

### 4.10 Desktop Background Clock (`DigitalClock.qml` → `DesktopClockWidget.tsx`)
- [ ] **Exact Structure**: Massive 2-line digital numerals (hours top, minutes bottom) with single-line date string below.
- [ ] **Positioning**: Right half of desktop background layer, vertically centered, non-interactive (click-through to desktop).
- [ ] **Typography**: `Readex Pro` / `Google Sans Flex`, massive display size (`140px` to `160px` font size), line-height tightly clamped.
- [ ] **Colors**: Primary accent text with subtle translucency (`text-[#cfbcff]/90`).

---

## 5. Revised Phased Implementation Plan

Implementation proceeds sequentially, strictly executing one phase at a time with verification gates before moving forward:

```
Phase 1: Design Tokens & CSS Engine
   │ (tokens.css, Appearance tokens, fonts, radii, bezier curves)
   ▼
Phase 2: Top Shell & Vertical Rail
   │ (TopBar.tsx, VerticalBar.tsx, ScreenCorners.tsx)
   ▼
Phase 3: Left Sidebar (Intelligence Drawer)
   │ (SidebarLeft.tsx, tabs, conversation layout)
   ▼
Phase 4: Right Control Center
   │ (QuickSettingsPanel.tsx, QuickSliders.tsx, QuickTogglesGrid.tsx, Calendar, Notifications)
   ▼
Phase 5: Workspaces Overview & Search
   │ (OverviewModal.tsx, OverviewSearch.tsx, 2x5 grid, window cards)
   ▼
Phase 6: Material 3 Dock
   │ (Dock.tsx, DockApps.tsx, running pill indicators)
   ▼
Phase 7: Settings & System UI
   │ (SettingsApp.tsx, navigation rail, wallpaper selector)
   ▼
Phase 8: OSD, Keyboard, Session & Desktop Widgets
   │ (OnScreenDisplay.tsx, OnScreenKeyboard.tsx, SessionScreen.tsx, DesktopWidgets.tsx)
   ▼
Phase 9: Obsolete Mock UI Cleanup & Build Verification
   │ (Dead code elimination, build verification, remote surface end-to-end check)
```

### Verification Gate for Each Phase
1. `pnpm --filter @kairo/web typecheck` passes with zero errors.
2. `pnpm --filter @kairo/web build` succeeds.
3. Headless Chrome captures visual output to verify against end-4 QML source and reference screenshots.
4. Existing Kairo functionality (Runtime connection, RemoteSurfaceViewer, terminal, app launch) remains working.
