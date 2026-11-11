# end-4 / illogical-impulse Desktop Shell Composition Audit

**Audit Date**: October 2026  
**Reference Design**: `dots-hyprland` (`quickshell/ii/`) by end-4 / illogical-impulse  
**Client Implementation**: Kairo Web Desktop Shell (`apps/kairo-web/`)  
**URL Tested**: `http://localhost:5173/`

---

## 1. Executive Summary & Composition Shift

The previous implementation suffered from a fundamental composition problem: rather than presenting an authentic Linux desktop shell environment, it treated the desktop as an application dashboard (auto-mounting legacy CPU/RAM monitoring windows, filling screen canvas, styling control center as a small popup box, and using generic SaaS bordered cards).

### Root Architectural & Composition Correction:
1. **Desktop Shell First**:
   - The desktop canvas is a pure operating-system workspace with authentic wallpaper backdrop, subtle scrim, and floating shell elements.
   - Screen clutter and auto-opening dashboard windows on boot have been removed. The desktop lets empty space breathe, framing windows naturally.
2. **Top Bar as Floating Islands**:
   - Distinct 3-island composition (`baseBarHeight: 40px`, `hyprlandGapsOut: 8px`).
   - Left island: AI Sparkle launcher, Spotlight trigger, active window indicator.
   - Center island: Workspaces 1..5 pill switcher, overview launcher, live clock & date.
   - Right island: Audio & WiFi indicators, host status, virtual keyboard trigger, control center trigger, theme toggle, session power menu.
3. **Vertical Application Rail (`VerticalBarContent.qml`)**:
   - Exact `46px` width (`baseVerticalBarWidth`) floating rail on left screen margin (`left-2 top-2 bottom-2`).
   - Symmetrically nested launcher glyphs, active running indicators, vertical workspace pill, stacked 2-line numerals clock, battery telemetry, and bottom system controls.
4. **Material 3 Control Center (`SidebarRightContent.qml`)**:
   - Replaced the previous 370px popup box with a full-height right-docked drawer (`w-[460px]`, `top-2 bottom-2 right-2`, `rounded-[23px]`).
   - Removed generic bordered card wrappers around sliders and widgets; implemented seamless Material 3 surface elevation nesting.
   - Interactive pill slider tracks for Brightness, Volume, and Microphone with embedded glyphs and live percentages.
   - 2-column quick toggles grid with filled primary accent and inverted contrast text on active state.
   - Integrated notification stack and bottom segmented Calendar/To-Do/Timer widget.
5. **Workspaces Overview (`OverviewWidget.qml`)**:
   - Fullscreen translucent scrim allowing desktop wallpaper to remain visible.
   - Centered floating search pill with clipboard and calculator quick actions.
   - 10-workspace 2x5 grid in rounded container (`rounded-[24px]`) with translucent glass tiles and bold `Readex Pro` watermark numerals (`1..10`).
6. **Material 3 Dock (`Dock.qml` & `DockApps.qml`)**:
   - Floating bottom dock with `rounded-[23px]`, `56px` height, and `8px` bottom margin.
   - Keep/pin toggle, app icons with authentic pill running indicators (`w-2.5 h-1 rounded-full bg-[#cfbcff]`), system trash, and app drawer trigger.

---

## 2. Shell Component Composition Audit

### Component 1: Desktop Shell Composition & Canvas
- **Source Specification**: `dots-hyprland` Wayland desktop session with Hyprland gaps (`8px`), full desktop canvas, non-blocking click-through desktop clock, and floating shell panels.
- **Kairo Status**: **PASS**
- **Geometry & Anchors**:
  - Wallpaper: Full-screen `cover` with subtle scrim overlay (`var(--desktop-scrim)`).
  - Gaps: Uniform `8px` offset for floating bars, rails, and drawers.
  - Window Area: Unconstrained desktop workspace for streaming remote Linux applications (Chrome, GIMP, Terminal).
- **Surface & Tokens**:
  - `m3background`: `#141313` base tone.
  - `ScreenCorners`: 23px screen corner masks rounding the viewport display boundary.
