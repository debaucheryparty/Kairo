"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { ThemeToggle } from "@/src/components/desktop/ThemeToggle";
import { BrandMark } from "@/src/components/brand/BrandMark";
import { Workspaces } from "@/src/components/desktop/Workspaces";
import { TopBarResources } from "@/src/components/desktop/TopBarResources";
import {
  HyprSparkIcon,
  HyprVolumeIcon,
  HyprWifiIcon,
  HyprPowerIcon,
  HyprSettingsIcon,
  HyprSearchIcon,
} from "@/src/components/desktop/HyprIcons";
import { useServer } from "@/src/lib/api/server-context";
import { useSelectedServer, useSession } from "@/src/lib/session";
import { useWindowManager } from "@/src/components/window/window-context";
import type { SystemMetrics } from "@kairo/runtime";

function statusLabel(status: string | undefined, loading: boolean) {
  if (loading && !status) return "Connecting";
  switch (status) {
    case "online":
      return "Online";
    case "connecting":
      return "Connecting";
    case "authentication_failed":
      return "Auth failed";
    case "error":
      return "Error";
    default:
      return "Offline";
  }
}

function formatClockDate(date: Date) {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const day = days[date.getDay()];
  const month = months[date.getMonth()];
  const dayNum = date.getDate();
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  return `${hours}:${minutes} • ${day}, ${month} ${dayNum}`;
}

