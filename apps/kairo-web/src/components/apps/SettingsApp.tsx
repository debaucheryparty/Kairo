"use client";

import { useState } from "react";
import {
  useTheme,
  M3_BASELINE_SEEDS,
  M3_SCHEME_VARIANTS,
  type M3SchemeVariant,
} from "@/src/lib/theme";
import { M3Switch, M3Button, M3IconButton, M3Card, M3Chip, M3Slider } from "@/src/components/m3";

type SettingsNavTab =
  | "quick"
  | "general"
  | "bar"
  | "background"
  | "interface"
  | "services"
  | "advanced"
  | "about";

const PRESET_WALLPAPERS = [
  { name: "Konachan Dark Abstract", url: "/hypr_wallpaper.png" },
  { name: "Nebula Violet", url: "https://images.unsplash.com/photo-1534447677768-be436bb09401?q=80&w=1920&auto=format&fit=crop" },
  { name: "Forest Emerald", url: "https://images.unsplash.com/photo-1511497584788-87676104235f?q=80&w=1920&auto=format&fit=crop" },
  { name: "Cyber Gradient", url: "https://images.unsplash.com/photo-1579546929518-9e396f3cc809?q=80&w=1920&auto=format&fit=crop" },
];

export function SettingsApp() {
  const {
    theme,
    scheme,
    sourceColor,
    contrast,
    tokens,
    setTheme,
    toggleTheme,
    setScheme,
    setSourceColor,
    setContrast,
  } = useTheme();
  const [showTokenInspector, setShowTokenInspector] = useState(false);
  const [currentTab, setCurrentTab] = useState<SettingsNavTab>("quick");
  const [navExpanded, setNavExpanded] = useState(true);

  // Settings values
  const [currentWallpaper, setCurrentWallpaper] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("kairo_wallpaper") || "/hypr_wallpaper.png";
    }
    return "/hypr_wallpaper.png";
  });
  const [transparency, setTransparency] = useState(true);
  const [barPosition, setBarPosition] = useState<"Top" | "Left" | "Bottom" | "Right">("Top");
  const [barStyle, setBarStyle] = useState<"Hug" | "Float" | "Rect">("Hug");

  // Clock widget settings
  const [clockEnabled, setClockEnabled] = useState(true);
  const [clockStyle, setClockStyle] = useState<"Digital" | "Cookie">("Digital");
  const [verticalClock, setVerticalClock] = useState(true);
  const [showClockDate, setShowClockDate] = useState(true);
  const [clockFontWeight, setClockFontWeight] = useState(700);

  const applyWallpaper = (url: string) => {
    setCurrentWallpaper(url);
    if (typeof window !== "undefined") {
      localStorage.setItem("kairo_wallpaper", url);
    }
    window.dispatchEvent(new Event("kairo:wallpaper-change"));
  };

  const navItems = [
    { id: "quick" as const, label: "Quick", icon: "instant_mix" },
    { id: "general" as const, label: "General", icon: "browse" },
    { id: "bar" as const, label: "Bar", icon: "toast" },
    { id: "background" as const, label: "Background", icon: "texture" },
    { id: "interface" as const, label: "Interface", icon: "bottom_app_bar" },
    { id: "services" as const, label: "Services", icon: "settings" },
    { id: "advanced" as const, label: "Advanced", icon: "construction" },
    { id: "about" as const, label: "About", icon: "info" },
  ];

  return (
    <div className="flex h-full w-full bg-[var(--md-sys-color-surface)] text-[var(--md-sys-color-on-surface)] select-none font-sans overflow-hidden">
      {/* Left Navigation Rail (Matching settings.qml NavigationRail) */}
      <nav
        aria-label="Settings Navigation Rail"
        className={`flex flex-col border-r border-[var(--md-sys-color-outline-variant)]/25 bg-[var(--md-sys-color-surface-container-low)] p-3 transition-all duration-200 ${
          navExpanded ? "w-44" : "w-16"
        }`}
      >
        {/* Rail Top Controls */}
        <div className="flex items-center justify-between mb-3 px-1">
          <M3IconButton
            icon="menu"
            title={navExpanded ? "Collapse Rail" : "Expand Rail"}
            onClick={() => setNavExpanded(!navExpanded)}
            variant="standard"
            className="size-8"
          />
        </div>

        {/* Floating Action Button: "Config file" (settings.qml FAB) */}
        <div className="mb-4">
          <M3Button
            variant="tonal"
            icon="edit"
            title="Open Configuration file"
            onClick={() => {
              window.dispatchEvent(new Event("kairo:open-config"));
            }}
            className={`w-full ${!navExpanded ? "!px-0 !justify-center" : ""}`}
          >
            {navExpanded && "Config file"}
          </M3Button>
        </div>

        {/* Navigation Items */}
        <div className="flex-1 flex flex-col gap-1 overflow-y-auto scrollbar-none">
          {navItems.map((item) => {
            const active = currentTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setCurrentTab(item.id)}
                className={`group relative overflow-hidden flex items-center gap-3 px-3 py-2.5 rounded-[14px] text-xs font-semibold transition-all m3-focus-ring ${
                  active
                    ? "bg-[var(--md-sys-color-primary,var(--m3-primary))] text-[var(--md-sys-color-on-primary,var(--m3-on-primary))] shadow-sm"
                    : "text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-on-surface)]/5"
                } ${!navExpanded ? "justify-center px-0" : ""}`}
              >
                <div className="m3-state-layer" />
                <span className="material-symbol text-[19px] shrink-0 relative z-[1]">{item.icon}</span>
                {navExpanded && <span className="truncate relative z-[1]">{item.label}</span>}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Main Content Surface */}
      <main className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* QUICK & GENERAL TAB: Wallpaper, Colors, & Bar */}
        {(currentTab === "quick" || currentTab === "general") && (
          <div className="space-y-6 max-w-4xl">
            {/* Section: Wallpaper & Colors (Matching QuickConfig.qml) */}
            <M3Card variant="filled" className="space-y-5">
              <div className="flex items-center gap-2.5">
                <span className="material-symbol text-[20px] text-[var(--m3-primary)]">format_paint</span>
                <h3 className="text-sm font-bold text-[var(--md-sys-color-on-surface)] tracking-tight">Wallpaper & Colors</h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
                {/* Wallpaper Preview Thumbnail */}
                <div className="relative aspect-video rounded-[16px] overflow-hidden border border-[var(--md-sys-color-outline-variant)]/30 shadow-md bg-black/40">
                  <img
                    src={currentWallpaper}
                    alt="Current Wallpaper"
                    className="size-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent flex items-end p-3">
                    <span className="text-[11px] text-white/90 font-medium truncate">
                      Active Background
                    </span>
                  </div>
                </div>

                {/* Random / Selection Actions */}
                <div className="flex flex-col gap-2.5">
                  <M3Button
                    variant="tonal"
                    icon="auto_awesome"
                    onClick={() => applyWallpaper("/hypr_wallpaper.png")}
                    className="w-full !justify-between"
                  >
                    Random: Konachan
                  </M3Button>

                  <M3Button
                    variant="tonal"
                    icon="image"
                    onClick={() => applyWallpaper(PRESET_WALLPAPERS[1].url)}
                    className="w-full !justify-between"
                  >
                    Random: osu! seasonal
                  </M3Button>

                  <div className="flex gap-2 mt-1">
                    {/* Light / Dark Mode Buttons (QuickConfig.qml SmallLightDarkPreferenceButton) */}
                    <button
                      type="button"
                      onClick={() => setTheme("light")}
                      className={`group relative overflow-hidden flex-1 py-3 rounded-[14px] flex flex-col items-center justify-center gap-1 transition-all border m3-focus-ring ${
                        theme === "light"
                          ? "bg-[var(--md-sys-color-primary,var(--m3-primary))] text-[var(--md-sys-color-on-primary,var(--m3-on-primary))] border-transparent shadow-sm font-bold"
                          : "bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] border-[var(--md-sys-color-outline-variant)]/30"
                      }`}
                    >
                      <div className="m3-state-layer" />
                      <span className="material-symbol text-[22px] relative z-[1]">light_mode</span>
                      <span className="text-[11px] relative z-[1]">Light</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setTheme("dark")}
                      className={`group relative overflow-hidden flex-1 py-3 rounded-[14px] flex flex-col items-center justify-center gap-1 transition-all border m3-focus-ring ${
                        theme === "dark"
                          ? "bg-[var(--md-sys-color-primary,var(--m3-primary))] text-[var(--md-sys-color-on-primary,var(--m3-on-primary))] border-transparent shadow-sm font-bold"
                          : "bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] border-[var(--md-sys-color-outline-variant)]/30"
                      }`}
                    >
                      <div className="m3-state-layer" />
                      <span className="material-symbol text-[22px] relative z-[1]">dark_mode</span>
                      <span className="text-[11px] relative z-[1]">Dark</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Baseline & User-Generated Color Sources */}
              <div className="pt-2 border-t border-[var(--md-sys-color-outline-variant)]/20">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--md-sys-color-on-surface-variant)]/80 block">
                    Source Color (Baseline & Seeds)
                  </span>
                  <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-[var(--md-sys-color-primary)] hover:underline">
                    <span>Custom</span>
                    <input
                      type="color"
                      value={sourceColor}
                      onChange={(e) => setSourceColor(e.target.value)}
                      className="size-5 rounded-full border-0 cursor-pointer p-0 bg-transparent"
                    />
                  </label>
                </div>
                <div className="flex flex-wrap items-center gap-2.5">
                  {M3_BASELINE_SEEDS.map((seed) => {
                    const isSelected = sourceColor.toLowerCase() === seed.hex.toLowerCase();
                    return (
                      <button
                        key={seed.id}
                        type="button"
                        onClick={() => setSourceColor(seed.hex)}
                        title={seed.name}
                        className={`size-8 rounded-full transition-all flex items-center justify-center relative m3-state-layer ${
                          isSelected
                            ? "ring-2 ring-offset-2 ring-offset-[var(--md-sys-color-surface-container)] ring-[var(--md-sys-color-primary)] scale-110"
                            : "hover:scale-105 opacity-85 hover:opacity-100"
                        }`}
                        style={{ backgroundColor: seed.hex }}
                      >
                        {isSelected && (
                          <span className="material-symbol text-white text-[16px] drop-shadow-sm font-bold">
                            check
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Dynamic Scheme Variant (9 Schemes) */}
              <div className="pt-2 border-t border-[var(--md-sys-color-outline-variant)]/20">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--md-sys-color-on-surface-variant)]/80 block mb-2.5">
                  Dynamic Scheme Variant
                </span>
                <div className="flex flex-wrap gap-2">
                  {M3_SCHEME_VARIANTS.map((pal) => (
                    <M3Chip
                      key={pal}
                      selected={scheme === pal}
                      onClick={() => setScheme(pal)}
                    >
                      {pal}
                    </M3Chip>
                  ))}
                </div>
              </div>

              {/* Contrast Level */}
              <div className="flex items-center justify-between pt-2 border-t border-[var(--md-sys-color-outline-variant)]/20">
                <div className="flex items-center gap-2">
                  <span className="material-symbol text-[18px] text-[var(--md-sys-color-on-surface-variant)]">contrast</span>
                  <span className="text-xs font-medium text-[var(--md-sys-color-on-surface)]">Contrast Level</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <M3Chip
                    selected={contrast === "normal"}
                    onClick={() => setContrast("normal")}
                  >
                    Default
                  </M3Chip>
                  <M3Chip
                    selected={contrast === "high"}
                    onClick={() => setContrast("high")}
                  >
                    High Contrast
                  </M3Chip>
                </div>
              </div>

              {/* Transparency Switch */}
              <div className="flex items-center justify-between pt-2 border-t border-[var(--md-sys-color-outline-variant)]/20">
                <div className="flex items-center gap-2">
                  <span className="material-symbol text-[18px] text-[var(--md-sys-color-on-surface-variant)]">opacity</span>
                  <span className="text-xs font-medium text-[var(--md-sys-color-on-surface)]">Transparency</span>
                </div>
                <M3Switch
                  checked={transparency}
                  onChange={setTransparency}
                  aria-label="Toggle Transparency"
                />
              </div>

              {/* M3 Baseline Token Swatches Inspector (Collapsible) */}
              <div className="pt-2 border-t border-[var(--md-sys-color-outline-variant)]/20">
                <button
                  type="button"
                  onClick={() => setShowTokenInspector(!showTokenInspector)}
                  className="flex items-center justify-between w-full py-1.5 text-left text-[11px] font-bold uppercase tracking-wider text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] transition-colors"
                >
                  <span className="flex items-center gap-1.5">
                    <span className="material-symbol text-[16px] text-[var(--md-sys-color-primary)]">palette</span>
                    Baseline Token Swatches Inspector
                  </span>
                  <span className="material-symbol text-[16px] transition-transform duration-200" style={{ transform: showTokenInspector ? "rotate(180deg)" : "rotate(0deg)" }}>
                    expand_more
                  </span>
                </button>

                {showTokenInspector && (
                  <div className="mt-3 space-y-3.5 max-h-[380px] overflow-y-auto pr-1 text-xs">
                    {/* Primary Palette */}
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--md-sys-color-on-surface-variant)]/70 block mb-1.5">Primary</span>
                      <div className="grid grid-cols-2 gap-1.5">
                        <div className="p-2 rounded-xl flex flex-col justify-between h-14" style={{ backgroundColor: tokens.primary, color: tokens.onPrimary }}>
                          <span className="font-mono text-[10px] opacity-80">{tokens.primary}</span>
                          <span className="font-semibold text-[11px]">Primary</span>
                        </div>
                        <div className="p-2 rounded-xl flex flex-col justify-between h-14" style={{ backgroundColor: tokens.primaryContainer, color: tokens.onPrimaryContainer }}>
                          <span className="font-mono text-[10px] opacity-80">{tokens.primaryContainer}</span>
                          <span className="font-semibold text-[11px]">Primary Container</span>
                        </div>
                        <div className="p-2 rounded-xl flex flex-col justify-between h-14" style={{ backgroundColor: tokens.primaryFixed, color: tokens.onPrimaryFixed }}>
                          <span className="font-mono text-[10px] opacity-80">{tokens.primaryFixed}</span>
                          <span className="font-semibold text-[11px]">Primary Fixed</span>
                        </div>
                        <div className="p-2 rounded-xl flex flex-col justify-between h-14" style={{ backgroundColor: tokens.primaryFixedDim, color: tokens.onPrimaryFixedVariant }}>
                          <span className="font-mono text-[10px] opacity-80">{tokens.primaryFixedDim}</span>
                          <span className="font-semibold text-[11px]">Primary Fixed Dim</span>
                        </div>
                      </div>
                    </div>

                    {/* Secondary Palette */}
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--md-sys-color-on-surface-variant)]/70 block mb-1.5">Secondary</span>
                      <div className="grid grid-cols-2 gap-1.5">
                        <div className="p-2 rounded-xl flex flex-col justify-between h-14" style={{ backgroundColor: tokens.secondary, color: tokens.onSecondary }}>
                          <span className="font-mono text-[10px] opacity-80">{tokens.secondary}</span>
                          <span className="font-semibold text-[11px]">Secondary</span>
                        </div>
                        <div className="p-2 rounded-xl flex flex-col justify-between h-14" style={{ backgroundColor: tokens.secondaryContainer, color: tokens.onSecondaryContainer }}>
                          <span className="font-mono text-[10px] opacity-80">{tokens.secondaryContainer}</span>
                          <span className="font-semibold text-[11px]">Secondary Container</span>
                        </div>
                        <div className="p-2 rounded-xl flex flex-col justify-between h-14" style={{ backgroundColor: tokens.secondaryFixed, color: tokens.onSecondaryFixed }}>
                          <span className="font-mono text-[10px] opacity-80">{tokens.secondaryFixed}</span>
                          <span className="font-semibold text-[11px]">Secondary Fixed</span>
                        </div>
                        <div className="p-2 rounded-xl flex flex-col justify-between h-14" style={{ backgroundColor: tokens.secondaryFixedDim, color: tokens.onSecondaryFixedVariant }}>
                          <span className="font-mono text-[10px] opacity-80">{tokens.secondaryFixedDim}</span>
                          <span className="font-semibold text-[11px]">Secondary Fixed Dim</span>
                        </div>
                      </div>
                    </div>

                    {/* Tertiary Palette */}
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--md-sys-color-on-surface-variant)]/70 block mb-1.5">Tertiary</span>
                      <div className="grid grid-cols-2 gap-1.5">
                        <div className="p-2 rounded-xl flex flex-col justify-between h-14" style={{ backgroundColor: tokens.tertiary, color: tokens.onTertiary }}>
                          <span className="font-mono text-[10px] opacity-80">{tokens.tertiary}</span>
                          <span className="font-semibold text-[11px]">Tertiary</span>
                        </div>
                        <div className="p-2 rounded-xl flex flex-col justify-between h-14" style={{ backgroundColor: tokens.tertiaryContainer, color: tokens.onTertiaryContainer }}>
                          <span className="font-mono text-[10px] opacity-80">{tokens.tertiaryContainer}</span>
                          <span className="font-semibold text-[11px]">Tertiary Container</span>
                        </div>
                        <div className="p-2 rounded-xl flex flex-col justify-between h-14" style={{ backgroundColor: tokens.tertiaryFixed, color: tokens.onTertiaryFixed }}>
                          <span className="font-mono text-[10px] opacity-80">{tokens.tertiaryFixed}</span>
                          <span className="font-semibold text-[11px]">Tertiary Fixed</span>
                        </div>
                        <div className="p-2 rounded-xl flex flex-col justify-between h-14" style={{ backgroundColor: tokens.tertiaryFixedDim, color: tokens.onTertiaryFixedVariant }}>
                          <span className="font-mono text-[10px] opacity-80">{tokens.tertiaryFixedDim}</span>
                          <span className="font-semibold text-[11px]">Tertiary Fixed Dim</span>
                        </div>
                      </div>
                    </div>

                    {/* Error & Surface */}
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--md-sys-color-on-surface-variant)]/70 block mb-1.5">Error & Surfaces</span>
                      <div className="grid grid-cols-2 gap-1.5">
                        <div className="p-2 rounded-xl flex flex-col justify-between h-14" style={{ backgroundColor: tokens.error, color: tokens.onError }}>
                          <span className="font-mono text-[10px] opacity-80">{tokens.error}</span>
                          <span className="font-semibold text-[11px]">Error</span>
                        </div>
                        <div className="p-2 rounded-xl flex flex-col justify-between h-14" style={{ backgroundColor: tokens.errorContainer, color: tokens.onErrorContainer }}>
                          <span className="font-mono text-[10px] opacity-80">{tokens.errorContainer}</span>
                          <span className="font-semibold text-[11px]">Error Container</span>
                        </div>
                        <div className="p-2 rounded-xl flex flex-col justify-between h-14 border border-[var(--md-sys-color-outline-variant)]/40" style={{ backgroundColor: tokens.surface, color: tokens.onSurface }}>
                          <span className="font-mono text-[10px] opacity-80">{tokens.surface}</span>
                          <span className="font-semibold text-[11px]">Surface</span>
                        </div>
                        <div className="p-2 rounded-xl flex flex-col justify-between h-14 border border-[var(--md-sys-color-outline-variant)]/40" style={{ backgroundColor: tokens.surfaceContainer, color: tokens.onSurface }}>
                          <span className="font-mono text-[10px] opacity-80">{tokens.surfaceContainer}</span>
                          <span className="font-semibold text-[11px]">Surface Container</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </M3Card>

            {/* Section: Bar & Screen (BarConfig.qml) */}
            <M3Card variant="filled" className="space-y-4">
              <div className="flex items-center gap-2.5">
                <span className="material-symbol text-[20px] text-[var(--m3-primary)]">dock_to_bottom</span>
                <h3 className="text-sm font-bold text-[var(--md-sys-color-on-surface)] tracking-tight">Bar & Screen</h3>
              </div>

              {/* Bar Position */}
              <div className="space-y-2">
                <span className="text-[11px] font-medium text-[var(--md-sys-color-on-surface-variant)] block">Bar Position</span>
                <div className="flex items-center gap-2">
                  {(["Top", "Left", "Bottom", "Right"] as const).map((pos) => (
                    <M3Chip
                      key={pos}
                      selected={barPosition === pos}
                      onClick={() => {
                        setBarPosition(pos);
                        window.dispatchEvent(new CustomEvent("kairo:set-bar-position", { detail: pos }));
                      }}
                      icon={
                        pos === "Top"
                          ? "arrow_upward"
                          : pos === "Left"
                          ? "arrow_back"
                          : pos === "Bottom"
                          ? "arrow_downward"
                          : "arrow_forward"
                      }
                    >
                      {pos}
                    </M3Chip>
                  ))}
                </div>
              </div>

              {/* Bar Style */}
              <div className="space-y-2 pt-2 border-t border-[var(--md-sys-color-outline-variant)]/20">
                <span className="text-[11px] font-medium text-[var(--md-sys-color-on-surface-variant)] block">Bar Style</span>
                <div className="flex items-center gap-2">
                  {(["Hug", "Float", "Rect"] as const).map((style) => (
                    <M3Chip
                      key={style}
                      selected={barStyle === style}
                      onClick={() => setBarStyle(style)}
                    >
                      {style}
                    </M3Chip>
                  ))}
                </div>
              </div>
            </M3Card>
          </div>
        )}

        {/* BACKGROUND TAB: Clock & Parallax (BackgroundConfig.qml) */}
        {currentTab === "background" && (
          <div className="space-y-6 max-w-4xl">
            {/* Widget: Clock Section */}
            <M3Card variant="filled" className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="material-symbol text-[20px] text-[var(--m3-primary)]">schedule</span>
                  <h3 className="text-sm font-bold text-[var(--md-sys-color-on-surface)] tracking-tight">Widget: Clock</h3>
                </div>

                {/* Enable toggle */}
                <div className="flex items-center gap-3">
                  <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">Enable</span>
                  <M3Switch
                    checked={clockEnabled}
                    onChange={setClockEnabled}
                    aria-label="Enable Clock"
                  />
                </div>
              </div>

              {/* Clock Style Buttons */}
              <div className="space-y-2 pt-2 border-t border-[var(--md-sys-color-outline-variant)]/20">
                <span className="text-[11px] font-medium text-[var(--md-sys-color-on-surface-variant)] block">Clock Style</span>
                <div className="flex items-center gap-2">
                  {(["Digital", "Cookie"] as const).map((st) => (
                    <M3Chip
                      key={st}
                      selected={clockStyle === st}
                      onClick={() => setClockStyle(st)}
                    >
                      {st}
                    </M3Chip>
                  ))}
                </div>
              </div>

              {/* Digital Clock Settings */}
              <div className="space-y-3 pt-2 border-t border-[var(--md-sys-color-outline-variant)]/20">
                <span className="text-[11px] font-medium text-[var(--md-sys-color-on-surface-variant)] block">Digital Clock Options</span>

                <div className="flex items-center justify-between">
                  <span className="text-xs text-[var(--md-sys-color-on-surface)]">Vertical Layout (2-Line)</span>
                  <M3Switch
                    checked={verticalClock}
                    onChange={setVerticalClock}
                    aria-label="Vertical Layout"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs text-[var(--md-sys-color-on-surface)]">Show Date Line</span>
                  <M3Switch
                    checked={showClockDate}
                    onChange={setShowClockDate}
                    aria-label="Show Date Line"
                  />
                </div>

                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between text-xs text-[var(--md-sys-color-on-surface-variant)]">
                    <span>Font Weight</span>
                    <span className="font-mono text-[var(--md-sys-color-primary,var(--m3-primary))] font-semibold">{clockFontWeight}</span>
                  </div>
                  <M3Slider
                    value={clockFontWeight}
                    min={300}
                    max={900}
                    step={100}
                    onChange={setClockFontWeight}
                    labeled
                    aria-label="Clock Font Weight"
                  />
                </div>
              </div>
            </M3Card>
          </div>
        )}

        {/* ABOUT TAB */}
        {currentTab === "about" && (
          <div className="space-y-6 max-w-4xl">
            <M3Card variant="elevated" className="space-y-4 !p-6">
              <div className="flex items-center gap-3">
                <div className="size-12 rounded-[16px] bg-[var(--m3-primary)]/20 border border-[var(--m3-primary)]/40 flex items-center justify-center text-[var(--m3-primary)]">
                  <span className="material-symbol text-[28px]">desktop_windows</span>
                </div>
                <div>
                  <h3 className="text-base font-bold text-[var(--md-sys-color-on-surface)] tracking-tight">Kairo Shell</h3>
                  <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                    Ported from end-4/dots-hyprland (Illogical Impulse Quickshell)
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-3 border-t border-[var(--md-sys-color-outline-variant)]/20 text-xs">
                <div>
                  <span className="text-[var(--md-sys-color-on-surface-variant)]/80 block text-[11px]">Design System</span>
                  <span className="font-semibold text-[var(--md-sys-color-on-surface)]">Material 3 Expressive</span>
                </div>
                <div>
                  <span className="text-[var(--md-sys-color-on-surface-variant)]/80 block text-[11px]">Typography</span>
                  <span className="font-semibold text-[var(--md-sys-color-on-surface)]">Plus Jakarta Sans & Readex Pro</span>
                </div>
                <div>
                  <span className="text-[var(--md-sys-color-on-surface-variant)]/80 block text-[11px]">Icons</span>
                  <span className="font-semibold text-[var(--m3-primary)]">Google Material Symbols Rounded</span>
                </div>
                <div>
                  <span className="text-[var(--md-sys-color-on-surface-variant)]/80 block text-[11px]">Architecture</span>
                  <span className="font-semibold text-emerald-400">React 19 + Kairo Runtime</span>
                </div>
              </div>
            </M3Card>
          </div>
        )}
      </main>
    </div>
  );
}

