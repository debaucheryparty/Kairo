"use client";

import { useEffect, useState, type MouseEvent, type PointerEvent } from "react";
import { ServerProvider } from "@/src/lib/api/server-context";
import { isDesktopRuntime } from "@/src/lib/runtime";
import { useSession } from "@/src/lib/session";
import { DesktopContextMenu } from "@/src/components/desktop/DesktopContextMenu";
import { Dock } from "@/src/components/desktop/Dock";
import { TopBar } from "@/src/components/desktop/TopBar";
import { BrandMark } from "@/src/components/brand/BrandMark";
import { WindowManager } from "@/src/components/window/WindowManager";
import { ModalAlert } from "@/src/components/desktop/ModalAlert";
import { SpotlightModal } from "@/src/components/desktop/SpotlightModal";
import {
  WindowManagerProvider,
  useWindowManager,
  type WindowPayload,
} from "@/src/components/window/window-context";

export function Desktop() {
  const { selectedServer } = useSession();
  return (
    <ServerProvider serverId={selectedServer?.id || ""}>
      <WindowManagerProvider>
        <DesktopShell />
      </WindowManagerProvider>
    </ServerProvider>
  );
}

function DesktopShell() {
  const { logOut } = useSession();
  const {
    clearFocus,
    windows,
    focusedId,
    closeWindow,
    openWindow,
    snapWindow,
    maximizeWindow,
    restoreWindow,
    tileWindows,
  } = useWindowManager();
  const fullscreen = windows.some((item) => item.maximized && !item.minimized);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [notice, setNotice] = useState(false);
  const [logoutAlertOpen, setLogoutAlertOpen] = useState(false);
  const [spotlightOpen, setSpotlightOpen] = useState(false);
  const [wallpaper, setWallpaper] = useState("/wallpaper.jpg");
  const desktopRuntime = isDesktopRuntime();

  useEffect(() => {
    const onToggle = () => setSpotlightOpen((prev) => !prev);
    window.addEventListener("kairo:toggle-spotlight", onToggle);
    return () => window.removeEventListener("kairo:toggle-spotlight", onToggle);
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem("kairo_wallpaper");
    if (saved) setWallpaper(saved);
    const onStorage = (e: StorageEvent) => {
      if (e.key === "kairo_wallpaper") {
        setWallpaper(e.newValue || "/wallpaper.jpg");
      }
    };
    const onCustom = () => {
      setWallpaper(localStorage.getItem("kairo_wallpaper") || "/wallpaper.jpg");
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("kairo:wallpaper-change", onCustom);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("kairo:wallpaper-change", onCustom);
    };
  }, []);

  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(false), 1600);
    return () => window.clearTimeout(id);
  }, [notice]);

  useEffect(() => {
    openWindow("dashboard");
  }, [openWindow]);

  useEffect(() => {
    const onOpenSurface = (e: Event) => {
      const customEvent = e as CustomEvent<WindowPayload>;
      if (customEvent.detail) {
        openWindow("surface", customEvent.detail);
      }
    };
    const onCloseSurface = (e: Event) => {
      const customEvent = e as CustomEvent<{ surfaceId: string }>;
      if (customEvent.detail?.surfaceId) {
        closeWindow(`surface:${customEvent.detail.surfaceId}`);
      }
    };
    window.addEventListener("kairo:open-surface", onOpenSurface);
    window.addEventListener("kairo:close-surface", onCloseSurface);
    return () => {
      window.removeEventListener("kairo:open-surface", onOpenSurface);
      window.removeEventListener("kairo:close-surface", onCloseSurface);
    };
  }, [closeWindow, openWindow]);

  useEffect(() => {
    function isTypingTarget(target: EventTarget | null) {
      if (!(target instanceof HTMLElement)) return false;
      if (target.closest(".xterm") || target.closest(".xterm-helper-textarea")) return true;
      const tag = target.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
    }

    function onKey(event: KeyboardEvent) {
      const meta = event.metaKey || event.ctrlKey;
      if (event.key === "Escape") {
        setMenu(null);
        clearFocus();
        return;
      }
      if (event.altKey) {
        if (event.key.toLowerCase() === "t") {
          event.preventDefault();
          tileWindows();
          return;
        }
        if (focusedId) {
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            snapWindow(focusedId, "left");
            return;
          }
          if (event.key === "ArrowRight") {
            event.preventDefault();
            snapWindow(focusedId, "right");
            return;
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            maximizeWindow(focusedId);
            return;
          }
          if (event.key === "ArrowDown") {
            event.preventDefault();
            restoreWindow(focusedId);
            return;
          }
        }
      }
      if (!meta) return;
      if (event.key === " " || event.code === "Space") {
        event.preventDefault();
        setSpotlightOpen((prev) => !prev);
        return;
      }
      if (event.key.toLowerCase() === "k") {
        event.preventDefault();
        window.dispatchEvent(new Event("kairo:toggle-server-menu"));
        return;
      }
      if (event.key.toLowerCase() === ",") {
        event.preventDefault();
        openWindow("settings");
        return;
      }
      if (event.key.toLowerCase() === "w") {
        if (isTypingTarget(event.target)) return;
        if (!focusedId) return;
        event.preventDefault();
        closeWindow(focusedId);
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [clearFocus, closeWindow, focusedId, maximizeWindow, openWindow, restoreWindow, snapWindow, tileWindows]);

  function showComingSoon() {
    setNotice(true);
  }

  function isChrome(target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) return false;
    return Boolean(
      target.closest('[role="dialog"]') ||
      target.closest('[role="menu"]') ||
      target.closest("nav[aria-label='Applications']") ||
      target.closest("header"),
    );
  }

  function onContextMenu(event: MouseEvent<HTMLElement>) {
    if (isChrome(event.target)) return;
    event.preventDefault();
    const width = 210;
    const height = 248;
    const x = Math.min(event.clientX, window.innerWidth - width - 8);
    const y = Math.min(event.clientY, window.innerHeight - height - 8);
    setMenu({ x: Math.max(8, x), y: Math.max(40, y) });
  }

  function onPointerDown(event: PointerEvent<HTMLElement>) {
    const chrome = isChrome(event.target);
    if (!chrome) {
      clearFocus();
    }
    if (!(event.target instanceof HTMLElement && event.target.closest('[role="menu"]'))) {
      setMenu(null);
    }
  }

  return (
    <div
      className="relative h-dvh w-full overflow-hidden bg-background text-foreground"
      onContextMenu={onContextMenu}
      onPointerDown={onPointerDown}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url('${wallpaper}')` }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: "var(--desktop-scrim)" }}
      />
      <TopBar />
      <div
        className={`absolute inset-x-0 top-8 bottom-0 ${fullscreen ? "z-40" : "z-20"}`}
        aria-label="Server desktop"
        role="application"
      >
        <WindowManager />
      </div>
      {fullscreen ? null : (
        <Dock
          onComingSoon={showComingSoon}
          onOpenSpotlight={() => setSpotlightOpen(true)}
        />
      )}
      {menu ? (
        <DesktopContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          onComingSoon={showComingSoon}
          onLogOut={() => setLogoutAlertOpen(true)}
        />
      ) : null}
      {notice ? (
        <div
          role="status"
          className="fixed right-4 top-11 z-[120] flex w-80 items-start gap-3 rounded-[18px] border p-3.5 shadow-2xl backdrop-blur-3xl animate-menu-in select-none"
          style={{
            background: "var(--menu-bg)",
            borderColor: "var(--menu-border)",
            color: "var(--menu-fg)",
          }}
        >
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#007aff]/15 text-[#007aff] text-lg font-semibold">
            ⚡
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12px] font-semibold tracking-tight truncate">System Notice</span>
              <span className="text-[10px] opacity-40 shrink-0">now</span>
            </div>
            <p className="text-[11px] opacity-70 mt-0.5 leading-relaxed">
              This feature is coming soon in the next Kairo release.
            </p>
          </div>
        </div>
      ) : null}

      <SpotlightModal
        open={spotlightOpen}
        onClose={() => setSpotlightOpen(false)}
      />

      <ModalAlert
        open={logoutAlertOpen}
        title="Leave this server?"
        message="Your background services will remain running on the remote host, and you can reconnect at any time."
        confirmLabel="Leave"
        confirmDestructive={true}
        cancelLabel="Cancel"
        onConfirm={() => {
          setLogoutAlertOpen(false);
          logOut();
        }}
        onCancel={() => setLogoutAlertOpen(false)}
        layout="stacked"
      />
    </div>
  );
}