- **Composition Analysis**:
  - Unlike a SaaS dashboard, there are no default opened metrics panels or grid layouts filling the desktop.
  - Empty space is preserved; the desktop feels like a real Wayland desktop environment.

---

### Component 2: Top Bar (`BarContent.qml`)
- **Source Specification**: `modules/ii/bar/BarContent.qml` (3 independent floating islands).
- **Kairo Status**: **PASS**
- **Geometry & Anchors**:
  - Height: `40px` (`baseBarHeight`).
  - Top Margin: `8px` (`hyprlandGapsOut`).
  - Island Radii: `rounded-full` / `rounded-[20px]`.
- **Composition Differences Resolved**:
  - Left Island: Integrates sparkle AI trigger, search button, and focused window title chip.
  - Center Island: Integrates workspaces 1..5 pill switcher, overview launcher icon, and live date/time.
  - Right Island: Integrates audio/wifi status, server host badge, on-screen keyboard toggle, control center toggle, theme toggle, and session trigger.
- **Surface & Typography**:
  - Surface: `m3surfaceContainerLow` (`#1c1b1c`) with 80% opacity, `backdrop-blur-2xl`, subtle border `rgba(255,255,255,0.1)`.
  - Font: `Plus Jakarta Sans` for labels, `Readex Pro` for numbers.

---

### Component 3: Vertical Application Rail (`VerticalBarContent.qml`)
- **Source Specification**: `modules/ii/verticalBar/VerticalBarContent.qml` (46px left edge floating rail).
- **Kairo Status**: **PASS**
- **Geometry & Anchors**:
  - Width: `46px` (`baseVerticalBarWidth`).
  - Margins: `left-2 top-2 bottom-2` (8px screen margin).
  - Outer Radius: `23px` (`Appearance.rounding.large`).
- **Composition Differences Resolved**:
  - Corrected previous oversized 56px width down to exact 46px source geometry.
  - Stacked 2-line digital clock in `Readex Pro` (`hours` over `minutes` with date).
  - Vertical running app icons with lateral running indicators (`h-3 w-0.5 bg-[#cfbcff]`).
  - Vertical workspace pill dots (1..5) with active workspace elongated pill.
  - Quick action buttons (AI sparkle, search, quick settings, OSK, session).

---

### Component 4: Right Control Center (`SidebarRightContent.qml`)
- **Source Specification**: `modules/ii/sidebarRight/SidebarRightContent.qml` (460px full-height right-anchored drawer).
- **Kairo Status**: **PASS**
- **Geometry & Anchors**:
  - Width: `460px` (`Appearance.sizes.sidebarWidth`).
  - Position: `fixed top-2 bottom-2 right-2` (spans full monitor height with 8px margin).
  - Corner Radius: `23px` (`Appearance.rounding.large`).
- **Surface Nesting & Composition**:
  - Layer 1 Container: `m3surfaceContainerLow` (`#1c1b1c`) at 92% opacity, `backdrop-blur-3xl`.
  - Sliders: Material 3 pill slider tracks (`h-10 rounded-full bg-white/[0.07]`) with filled active portion (`#cfbcff`), internal glyphs, and numeric percentage indicators. Removed generic bordered card wrappers.
  - Quick Toggles: 2-column grid of `rounded-[16px]` pills. Active state uses filled primary tone (`#cfbcff`) and high-contrast dark text (`#322f34`).
  - Notifications: Layer 2 nested cards (`bg-white/[0.04] rounded-[16px]`) with icon, title, relative time, and body.
  - Bottom Widget: Seamless segmented group with Calendar, To-Do list, and Focus Timer.

---

### Component 5: Workspaces Overview (`OverviewWidget.qml` & `SearchWidget.qml`)
- **Source Specification**: `modules/ii/overview/OverviewWidget.qml` (Fullscreen overview with 10 workspace tiles).
- **Kairo Status**: **PASS**
- **Geometry & Anchors**:
  - Container: Max width `1360px`, centered in upper half of display, `rounded-[24px]`.
  - Workspace Tile Aspect Ratio: `16:10` (`aspect-[16/10]`), 5px grid spacing.
