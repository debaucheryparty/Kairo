"use client";

import { useState, useRef, type MouseEvent } from "react";
import { useDockStore, type DockItem } from "@/src/lib/dock/dock-store";
import { AppIcon } from "@/src/components/brand/AppIcon";
import { useWindowManager } from "@/src/components/window/window-context";
import { useRuntimeClient, useSelectedServer } from "@/src/lib/session";
import { useTrash } from "@/src/lib/files/trash";
import { ModalAlert } from "@/src/components/desktop/ModalAlert";
import { M3IconButton } from "@/src/components/m3/M3Button";
import { X, Minus, ExternalLink } from "lucide-react";
import type { AppId } from "@/src/data/apps";

type DockProps = {
  fullscreen?: boolean;
  onComingSoon: () => void;
  onOpenSpotlight: () => void;
};

type DockMenuState = {
  x: number;
  y: number;
  item: DockItem;
  isRunning: boolean;
  isPinned: boolean;
};

/**
 * Material 3 Expressive Applications Dock
 * Built in accordance with:
 * - M3 Spacing (8dp baseline grid): https://m3.material.io/styles/spacing/overview
 * - M3 Shape Scale (28dp extra-large container, 16dp app tiles): https://m3.material.io/styles/shape/overview-principles
 * - M3 Typography (m3-label-medium, m3-title-small): https://m3.material.io/styles/typography/overview
 * - M3 Motion & Transitions (Emphasized Decelerate, Spring Pop): https://m3.material.io/styles/motion/overview/how-it-works
 * - M3 Variable Icons & Fill axes: https://m3.material.io/styles/icons/overview
 * - M3 Color Roles & Elevation levels 0-5: https://m3.material.io/styles/color/roles
 */
