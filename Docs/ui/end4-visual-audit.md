# end-4 / illogical-impulse vs Kairo Visual & Source Code Audit

**Audit Date**: October 2026  
**Target Specification**: `dots-hyprland` (`quickshell/ii/`) by end-4 / illogical-impulse  
**Implementation Target**: Kairo Web Desktop Shell (`apps/kairo-web/src/components/desktop`)  
**Scope**: 1-to-1 Source Code & Visual Property Comparison  

---

## 1. Audit Methodology & Standards

Every component in this audit was verified against the actual QML source code in `dots/.config/quickshell/ii/` and the Material 3 design tokens in `Appearance.qml`.

Properties verified for each component:
1. **Layout Hierarchy**: Container nesting, item flow, alignment, flex/grid properties.
2. **Dimensions & Positioning**: Heights, widths, margin/padding constants, elevation margins.
3. **Colors & Surface Layers**: `m3colors`, `colLayer0` through `colLayer4`, opacity masks, and alpha transparency.
4. **Typography & Iconography**: Font scales (`title`, `larger`, `normal`, `smaller`), weights, Material Symbols Rounded (FILL 1), and Fluent icons.
5. **Border Radii & Shadows**: `rounding: unsharpen (0px), verysmall (8px), small (12px), normal (14px), window (18px), large (23px), full (9999px)`.
6. **Animations & States**: Durations, Bézier curves (`expressiveDefaultSpatial`, `expressiveEffects`), hover, pressed, active, toggled, and disabled states.
7. **Runtime & Data Integrity**: Verified absence of frontend polling loops, preservation of remote identities, and connection to live Runtime APIs.

### Difference Classifications
- **Class A**: Intentional Kairo adaptation (e.g., remote multi-server VPS management, web-safe browser APIs).
- **Class B**: Kairo backend limitation (e.g., hardware absent in cloud virtualization).
- **Class C**: Porting mistake (fixed immediately during audit).
- **Class D**: Source behavior not yet implemented (documented gap).

---

## 2. Source vs Target Visual & Structural Audit Table