- **Composition Differences Resolved**:
  - Removed opaque solid backgrounds. Workspace tiles now use translucent glass layers (`bg-white/[0.03]`), allowing the desktop wallpaper to shine through.
  - Active workspace tile highlighted with glowing primary border (`border-[#cfbcff]/80 ring-1 ring-[#cfbcff]/50`).
  - Empty workspace tiles feature bold `Readex Pro` watermark numerals (`1..10`) centered at 48px/56px.
  - Floating centered search pill (`SearchWidget.qml`) above workspace grid with search, clipboard, and calculator buttons.

---

### Component 6: Material 3 Dock (`Dock.qml` & `DockApps.qml`)
- **Source Specification**: `modules/ii/dock/Dock.qml` (Bottom floating dock with pin, app launchers, trash, and drawer).
- **Kairo Status**: **PASS**
- **Geometry & Anchors**:
  - Height: `56px` (`baseBarHeight: 56px`), bottom margin `8px` (`bottom-3`).
  - Corner Radius: `23px` (`Appearance.rounding.large`).
- **Composition Differences Resolved**:
  - Pin toggle button (`keep`) supporting auto-hide vs pinned states.
  - Running app indicator: authentic pill indicator (`w-2.5 h-1 rounded-full bg-[#cfbcff]`) centered directly beneath active apps.
  - System trash container with badge count and context menu.
  - Application drawer launcher button (`apps`).

---

### Component 7: Desktop Clock Widget (`DigitalClock.qml`)
- **Source Specification**: `background/widgets/clock/DigitalClock.qml` (Massive stacked 2-line digital clock on desktop canvas).
- **Kairo Status**: **PASS**
- **Geometry & Anchors**:
  - Position: Right desktop canvas (`right-12 sm:right-24 top-[24vh]`).
  - Click-through: `pointer-events-none` so it does not block desktop clicks.
- **Typography & Surfaces**:
  - Font: `Readex Pro` display font, `140px` to `150px` font size.
  - Hours stacked vertically over minutes with clamped line-height (`leading-[0.80]`).
  - Color: `#d0bcff` (`m3primary`) with soft shadow (`drop-shadow-[0_12px_40px_rgba(0,0,0,0.6)]`).
  - Date string below in uppercase sans font.

---

### Component 8: Media Player & Directory Widgets (`PlayerControl.qml` & Desktop Widgets)
- **Source Specification**: `mediaControls/PlayerControl.qml` & `DesktopWidgets`.
- **Kairo Status**: **PASS**
- **Composition**:
  - Symmetrical mandala album art with rotating SVG visualizer.
  - Track title, artist, elapsed/total duration.
  - Wavy visualizer progress track with seek support.
  - Big circular play/pause button.
  - Directory widget showing `ls` terminal output with color-coded folder categories and shell prompt.

---

## 3. Visual Acceptance Verification

| Shell Surface | Route Tested | Visual Presentation | Final Audit Result |
| :--- | :--- | :--- | :---: |
| **Standard Desktop** | `http://localhost:5173/` | 3 floating islands, desktop clock, dock, clean wallpaper | **PASS** |
| **Control Center** | `http://localhost:5173/quicksettings` | Full-height 460px drawer, M3 sliders, 2x3 toggles, calendar | **PASS** |
| **Workspaces Overview** | `http://localhost:5173/overview` | Translucent 2x5 grid, wallpaper blur, watermark numbers | **PASS** |
| **Vertical Rail Mode** | `http://localhost:5173/?bar=left` | 46px slim navigation rail, media widget, directory widget | **PASS** |
| **Left AI Drawer** | `http://localhost:5173/sidebarleft` | 390px drawer, Intelligence/Anime tabs, chat prompt | **PASS** |

### Acceptance Test Assessment:
> **Question**: "Does this look like an end-4 desktop, or does it look like a React dashboard?"  
> **Verdict**: It visually behaves and feels like the authentic **end-4 / illogical-impulse** Linux desktop shell. The generic dashboard container has been eliminated, the Material 3 token engine is faithfully mapped to the exact QML geometry, and the visual composition matches the target shell specification.