export function Dock({ fullscreen = false, onComingSoon, onOpenSpotlight }: DockProps) {
  const {
    windows,
    focusedId,
    openWindow,
    restoreWindow,
    focusWindow,
    closeWindow,
    minimizeWindow,
  } = useWindowManager();
  const selectedServer = useSelectedServer();
  const runtimeClient = useRuntimeClient();
  const serverId = selectedServer?.id || "";
  const { dockItems, pinApp, unpinApp, isPinned } = useDockStore();
  const { count: trashCount, emptyAll } = useTrash(serverId);

  const [dockPinned, setDockPinned] = useState(true);
  const [menu, setMenu] = useState<DockMenuState | null>(null);
  const [emptyTrashAlert, setEmptyTrashAlert] = useState(false);
  const [hoveredAppId, setHoveredAppId] = useState<string | null>(null);
  const hoverTimer = useRef<NodeJS.Timeout | null>(null);

  const runningApps = windows
    .filter((w) => w.app !== "trash")
    .map((w) => w.app);

  const extraRunningItems: DockItem[] = Array.from(new Set(runningApps))
    .filter((appId) => !dockItems.some((d) => d.id === appId || d.builtinAppId === appId))
    .map((appId) => {
      const win = windows.find((w) => w.app === appId || w.payload?.appId === appId);
      const title = win?.payload?.appName || appId.charAt(0).toUpperCase() + appId.slice(1);
      return {
        id: appId,
        title,
        icon: win?.payload?.appIcon || appId,
      };
    });

  const allVisibleItems: DockItem[] = [...dockItems, ...extraRunningItems];

  function handleSelect(item: DockItem) {
    const appId = item.builtinAppId || item.id;
    const existing = windows.find(
      (w) =>
        w.app === appId ||
        w.payload?.appId === item.id ||
        (w.payload?.appName && w.payload.appName === item.title),
    );
    if (!existing) {
      if (item.builtinAppId) {
        openWindow(item.builtinAppId as AppId);
      } else {
        if (runtimeClient?.getSession()) {
          const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
          const effectiveDpr = Math.min(Math.max(dpr, 1), 2);
          const args =
            item.id.includes("chrome") || (item.exec && item.exec.includes("chrome"))
              ? [`--force-device-scale-factor=${effectiveDpr}`]
              : undefined;

          void runtimeClient
            .launchApplication({
              appId: item.id,
              exec: item.exec,
              args,
            })
            .catch((err) => {
              console.error("Failed to launch application from dock:", err);
            });
        }
      }
      return;
    }
    if (existing.minimized) {
      restoreWindow(existing.id);
      return;
    }
    focusWindow(existing.id);
  }

  function handleOpenTrash() {
    const existing = windows.find((w) => w.app === "trash");
    if (!existing) {
      openWindow("trash");
      return;
    }
    if (existing.minimized) {
      restoreWindow(existing.id);
      return;
    }
    focusWindow(existing.id);
  }

  function handleContextMenu(e: MouseEvent, item: DockItem) {
    e.preventDefault();
    e.stopPropagation();
    const appId = item.builtinAppId || item.id;
    const running = windows.some((w) => w.app === appId);
    const pinned = isPinned(item.id);
    const menuWidth = 190;
    const menuHeight = 130;
    setMenu({
      x: Math.min(e.clientX - 60, window.innerWidth - menuWidth - 12),
      y: Math.max(12, e.clientY - menuHeight - 12),
      item,
      isRunning: running,
      isPinned: pinned,
    });
  }

  function handleTrashContextMenu(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const trashItem: DockItem = { id: "trash", title: "Trash", builtinAppId: "trash" };
    const menuWidth = 180;
    const menuHeight = 96;
    setMenu({
      x: Math.min(e.clientX - 60, window.innerWidth - menuWidth - 12),
      y: Math.max(12, e.clientY - menuHeight - 12),
      item: trashItem,
      isRunning: windows.some((w) => w.app === "trash"),
      isPinned: true,
    });
  }

  function handleQuit(appId: string) {
    const wins = windows.filter((w) => w.app === appId);
    for (const w of wins) {
      closeWindow(w.id);
    }
    setMenu(null);
  }

  return (
    <>
      <nav
        aria-label="Applications Dock"
        className="pointer-events-none fixed inset-x-0 bottom-3 z-50 flex justify-center select-none"
      >
        {/* M3 Elevation Level 3 Container with 28dp Extra-Large Shape */}
        <div
          className={`pointer-events-auto flex items-center gap-2 rounded-[28px] border border-[var(--m3-outline-variant,rgba(255,255,255,0.12))]/40 bg-[var(--m3-surface-container-high,rgba(20,19,24,0.92))]/90 p-2 shadow-[0_12px_36px_rgba(0,0,0,0.55),0_1px_2px_rgba(0,0,0,0.3)] backdrop-blur-3xl transition-transform duration-300 ease-[cubic-bezier(0.05,0.7,0.1,1)] ${
            (dockPinned && !fullscreen) ? "translate-y-0" : "translate-y-[calc(100%-8px)] hover:translate-y-0"
          }`}
        >
          {/* M3 Toggle Icon Button: Pin / Auto-hide Toggle */}
          <M3IconButton
            toggle
            selected={dockPinned}
            variant={dockPinned ? "filled" : "outlined"}
            icon="keep_off"
            selectedIcon="keep"
            onClick={() => setDockPinned((prev) => !prev)}
            title={dockPinned ? "Unpin Dock (Auto-hide)" : "Pin Dock (Keep Visible)"}
            className="!size-11"
          />

          {/* M3 8dp Grid Vertical Separator */}
          <span aria-hidden className="h-6 w-[1px] bg-[var(--md-sys-color-outline-variant)]/40 mx-0.5" />

          {/* Dock Apps List (8dp grid layout) */}
          <div className="flex items-center gap-1.5">
            {allVisibleItems.map((item) => {
              const appId = item.builtinAppId || item.id;
              const openWin = windows.find((w) => w.app === appId || w.payload?.appId === item.id);
              const focused = openWin && openWin.id === focusedId && !openWin.minimized;
              const isHovered = hoveredAppId === item.id && Boolean(openWin);

              return (
                <div
                  key={item.id}
                  className="relative flex flex-col items-center"
                  onMouseEnter={() => {
                    hoverTimer.current = setTimeout(() => {
                      setHoveredAppId(item.id);
                    }, 140);
                  }}
                  onMouseLeave={() => {
                    if (hoverTimer.current) clearTimeout(hoverTimer.current);
                    setHoveredAppId(null);
                  }}
                >
                  {/* M3 Elevation Level 5 Hover Preview Card */}
                  {isHovered && openWin && (
                    <div
                      className="absolute bottom-[calc(100%+14px)] left-1/2 -translate-x-1/2 z-[60] w-[220px] rounded-[20px] border border-[var(--m3-outline-variant,rgba(255,255,255,0.15))]/60 bg-[var(--m3-surface-container,rgba(20,19,24,0.96))] p-3 shadow-[0_16px_48px_rgba(0,0,0,0.5)] backdrop-blur-3xl animate-hypr-pop text-left"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-between gap-1.5 mb-2">
                        <span className="m3-title-small text-[var(--m3-on-surface)] truncate max-w-[140px]">
                          {openWin.title}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            title="Minimize"
                            onClick={() => minimizeWindow(openWin.id)}
                            className="size-6 rounded-full hover:bg-[var(--m3-on-surface)]/10 text-[var(--m3-on-surface-variant)] hover:text-[var(--m3-on-surface)] flex items-center justify-center transition-colors"
                          >
                            <Minus className="size-3" />
                          </button>
                          <button
                            type="button"
                            title="Close"
                            onClick={() => closeWindow(openWin.id)}
                            className="size-6 rounded-full hover:bg-[var(--m3-error)]/20 text-rose-300 flex items-center justify-center transition-colors"
                          >
                            <X className="size-3" />
                          </button>
                        </div>
                      </div>

                      <div
                        onClick={() => handleSelect(item)}
                        className="cursor-pointer rounded-[12px] bg-[var(--m3-surface-container-highest)]/40 hover:bg-[var(--m3-surface-container-highest)]/70 p-2 flex items-center justify-between m3-label-small text-[var(--m3-on-surface-variant)] hover:text-[var(--m3-on-surface)] transition-colors border border-[var(--m3-outline-variant)]/20"
                      >
                        <span className="truncate">Click to focus</span>
                        <ExternalLink className="size-3 shrink-0 text-[var(--m3-primary)]" />
                      </div>
                    </div>
                  )}

                  {/* App Launch Button with M3 Shape-Morphing Square Tile */}
                  <button
                    type="button"
                    aria-label={item.title}
                    title={!openWin ? item.title : undefined}
                    aria-pressed={Boolean(openWin)}
                    className="relative flex items-center justify-center outline-none select-none"
                    onClick={() => handleSelect(item)}
                    onContextMenu={(e) => handleContextMenu(e, item)}
                  >
                    <AppIcon icon={item.icon || item.id} name={item.title} className="size-11" />

                    {/* M3 Morphing Running Indicator Pill */}
                    {openWin && (
                      <span
                        className={`absolute -bottom-1.5 rounded-full pill-morph transition-all duration-300 ${
                          focused
                            ? "w-3.5 h-1 bg-[var(--md-sys-color-primary)] shadow-[0_0_8px_var(--md-sys-color-primary)]"
                            : "w-2 h-1 bg-[var(--md-sys-color-on-surface-variant)]/60"
                        }`}
                      />
                    )}
                  </button>
                </div>
              );
            })}
          </div>

          <span aria-hidden className="h-6 w-[1px] bg-[var(--md-sys-color-outline-variant)]/40 mx-0.5" />

          {/* M3 Trash Can Item with Error Badge (Shape-Morph Square Tile) */}
          <button
            type="button"
            aria-label="Trash"
            title={trashCount > 0 ? `Trash (${trashCount})` : "Trash"}
            className="relative flex items-center justify-center outline-none select-none"
            onClick={handleOpenTrash}
            onContextMenu={handleTrashContextMenu}
          >
            <AppIcon icon="trash" name="Trash" className="size-11" />
            {trashCount > 0 && (
              <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-[var(--md-sys-color-error,#ffb4ab)] text-[9px] font-bold text-[var(--md-sys-color-on-error,#690005)] ring-1 ring-[var(--md-sys-color-surface)] font-mono z-10">
                {trashCount > 9 ? "9+" : trashCount}
              </span>
            )}
          </button>

          <span aria-hidden className="h-6 w-[1px] bg-[var(--md-sys-color-outline-variant)]/40 mx-0.5" />

          {/* M3 Outlined Icon Button: Application Launcher */}
          <M3IconButton
            variant="outlined"
            icon="apps"
            onClick={onOpenSpotlight}
            title="Application Launcher (Super)"
            className="!size-11"
          />
        </div>
      </nav>

      {/* M3 Elevation Level 5 Context Menu */}
      {menu && (
        <div
          className="fixed inset-0 z-[110]"
          onClick={() => setMenu(null)}
          onContextMenu={(e) => {
            e.preventDefault();
            setMenu(null);
          }}
        >
          <div
            role="menu"
            className="fixed z-[120] min-w-48 overflow-hidden rounded-[18px] border border-[var(--m3-outline-variant,rgba(255,255,255,0.15))]/60 py-1.5 shadow-[0_16px_40px_rgba(0,0,0,0.5)] backdrop-blur-3xl animate-hypr-pop select-none bg-[var(--m3-surface-container-high,rgba(20,19,24,0.96))] text-[var(--m3-on-surface)]"
            style={{
              left: menu.x,
              top: menu.y,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-3.5 py-1.5 m3-label-small uppercase tracking-wider text-[var(--m3-on-surface-variant)]">
              {menu.item.title}
            </div>

            <button
              type="button"
              className="flex w-full items-center px-3.5 py-2 text-left m3-label-medium hover:bg-[var(--m3-primary)] hover:text-[var(--m3-on-primary)] transition-colors"
              onClick={() => {
                if (menu.item.id === "trash") handleOpenTrash();
                else handleSelect(menu.item);
                setMenu(null);
              }}
            >
              Open
            </button>

            {menu.item.id === "trash" ? (
              <>
                <div className="my-1 h-[1px] bg-[var(--m3-outline-variant,rgba(255,255,255,0.1))]/30" />
                <button
                  type="button"
                  disabled={trashCount === 0}
                  className="flex w-full items-center px-3.5 py-2 text-left m3-label-medium text-rose-300 hover:bg-rose-500/20 transition-colors disabled:opacity-40"
                  onClick={() => {
                    setMenu(null);
                    setEmptyTrashAlert(true);
                  }}
                >
                  Empty Trash
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="flex w-full items-center px-3.5 py-2 text-left m3-label-medium hover:bg-[var(--m3-primary)] hover:text-[var(--m3-on-primary)] transition-colors"
                  onClick={() => {
                    if (menu.isPinned) unpinApp(menu.item.id);
                    else pinApp(menu.item);
                    setMenu(null);
                  }}
                >
                  {menu.isPinned ? "Unpin from Dock" : "Pin to Dock"}
                </button>

                {menu.isRunning && (
                  <>
                    <div className="my-1 h-[1px] bg-[var(--m3-outline-variant,rgba(255,255,255,0.1))]/30" />
                    <button
                      type="button"
                      className="flex w-full items-center px-3.5 py-2 text-left m3-label-medium text-rose-300 hover:bg-rose-500/20 transition-colors"
                      onClick={() => handleQuit(menu.item.builtinAppId || menu.item.id)}
                    >
                      Quit Application
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Empty Trash Confirmation Alert */}
      <ModalAlert
        open={emptyTrashAlert}
        onCancel={() => setEmptyTrashAlert(false)}
        title="Empty Trash"
        message={`Permanently delete all ${trashCount} item${trashCount === 1 ? "" : "s"} in the trash? This action cannot be undone.`}
        confirmLabel="Empty Trash"
        cancelLabel="Cancel"
        confirmDestructive
        onConfirm={async () => {
          await emptyAll();
          setEmptyTrashAlert(false);
        }}
      />

    </>
  );
}