export function TopBar() {
  const selected = useSelectedServer();
  const { servers, switchServer, backToServers, logOut, runtimeClient, runtimeConnected } = useSession();
  const { server, loading, error } = useServer();
  const {
    windows,
    focusedId,
    activeWorkspace,
    setWorkspace,
    openWindow,
    focusWindow,
  } = useWindowManager();

  const [dateStr, setDateStr] = useState(() => formatClockDate(new Date()));
  const [serverMenuOpen, setServerMenuOpen] = useState(false);
  const [liveMetrics, setLiveMetrics] = useState<SystemMetrics | null>(null);
  const barRef = useRef<HTMLElement>(null);
  const serverMenuRef = useRef<HTMLDivElement>(null);

  // Fetch system metrics once on connect without recurring interval polling
  useEffect(() => {
    if (!runtimeClient?.getSession()) {
      setLiveMetrics(null);
      return;
    }

    let active = true;
    runtimeClient
      .getMetrics()
      .then((metrics) => {
        if (active) setLiveMetrics(metrics);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [runtimeClient, runtimeConnected]);

  const isLive = Boolean(runtimeConnected && runtimeClient?.getSession());
  const online = isLive || server?.status === "online";
  const ready = Boolean(server || selected || isLive);
  const name = selected?.name || server?.name || "Server";
  const otherServers = servers.filter((item) => item.id !== selected?.id);

  const cpuPercent = isLive && liveMetrics ? Math.round(liveMetrics.cpuUsagePercent) : undefined;
  const ramPercent =
    isLive && liveMetrics && liveMetrics.memoryTotalBytes > 0
      ? Math.round((liveMetrics.memoryUsedBytes / liveMetrics.memoryTotalBytes) * 100)
      : undefined;

  useEffect(() => {
    const tick = () => setDateStr(formatClockDate(new Date()));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  // Close menus on outside click / Esc
  useEffect(() => {
    function onPointer(event: PointerEvent) {
      if (!serverMenuRef.current?.contains(event.target as Node)) {
        setServerMenuOpen(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setServerMenuOpen(false);
      }
    }
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  // Which workspaces contain open windows
  const occupiedWorkspaces = useMemo(() => {
    const set = new Set<number>();
    for (const win of windows) {
      if (!win.minimized) {
        set.add(win.workspaceId ?? 1);
      }
    }
    return set;
  }, [windows]);

  // Focused window info for active window chip
  const focusedWindow = useMemo(() => {
    return windows.find((w) => w.id === focusedId);
  }, [windows, focusedId]);
  return (
    <header
      ref={barRef}
      className="fixed top-2.5 inset-x-3 pointer-events-none z-50 flex items-center justify-between gap-3 text-[13px] select-none font-medium"
      aria-label="Kairo Top Bar"
    >
      {/* ─── LEFT ISLAND: App Launcher + Active Window ─── */}
      <div
        className="pointer-events-auto flex items-center h-10 gap-2 px-2.5 rounded-full m3-elevation-2 bg-[var(--m3-surface-container-low)]/90 border border-[var(--m3-outline-variant)]/40 backdrop-blur-2xl text-[var(--m3-on-surface)] transition-all duration-200"
      >
        {/* Spotlight App Launcher Button */}
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event("kairo:toggle-spotlight"))}
          className="relative flex items-center justify-center size-8 rounded-full overflow-hidden bg-[var(--m3-primary-container)] text-[var(--m3-on-primary-container)] m3-state-layer transition-transform active:scale-95 shadow-sm"
          title="App Launcher (Super / Ctrl+Space)"
          aria-label="App Launcher"
        >
          <HyprSearchIcon className="size-4" />
        </button>

        <div className="h-4 w-px bg-[var(--m3-outline-variant)]/50 mx-0.5" />

        {/* Active Window Chip */}
        <div
          onClick={() => {
            if (focusedWindow) focusWindow(focusedWindow.id);
          }}
          className="relative flex items-center gap-2 h-7 px-3 rounded-full overflow-hidden bg-[var(--m3-surface-container)] hover:bg-[var(--m3-surface-container-high)] border border-[var(--m3-outline-variant)]/30 text-[var(--m3-on-surface)] max-w-[200px] m3-state-layer transition-colors cursor-pointer"
          title={focusedWindow ? focusedWindow.title : "Kairo Desktop"}
        >
          <BrandMark size={14} className="shrink-0 opacity-80" />
          <span className="truncate m3-label-medium font-google-sans tracking-tight">
            {focusedWindow ? focusedWindow.title : "Kairo"}
          </span>
        </div>

        
      </div>

      {/* ─── CENTER UNIFIED ISLAND: Resources + Workspaces + Clock ─── */}
      <div className="pointer-events-auto flex items-center h-10 gap-2 px-3 rounded-full m3-elevation-2 bg-[var(--m3-surface-container-low)]/90 border border-[var(--m3-outline-variant)]/40 backdrop-blur-2xl text-[var(--m3-on-surface)] transition-all duration-200">
        {/* Hardware Telemetry Chips (Resources.qml → TopBarResources.tsx) */}
        {(typeof cpuPercent === "number" || typeof ramPercent === "number") && (
          <>
            <TopBarResources cpuPercent={cpuPercent} ramPercent={ramPercent} />
            <div className="h-4 w-px bg-[var(--m3-outline-variant)]/50" />
          </>
        )}

        {/* Workspaces Pill (Workspaces.qml → Workspaces.tsx) */}
        <Workspaces
          activeWorkspace={activeWorkspace}
          occupiedWorkspaces={occupiedWorkspaces}
          setWorkspace={setWorkspace}
        />

        {/* Center Clock & Date */}
        <div className="relative px-2 py-1 text-[var(--m3-on-surface)] m3-title-small font-roboto tracking-tight">
          {dateStr}
        </div>
      </div>

      {/* ─── RIGHT ISLAND: Server Dropdown + Settings + Theme + Disconnect ─── */}
      <div
        className="pointer-events-auto flex items-center h-10 gap-2 px-2.5 rounded-full m3-elevation-2 bg-[var(--m3-surface-container-low)]/90 border border-[var(--m3-outline-variant)]/40 backdrop-blur-2xl text-[var(--m3-on-surface)] transition-all duration-200"
      >
        {/* Status Indicators */}
        <div className="flex items-center gap-1.5 text-[var(--m3-on-surface-variant)] px-1">
          <HyprVolumeIcon className="size-3.5" />
          <HyprWifiIcon className="size-3.5" />
        </div>

        <div className="h-4 w-px bg-[var(--m3-outline-variant)]/50" />

        {/* Server Status Dropdown */}
        <div className="relative flex items-center" ref={serverMenuRef} title={error || undefined}>
          <button
            type="button"
            onClick={() => setServerMenuOpen((prev) => !prev)}
            className="flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-[var(--m3-surface-container-high)] hover:bg-[var(--m3-surface-container-highest)] border border-[var(--m3-outline-variant)]/30 text-[var(--m3-on-surface)] transition-colors outline-none"
            aria-haspopup="menu"
            aria-expanded={serverMenuOpen}
          >
            <span
              className={`size-1.5 rounded-full ${
                online
                  ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]"
                  : loading && !ready
                    ? "bg-amber-300"
                    : "bg-[var(--m3-error)]"
              }`}
            />
            <span className="max-w-[110px] truncate m3-label-small font-roboto">{name}</span>
            <span className="material-symbol text-[14px] text-[var(--m3-on-surface-variant)]">expand_more</span>
          </button>

          {serverMenuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-[calc(100%+8px)] z-[100] w-[240px] overflow-hidden rounded-2xl border border-[var(--m3-outline-variant)]/50 p-2 text-left m3-elevation-5 backdrop-blur-3xl select-none bg-[var(--m3-surface-container)] text-[var(--m3-on-surface)] animate-in fade-in zoom-in-95 duration-150"
            >
              <div className="px-3 py-1.5 m3-label-small font-bold uppercase tracking-wider text-[var(--m3-on-surface-variant)]">
                Connected VPS
              </div>
              <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-[var(--m3-surface-container-high)]/60">
                <span className="material-symbol text-[18px] text-[var(--m3-primary)]">dns</span>
                <span className="truncate m3-label-medium font-roboto">{name}</span>
                <span className="ml-auto m3-label-small text-emerald-400 font-bold">
                  {online ? "Active" : statusLabel(server?.status || selected?.status, loading)}
                </span>
              </div>

              {otherServers.length > 0 && (
                <>
                  <div className="my-1.5 h-px bg-[var(--m3-outline-variant)]/40" />
                  <div className="px-3 py-1.5 m3-label-small font-bold uppercase tracking-wider text-[var(--m3-on-surface-variant)]">
                    Switch VPS
                  </div>
                  {otherServers.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setServerMenuOpen(false);
                        switchServer(item);
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 m3-label-medium rounded-xl hover:bg-[var(--m3-primary-container)] hover:text-[var(--m3-on-primary-container)] transition-colors"
                    >
                      <span className="material-symbol text-[16px] text-[var(--m3-on-surface-variant)]">swap_horiz</span>
                      <span className="truncate">{item.name}</span>
                    </button>
                  ))}
                </>
              )}

              <div className="my-1.5 h-px bg-[var(--m3-outline-variant)]/40" />
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setServerMenuOpen(false);
                  backToServers();
                }}
                className="flex w-full items-center gap-2 px-3 py-2 m3-label-medium rounded-xl hover:bg-[var(--m3-surface-container-high)] text-[var(--m3-on-surface)] transition-colors"
              >
                <span className="material-symbol text-[16px] text-[var(--m3-on-surface-variant)]">dns</span>
                <span>All VPS Instances</span>
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setServerMenuOpen(false);
                  logOut();
                }}
                className="flex w-full items-center gap-2 px-3 py-2 m3-label-medium rounded-xl text-[var(--m3-error)] hover:bg-[var(--m3-error-container)] hover:text-[var(--m3-on-error-container)] transition-colors"
              >
                <span className="material-symbol text-[16px]">logout</span>
                <span>Disconnect</span>
              </button>
            </div>
          )}
        </div>

        {/* Settings Button */}
        <button
          type="button"
          onClick={() => openWindow("settings")}
          className="relative flex items-center justify-center size-8 rounded-full overflow-hidden bg-[var(--m3-surface-container-high)] text-[var(--m3-on-surface-variant)] hover:text-[var(--m3-on-surface)] m3-state-layer transition-colors active:scale-95 shadow-sm"
          title="Settings (Appearance & System)"
          aria-label="Settings"
        >
          <HyprSettingsIcon className="size-4" />
        </button>

        {/* Theme Toggle */}
        <ThemeToggle />

        {/* Power / Leave Server Button */}
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event("kairo:leave-server"))}
          className="relative flex items-center justify-center size-8 rounded-full overflow-hidden bg-[var(--m3-error-container)] text-[var(--m3-on-error-container)] hover:bg-[var(--m3-error)] hover:text-[var(--m3-on-error)] m3-state-layer transition-all active:scale-95 shadow-sm"
          title="Leave Server / Disconnect"
          aria-label="Leave Server"
        >
          <HyprPowerIcon className="size-4" />
        </button>
      </div>
    </header>
  );
}