| Component | Source File | Kairo Target | Fidelity | Differences | Action & Classification |
| :--- | :--- | :--- | :---: | :--- | :--- |
| **Top Bar** | `modules/ii/bar/BarContent.qml` | `TopBar.tsx` | **PASS** | 3 floating islands (`rounded-full`, `h-10`, `backdrop-blur-2xl`). Left island wheel adjusts brightness; right island wheel adjusts volume via OSD events. Active window chip displays real focused window. | **Class A** (Adaptation for remote multi-VPS switching). Category C fixed (wheel scroll for volume/brightness added). |
| **Workspaces** | `modules/ii/bar/Workspaces.qml` | `Workspaces.tsx` | **PASS** | 26px button bounds, 22px active pill with `#9d86e9`, 1..5 numeric indicators, dot indicators on occupied workspaces, wheel cycling, right-click triggers Overview. | **Class A** (Dot indicators instead of contiguous SVG stretch mask). Connected to `window-context.tsx`. |
| **Top Bar Resources** | `modules/ii/bar/Resources.qml` | `TopBarResources.tsx` | **PASS** | CPU and Memory telemetry chips with authentic Material Symbol icons (`planner_review`, `memory`) and dynamic color indicator dots. | **Class A** (Telemetry fetched reactively on connect; zero interval polling). |
| **Vertical Rail** | `modules/ii/verticalBar/VerticalBarContent.qml` | `VerticalBar.tsx` | **PASS** | 52px floating rail on left margin. Intelligence sparkle button, app launcher, vertical app stack with running indicator line, 1..5 workspace dots, vertical 2-line clock, battery badge. | **Class C Fixed**: Removed hardcoded `92` battery badge; wired to `navigator.getBattery()`. |
| **Left Sidebar** | `modules/ii/sidebarLeft/SidebarLeftContent.qml` & `AiChat.qml` | `SidebarLeft.tsx` | **PASS** | 390px drawer with segmented tabs (`[✦ Intelligence]`, `[Anime]`), Material Symbol icons (`neurology`, `bookmark_heart`), temperature badge `0.5`, model selector (`Gemini 2.5 Flash`, `Gemini 3 Flash`, `Mistral Medium 3`), markdown chat history. | **Class C Fixed**: Updated tab icons to `neurology` and `bookmark_heart`, fixed temperature from `1.0` to `0.5` matching `Ai.qml`, added model selector. |
| **Control Center Panel** | `modules/ii/sidebarRight/SidebarRightContent.qml` | `QuickSettingsPanel.tsx` | **PASS** | 370px drawer: Uptime badge (`selectedServer?.uptime`), settings/power actions, battery badge (`navigator.getBattery()`), quick toggles 2x3 grid, notification cards stack, and tabbed Calendar/To-Do/Timer widget. | **Class A** (Client battery & remote VPS uptime integration). |
| **Quick Sliders** | `modules/ii/sidebarRight/QuickSliders.qml` | `QuickSliders.tsx` | **PASS** | Filled slider tracks for Brightness (`wb_sunny`/`light_mode`), Volume (`volume_down`/`volume_up`), and Microphone (`mic_off`/`mic`), live OSD dispatch on slider change. | **Class C Fixed**: Added dedicated `QuickSliders.tsx` component with Microphone slider matching `QuickSliders.qml`. |
| **Overview Modal** | `modules/ii/overview/OverviewWidget.qml` | `OverviewModal.tsx` | **PASS** | 2x5 grid of 10 workspaces in container (`rounded-[24px]`). 16:10 workspace aspect ratio, 5px gaps, live window thumbnails, large centered watermark numbers on empty tiles. | **Class A** (Web flex layout; connected to active workspace windows). |
| **Overview Search** | `modules/ii/overview/SearchWidget.qml` & `SearchBar.qml` | `OverviewSearch.tsx` | **PASS** | Centered floating search pill with search input, `content_copy` button, and `calculate` button. | **Class A** (Integrated in overview search bar). |
| **Overview Window Thumb** | `modules/ii/overview/OverviewWindow.qml` | `OverviewWindowThumb.tsx` | **PASS** | Miniature window card with title bar, close button, background code snippet backdrop, and centered app icon glyph (`centerIcons: true` in end-4). | **Class A** (Center icon ratio 0.35 with backdrop). |
| **Dock** | `modules/ii/dock/Dock.qml` & `DockApps.qml` | `Dock.tsx` | **PASS** | Floating bottom dock with pin toggle (`keep`), app icon sequence, running indicator pills (`w-2.5 h-1 rounded-full bg-[#cfbcff]`), system trash button with item counter, and app launcher (`apps`). Launches real VPS apps via Runtime. | **Class A** (Native RemoteSurface window management). |
| **Settings App** | `settings.qml` | `SettingsApp.tsx` | **PASS** | M3 Navigation Rail with 8 tabs (`Quick`, `General`, `Bar`, `Background`, `Interface`, `Services`, `Advanced`, `About`), `[Config file]` FAB button, wallpaper preview, light/dark toggle, 9 Material palettes, bar layout switches, background clock options. | **Class A** (Web localStorage & client-side theme switching). |
| **On-Screen Display** | `modules/ii/onScreenDisplay/OnScreenDisplay.qml` | `OnScreenDisplay.tsx` | **PASS** | Top-center floating pill with glowing icon, label, level counter, and smooth progress bar track (`#b8f397`), auto-dismiss timer (1800ms). Responds to direct and delta volume/brightness events. | **Class A** (Driven by window custom events). |
| **On-Screen Keyboard** | `modules/ii/onScreenKeyboard/OnScreenKeyboard.qml` | `OnScreenKeyboard.tsx` | **PASS** | Bottom floating tactile on-screen keyboard with pin toggle button (`keep`), function keys row, numeric row, QWERTY rows, modifiers, and tactile feedback. | **Class A** (Virtual keyboard for remote touch/pen inputs). |
| **Session Screen** | `modules/ii/sessionScreen/SessionScreen.qml` | `SessionScreen.tsx` | **PASS** | Fullscreen session dialog with giant clock/date, Lock (`lock`), Reload (`restart_alt`), Logout (`logout`), and Resume (`close`) actions with Material Symbols. Supports pin lock screen mode. | **Class C Fixed**: Replaced generic icons with exact Material Symbols matching `SessionScreen.qml`. |
| **Desktop Digital Clock** | `background/widgets/clock/DigitalClock.qml` | `DesktopClockWidget.tsx` | **PASS** | Giant 2-line numerals (hours stacked over minutes in `#d0bcff`) with date string below, positioned on desktop background. Auto-dims when windows are open. | **Class A** (Reactive client time without host daemon). |
| **Media Player Widget** | `mediaControls/PlayerControl.qml` | `DesktopWidgets.tsx` | **PASS** | Symmetrical mandala album art, track metadata, time display, wavy visualizer seek bar, circular play/pause button. | **Class B** (Kairo-specific adapter: `media.v1` integrates with Linux host `playerctl`/MPRIS D-Bus with live push). |

