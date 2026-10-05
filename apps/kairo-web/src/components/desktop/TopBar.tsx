"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeftRight, ChevronDown, LogOut, Search, Server, SlidersHorizontal, Wifi } from "lucide-react";
import { ThemeToggle } from "@/src/components/desktop/ThemeToggle";
import { BrandMark } from "@/src/components/brand/BrandMark";
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

function metric(value: number | undefined, loading: boolean, ready: boolean) {
  if (loading && !ready) return "—";
  if (!ready || typeof value !== "number") return "—";
  return `${Math.round(value)}%`;
}

function formatMacDate(date: Date) {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const day = days[date.getDay()];
  const month = months[date.getMonth()];
  const dayNum = date.getDate();
  const timeStr = date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `${day} ${month} ${dayNum}  ${timeStr}`;
}

export function TopBar() {
  const selected = useSelectedServer();
  const { servers, switchServer, backToServers, logOut, runtimeClient, runtimeConnected } = useSession();
  const { server, loading, error } = useServer();
  const {
    openWindow,
    tileWindows,
    snapWindow,
    minimizeWindow,
    maximizeWindow,
    restoreWindow,
    closeWindow,
    focusedId,
  } = useWindowManager();

  const [dateStr, setDateStr] = useState("");
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [serverMenuOpen, setServerMenuOpen] = useState(false);
  const [liveMetrics, setLiveMetrics] = useState<SystemMetrics | null>(null);
  const barRef = useRef<HTMLElement>(null);
  const serverMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!runtimeClient?.getSession()) {
      setLiveMetrics(null);
      return;
    }

    let active = true;
    const fetchMetrics = async () => {
      try {
        const metrics = await runtimeClient.getMetrics();
        if (active) setLiveMetrics(metrics);
      } catch {}
    };

    void fetchMetrics();
    const interval = setInterval(() => {
      void fetchMetrics();
    }, 2000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [runtimeClient]);

  const isLive = Boolean(runtimeConnected && runtimeClient?.getSession());
  const online = isLive || server?.status === "online";
  const ready = Boolean(server || selected || isLive);
  const name = selected?.name || server?.name || "Server";
  const otherServers = servers.filter((item) => item.id !== selected?.id);

  const cpuPercent = isLive && liveMetrics
    ? Math.round(liveMetrics.cpuUsagePercent)
    : undefined;

  const ramPercent = isLive && liveMetrics && liveMetrics.memoryTotalBytes > 0
    ? Math.round((liveMetrics.memoryUsedBytes / liveMetrics.memoryTotalBytes) * 100)
    : undefined;

  useEffect(() => {
    const tick = () => setDateStr(formatMacDate(new Date()));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    function onPointer(event: PointerEvent) {
      if (!barRef.current?.contains(event.target as Node)) {
        setActiveMenu(null);
        setServerMenuOpen(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setActiveMenu(null);
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

  useEffect(() => {
    function onToggle(event: Event) {
      event.preventDefault();
      setServerMenuOpen((open) => !open);
    }
    window.addEventListener("kairo:toggle-server-menu", onToggle);
    return () => window.removeEventListener("kairo:toggle-server-menu", onToggle);
  }, []);

  const handleMenuClick = (menu: string) => {
    setActiveMenu((prev) => (prev === menu ? null : menu));
  };

  const handleMenuHover = (menu: string) => {
    if (activeMenu !== null) {
      setActiveMenu(menu);
    }
  };

  const closeMenus = () => {
    setActiveMenu(null);
    setServerMenuOpen(false);
  };

  return (
    <header
      ref={barRef}
      className="relative z-50 flex h-8 items-center justify-between gap-2 px-3 text-[13px] font-normal tracking-tight backdrop-blur-2xl border-b border-black/[0.06] dark:border-white/[0.08] select-none shadow-[0_1px_3px_rgba(0,0,0,0.1)]"
      style={{ background: "var(--topbar-bg)", color: "var(--topbar-fg)" }}
    >
      <div className="flex items-center gap-0.5">
        <div className="relative">
          <button
            type="button"
            onClick={() => handleMenuClick("apple")}
            onMouseEnter={() => handleMenuHover("apple")}
            className={`flex items-center rounded-md px-2 py-0.5 transition-colors outline-none ${
              activeMenu === "apple" ? "bg-[var(--topbar-active)]" : "hover:bg-[var(--topbar-hover)]"
            }`}
            aria-label="System Menu"
          >
            <BrandMark size={15} />
          </button>

          {activeMenu === "apple" && (
            <div
              className="absolute left-0 top-[calc(100%+4px)] z-[100] min-w-56 overflow-hidden rounded-[16px] border py-1.5 shadow-[0_20px_50px_rgba(0,0,0,0.3)] backdrop-blur-3xl animate-menu-in select-none"
              style={{ background: "var(--menu-bg)", borderColor: "var(--menu-border)", color: "var(--menu-fg)" }}
            >
              <MenuItem
                label="About Kairo"
                onSelect={() => {
                  openWindow("about");
                  closeMenus();
                }}
              />
              <div className="my-1.5 h-px bg-black/[0.08] dark:bg-white/[0.08]" />
              <MenuItem
                label="Settings..."
                shortcut="⌘,"
                onSelect={() => {
                  openWindow("settings");
                  closeMenus();
                }}
              />
              <MenuItem
                label="Switch Server..."
                shortcut="⌘K"
                onSelect={() => {
                  closeMenus();
                  window.dispatchEvent(new Event("kairo:toggle-server-menu"));
                }}
              />
              <div className="my-1.5 h-px bg-black/[0.08] dark:bg-white/[0.08]" />
              <MenuItem
                label="Leave Server"
                shortcut="⌘Q"
                onSelect={() => {
                  closeMenus();
                  logOut();
                }}
              />
            </div>
          )}
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => handleMenuClick("kairo")}
            onMouseEnter={() => handleMenuHover("kairo")}
            className={`rounded-md px-2.5 py-0.5 font-semibold text-[13px] transition-colors outline-none ${
              activeMenu === "kairo" ? "bg-[var(--topbar-active)]" : "hover:bg-[var(--topbar-hover)]"
            }`}
          >
            Kairo
          </button>

          {activeMenu === "kairo" && (
            <div
              className="absolute left-0 top-[calc(100%+4px)] z-[100] min-w-56 overflow-hidden rounded-[16px] border py-1.5 shadow-[0_20px_50px_rgba(0,0,0,0.3)] backdrop-blur-3xl animate-menu-in select-none"
              style={{ background: "var(--menu-bg)", borderColor: "var(--menu-border)", color: "var(--menu-fg)" }}
            >
              <MenuItem
                label="About Kairo"
                onSelect={() => {
                  openWindow("about");
                  closeMenus();
                }}
              />
              <MenuItem
                label="Settings..."
                shortcut="⌘,"
                onSelect={() => {
                  openWindow("settings");
                  closeMenus();
                }}
              />
              <div className="my-1.5 h-px bg-black/[0.08] dark:bg-white/[0.08]" />
              <MenuItem
                label="Leave Server"
                shortcut="⌘Q"
                onSelect={() => {
                  closeMenus();
                  logOut();
                }}
              />
            </div>
          )}
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => handleMenuClick("file")}
            onMouseEnter={() => handleMenuHover("file")}
            className={`rounded-md px-2 py-0.5 text-[13px] transition-colors outline-none ${
              activeMenu === "file" ? "bg-[var(--topbar-active)]" : "hover:bg-[var(--topbar-hover)]"
            }`}
          >
            File
          </button>

          {activeMenu === "file" && (
            <div
              className="absolute left-0 top-[calc(100%+4px)] z-[100] min-w-56 overflow-hidden rounded-[16px] border py-1.5 shadow-[0_20px_50px_rgba(0,0,0,0.3)] backdrop-blur-3xl animate-menu-in select-none"
              style={{ background: "var(--menu-bg)", borderColor: "var(--menu-border)", color: "var(--menu-fg)" }}
            >
              <MenuItem
                label="New Terminal Window"
                shortcut="⌘T"
                onSelect={() => {
                  openWindow("terminal");
                  closeMenus();
                }}
              />
              <MenuItem
                label="Browse Files"
                shortcut="⌘O"
                onSelect={() => {
                  openWindow("files");
                  closeMenus();
                }}
              />
              <MenuItem
                label="Dashboard"
                onSelect={() => {
                  openWindow("dashboard");
                  closeMenus();
                }}
              />
              <MenuItem
                label="Linux Applications"
                shortcut="⌘Space"
                onSelect={() => {
                  window.dispatchEvent(new Event("kairo:toggle-spotlight"));
                  closeMenus();
                }}
              />
              <div className="my-1.5 h-px bg-black/[0.08] dark:bg-white/[0.08]" />
              <MenuItem
                label="Close Window"
                shortcut="⌘W"
                disabled={!focusedId}
                onSelect={() => {
                  if (focusedId) closeWindow(focusedId);
                  closeMenus();
                }}
              />
            </div>
          )}
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => handleMenuClick("view")}
            onMouseEnter={() => handleMenuHover("view")}
            className={`rounded-md px-2 py-0.5 text-[13px] transition-colors outline-none ${
              activeMenu === "view" ? "bg-[var(--topbar-active)]" : "hover:bg-[var(--topbar-hover)]"
            }`}
          >
            View
          </button>

          {activeMenu === "view" && (
            <div
              className="absolute left-0 top-[calc(100%+4px)] z-[100] min-w-56 overflow-hidden rounded-[16px] border py-1.5 shadow-[0_20px_50px_rgba(0,0,0,0.3)] backdrop-blur-3xl animate-menu-in select-none"
              style={{ background: "var(--menu-bg)", borderColor: "var(--menu-border)", color: "var(--menu-fg)" }}
            >
              <MenuItem
                label="Tile Windows"
                shortcut="⌥T"
                onSelect={() => {
                  tileWindows();
                  closeMenus();
                }}
              />
              <MenuItem
                label="Snap Left (50%)"
                shortcut="⌥←"
                disabled={!focusedId}
                onSelect={() => {
                  if (focusedId) snapWindow(focusedId, "left");
                  closeMenus();
                }}
              />
              <MenuItem
                label="Snap Right (50%)"
                shortcut="⌥→"
                disabled={!focusedId}
                onSelect={() => {
                  if (focusedId) snapWindow(focusedId, "right");
                  closeMenus();
                }}
              />
              <MenuItem
                label="Maximize Window"
                shortcut="⌥↑"
                disabled={!focusedId}
                onSelect={() => {
                  if (focusedId) maximizeWindow(focusedId);
                  closeMenus();
                }}
              />
              <MenuItem
                label="Restore Window"
                shortcut="⌥↓"
                disabled={!focusedId}
                onSelect={() => {
                  if (focusedId) restoreWindow(focusedId);
                  closeMenus();
                }}
              />
            </div>
          )}
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => handleMenuClick("window")}
            onMouseEnter={() => handleMenuHover("window")}
            className={`rounded-md px-2 py-0.5 text-[13px] transition-colors outline-none ${
              activeMenu === "window" ? "bg-[var(--topbar-active)]" : "hover:bg-[var(--topbar-hover)]"
            }`}
          >
            Window
          </button>

          {activeMenu === "window" && (
            <div
              className="absolute left-0 top-[calc(100%+4px)] z-[100] min-w-56 overflow-hidden rounded-[16px] border py-1.5 shadow-[0_20px_50px_rgba(0,0,0,0.3)] backdrop-blur-3xl animate-menu-in select-none"
              style={{ background: "var(--menu-bg)", borderColor: "var(--menu-border)", color: "var(--menu-fg)" }}
            >
              <MenuItem
                label="Minimize"
                shortcut="⌘M"
                disabled={!focusedId}
                onSelect={() => {
                  if (focusedId) minimizeWindow(focusedId);
                  closeMenus();
                }}
              />
              <MenuItem
                label="Zoom"
                disabled={!focusedId}
                onSelect={() => {
                  if (focusedId) maximizeWindow(focusedId);
                  closeMenus();
                }}
              />
              <MenuItem
                label="Tile Windows Side-by-Side"
                shortcut="⌥T"
                onSelect={() => {
                  tileWindows();
                  closeMenus();
                }}
              />
            </div>
          )}
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => handleMenuClick("help")}
            onMouseEnter={() => handleMenuHover("help")}
            className={`rounded-md px-2 py-0.5 text-[13px] transition-colors outline-none ${
              activeMenu === "help" ? "bg-[var(--topbar-active)]" : "hover:bg-[var(--topbar-hover)]"
            }`}
          >
            Help
          </button>

          {activeMenu === "help" && (
            <div
              className="absolute left-0 top-[calc(100%+4px)] z-[100] min-w-56 overflow-hidden rounded-[16px] border py-1.5 shadow-[0_20px_50px_rgba(0,0,0,0.3)] backdrop-blur-3xl animate-menu-in select-none"
              style={{ background: "var(--menu-bg)", borderColor: "var(--menu-border)", color: "var(--menu-fg)" }}
            >
              <MenuItem
                label="Spotlight Search"
                shortcut="⌘Space"
                onSelect={() => {
                  closeMenus();
                  window.dispatchEvent(new Event("kairo:toggle-spotlight"));
                }}
              />
              <div className="my-1.5 h-px bg-black/[0.08] dark:bg-white/[0.08]" />
              <MenuItem
                label="Kairo Help"
                onSelect={() => {
                  openWindow("about");
                  closeMenus();
                }}
              />
            </div>
          )}
        </div>
      </div>

      <div className="flex min-w-0 items-center justify-end gap-3.5 overflow-visible whitespace-nowrap text-[12px]">
        <div
          className="relative flex min-w-0 items-center gap-1.5"
          ref={serverMenuRef}
          title={error || undefined}
        >
          <span
            className={`size-2 shrink-0 rounded-full ${
              online
                ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]"
                : loading && !ready
                  ? "bg-amber-300"
                  : "bg-red-400"
            }`}
            aria-hidden
          />
          <button
            type="button"
            onClick={() => setServerMenuOpen((open) => !open)}
            className="inline-flex min-w-0 max-w-[200px] items-center gap-1 rounded-full px-2 py-0.5 outline-none hover:bg-[var(--topbar-hover)] transition-colors focus-visible:ring-2 focus-visible:ring-white/40"
            aria-haspopup="menu"
            aria-expanded={serverMenuOpen}
            aria-label={`Current server ${name}. Open server menu.`}
          >
            <span className="truncate font-medium">{name}</span>
            <ChevronDown className="size-3 opacity-70" aria-hidden />
          </button>
          <span className="opacity-60 text-[11px]">{online ? "Online" : statusLabel(server?.status || selected?.status, loading)}</span>
          {serverMenuOpen && (
            <div
              role="menu"
              aria-label="Server menu"
              className="absolute right-0 top-[calc(100%+6px)] z-[100] w-[240px] overflow-hidden rounded-[16px] border py-1.5 text-left shadow-[0_20px_50px_rgba(0,0,0,0.3)] backdrop-blur-3xl animate-menu-in select-none"
              style={{ background: "var(--menu-bg)", borderColor: "var(--menu-border)", color: "var(--menu-fg)" }}
            >
              <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] opacity-40">
                Current server
              </p>
              <div className="flex items-center gap-2 px-3 py-1.5 text-[12px]">
                <Server aria-hidden className="size-3.5 opacity-70" />
                <span className="truncate font-medium">{name}</span>
              </div>
              {otherServers.length > 0 && (
                <>
                  <div className="my-1.5 h-px bg-black/[0.08] dark:bg-white/[0.08]" />
                  <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] opacity-40">
                    Switch to
                  </p>
                  {otherServers.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setServerMenuOpen(false);
                        switchServer(item);
                      }}
                      className="flex w-[calc(100%-12px)] items-center gap-2 mx-1.5 px-3 py-1.5 text-[12px] rounded-[8px] hover:bg-[#007aff] hover:!text-white transition-colors"
                    >
                      <ArrowLeftRight aria-hidden className="size-3.5 opacity-70" />
                      <span className="truncate">{item.name}</span>
                    </button>
                  ))}
                </>
              )}
              <div className="my-1.5 h-px bg-black/[0.08] dark:bg-white/[0.08]" />
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setServerMenuOpen(false);
                  backToServers();
                }}
                className="flex w-[calc(100%-12px)] items-center gap-2 mx-1.5 px-3 py-1.5 text-[12px] rounded-[8px] hover:bg-[#007aff] hover:!text-white transition-colors"
              >
                <Server aria-hidden className="size-3.5 opacity-80" />
                All servers
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setServerMenuOpen(false);
                  logOut();
                }}
                className="flex w-[calc(100%-12px)] items-center gap-2 mx-1.5 px-3 py-1.5 text-[12px] rounded-[8px] hover:bg-[#007aff] hover:!text-white transition-colors"
              >
                <LogOut aria-hidden className="size-3.5 opacity-80" />
                Leave server
              </button>
            </div>
          )}
        </div>

        <span className="hidden shrink-0 font-medium sm:inline opacity-80" title={!isLive ? "Agent not loaded / offline" : undefined}>
          CPU {metric(cpuPercent, loading, isLive)}
        </span>
        <span className="hidden shrink-0 font-medium sm:inline opacity-80" title={!isLive ? "Agent not loaded / offline" : undefined}>
          RAM {metric(ramPercent, loading, isLive)}
        </span>

        <div className="flex items-center gap-2 opacity-80">
          <Wifi className="size-3.5" />
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event("kairo:toggle-spotlight"))}
            className="rounded p-0.5 hover:opacity-100 hover:bg-white/10 transition-colors"
            title="Spotlight Search (⌘Space)"
            aria-label="Spotlight Search"
          >
            <Search className="size-3.5" />
          </button>
          <SlidersHorizontal className="size-3.5" />
        </div>

        <ThemeToggle />

        <time className="shrink-0 text-right font-medium text-[12px]" dateTime={dateStr || undefined}>
          {dateStr}
        </time>
      </div>
    </header>
  );
}

function MenuItem({
  label,
  shortcut,
  disabled,
  onSelect,
}: {
  label: string;
  shortcut?: string;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onSelect}
      className="flex w-[calc(100%-12px)] items-center justify-between mx-1.5 px-3 py-1.5 text-left rounded-[8px] outline-none text-[13px] font-normal transition-colors disabled:opacity-35 disabled:pointer-events-none hover:bg-[#007aff] hover:!text-white focus-visible:bg-[#007aff] focus-visible:!text-white group/item"
    >
      <span>{label}</span>
      {shortcut && (
        <span className="text-[11px] opacity-50 ml-4 font-mono group-hover/item:opacity-90 group-hover/item:!text-white">
          {shortcut}
        </span>
      )}
    </button>
  );
}