---

## 3. Mock Data & State Audit Resolution

| Data Point | Initial State | Source System | Kairo Status & Resolution |
| :--- | :--- | :--- | :--- |
| **Battery Level** | Static `92%` in VerticalBar | `UPower` D-Bus | **Fixed**: Connected to `navigator.getBattery()`, dynamically synchronizing across `VerticalBar.tsx` and `QuickSettingsPanel.tsx`. |
| **Gemini Model** | Static text "Gemini 2.5 Flash" | `services/Ai.qml` | **Fixed**: Added model selection state supporting `Gemini 2.5 Flash`, `Gemini 3 Flash`, and `Mistral Medium 3` from `Ai.qml`. |
| **AI Temperature** | Static `1.0` | `Persistent.states.ai.temperature` | **Fixed**: Corrected to `0.5` matching end-4 default. |
| **Server Uptime** | Fallback `"Up 48m"` | `systemd` / `uptime` | **Connected**: Reads `selectedServer?.uptime` directly from Kairo session when connected. |
| **Workspaces State** | Static mock | `Hyprland.workspaces` | **Connected**: Driven directly by `useWindowManager().activeWorkspace` and window array. |
| **Running Windows & Dock** | Hardcoded icons | `ToplevelManager.toplevels` | **Connected**: Driven directly by `useWindowManager().windows` and remote surface sessions. |
| **Wallpapers** | Hardcoded | `Wallpapers.qml` | **Connected**: Driven by `localStorage` and `kairo:wallpaper-change` event system. |
| **Media Metadata** | "EastNewSound" / 3:01 / 4:24 | `MprisController.qml` (MPRIS) | **Class B Integrated**: Host MPRIS capability wired through `playerctl` and live WebSocket events. |
| **Notifications** | Static default cards | `Quickshell.Services.Notifications` | **Class A Integrated**: Real Linux desktop notification capability with ring-buffer and event dispatching. |
| **Bluetooth State** | Toggle state | BlueZ D-Bus | **Documented Gap (Class B)**: Remote VPS hosts run without physical Bluetooth adapters. Toggle functions cleanly in UI state. |
| **AI LLM State** | Simulated responses | Gemini / OpenAI REST APIs | **Documented Gap (Class D)**: Host lacks native LLM provider; `isAiAvailable()` cleanly reports unavailable. |

---

## 4. Architectural Invariants Verification

- [x] **Zero Frontend Polling**: Verified that no `setInterval` loops poll the Runtime for metrics; system metrics are retrieved reactively on connection.
- [x] **Zero Quickshell Dependency**: Native React 19 / TypeScript / Tailwind CSS conversion with no C++ or Qt libraries.
- [x] **Zero Hyprland Runtime Dependency**: Operates independently with Kairo's native window manager and protocol.
- [x] **RemoteSurfaceViewer Untouched**: `apps/kairo-web/src/components/apps/RemoteSurfaceViewer.tsx` was never modified; remote window streaming pipeline remains intact.
- [x] **Remote App Identity Preserved**: Remote applications (Chrome, Firefox, GIMP, etc.) retain their real names and icons.
- [x] **Compile & Build Clean**: `pnpm --filter @kairo/web typecheck` (0 errors) and `pnpm --filter @kairo/web build` passed cleanly with exit code 0.
