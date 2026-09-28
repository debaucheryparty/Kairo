"use client";

import { useState, type MouseEvent } from "react";
import { useDockStore, type DockItem } from "@/src/lib/dock/dock-store";
import { TrashGlyph } from "@/src/components/desktop/dock-icons";
import { MacAppIcon } from "@/src/components/brand/MacAppIcon";
import { useWindowManager } from "@/src/components/window/window-context";
import { useSelectedServer } from "@/src/lib/session";
import { useTrash } from "@/src/lib/files/trash";
import { ModalAlert } from "@/src/components/desktop/ModalAlert";
import type { AppId } from "@/src/data/apps";

type DockProps = {
  onComingSoon: () => void;
  onOpenSpotlight: () => void;
};

const iconClass =
  "size-12 sm:size-[52px] transition-all duration-200 ease-out group-hover:-translate-y-2.5 group-hover:scale-115 active:scale-95 group-focus-visible:ring-2 group-focus-visible:ring-white";

type DockMenuState = {
  x: number;
  y: number;
  item: DockItem;
  isRunning: boolean;
  isPinned: boolean;
};

export function Dock({ onComingSoon, onOpenSpotlight }: DockProps) {
  const { windows, focusedId, openWindow, restoreWindow, focusWindow, closeWindow } =
    useWindowManager();
  const selectedServer = useSelectedServer();
  const serverId = selectedServer?.id || "";
  const { dockItems, pinApp, unpinApp, isPinned } = useDockStore();
  const { count: trashCount, emptyAll } = useTrash(serverId);

  const [menu, setMenu] = useState<DockMenuState | null>(null);
  const [emptyTrashAlert, setEmptyTrashAlert] = useState(false);

  const runningApps = windows
    .filter((w) => w.app !== "trash")
    .map((w) => w.app);

  const extraRunningItems: DockItem[] = Array.from(new Set(runningApps))
    .filter((appId) => !dockItems.some((d) => d.id === appId || d.builtinAppId === appId))
    .map((appId) => ({
      id: appId,
      title: appId.charAt(0).toUpperCase() + appId.slice(1),
      builtinAppId: appId,
    }));

  const allVisibleItems: DockItem[] = [...dockItems, ...extraRunningItems];

  function handleSelect(item: DockItem) {
    const appId = (item.builtinAppId || item.id) as AppId;
    const existing = windows.find((w) => w.app === appId);
    if (!existing) {
      if (item.builtinAppId) {
        openWindow(item.builtinAppId as AppId);
      } else {
        openWindow("surface", {
          surfaceId: item.id,
          appName: item.title,
          appExec: item.exec,
          appIcon: item.icon,
        });
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
    const menuWidth = 180;
    const menuHeight = 120;
    setMenu({
      x: Math.min(e.clientX - 60, window.innerWidth - menuWidth - 10),
      y: Math.max(10, e.clientY - menuHeight - 10),
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
    const menuHeight = 90;
    setMenu({
      x: Math.min(e.clientX - 60, window.innerWidth - menuWidth - 10),
      y: Math.max(10, e.clientY - menuHeight - 10),
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
        aria-label="Applications"
        className="pointer-events-none absolute inset-x-0 bottom-3 z-50 flex justify-center"
      >
        <div className="pointer-events-auto flex items-end gap-2.5 rounded-[26px] border border-white/20 dark:border-white/10 bg-white/25 dark:bg-black/35 px-4 py-2.5 shadow-[0_20px_50px_rgba(0,0,0,0.38),inset_0_1px_1px_rgba(255,255,255,0.3)] backdrop-blur-3xl">
          {allVisibleItems.map((item) => {
            const appId = item.builtinAppId || item.id;
            const open = windows.find((w) => w.app === appId);
            const focused = open && open.id === focusedId && !open.minimized;

            return (
              <button
                key={item.id}
                type="button"
                aria-label={item.title}
                title={item.title}
                aria-pressed={Boolean(open)}
                className="group relative flex w-[48px] sm:w-[52px] flex-col items-center outline-none select-none"
                onClick={() => handleSelect(item)}
                onContextMenu={(e) => handleContextMenu(e, item)}
              >
                <div className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 rounded-md bg-black/75 px-2.5 py-1 text-[11px] font-medium text-white shadow-lg backdrop-blur-md opacity-0 transition-opacity group-hover:opacity-100 whitespace-nowrap z-50 border border-white/10">
                  {item.title}
                </div>
                <div className={iconClass}>
                  <MacAppIcon icon={item.icon || item.id} name={item.title} className="size-full" />
                </div>
                <span
                  className={`absolute -bottom-1.5 size-1 rounded-full transition-all ${
                    focused
                      ? "bg-white shadow-[0_0_8px_rgba(255,255,255,0.9)] scale-125"
                      : open
                        ? "bg-white/60"
                        : "bg-transparent"
                  }`}
                />
              </button>
            );
          })}

          <span aria-hidden className="mb-2 ml-0.5 h-8 w-px bg-white/20" />

          <button
            type="button"
            aria-label="Trash"
            title={trashCount > 0 ? `Trash (${trashCount})` : "Trash"}
            className="group relative flex w-[48px] sm:w-[52px] flex-col items-center outline-none select-none"
            onClick={handleOpenTrash}
            onContextMenu={handleTrashContextMenu}
          >
            <div className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 rounded-md bg-black/75 px-2.5 py-1 text-[11px] font-medium text-white shadow-lg backdrop-blur-md opacity-0 transition-opacity group-hover:opacity-100 whitespace-nowrap z-50 border border-white/10">
              {trashCount > 0 ? `Trash (${trashCount})` : "Trash"}
            </div>
            <TrashGlyph className={iconClass} hasItems={trashCount > 0} />
            {trashCount > 0 && (
              <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white shadow-sm ring-1 ring-white/40">
                {trashCount > 9 ? "9+" : trashCount}
              </span>
            )}
          </button>
        </div>
      </nav>

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
            className="fixed z-[120] min-w-44 overflow-hidden rounded-[16px] border py-1.5 shadow-[0_20px_50px_rgba(0,0,0,0.3)] backdrop-blur-3xl animate-menu-in select-none"
            style={{
              left: menu.x,
              top: menu.y,
              background: "var(--menu-bg)",
              borderColor: "var(--menu-border)",
              color: "var(--menu-fg)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-3 py-1 text-[11px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">
              {menu.item.title}
            </div>
            <button
              type="button"
              className="flex w-[calc(100%-12px)] items-center mx-1.5 px-3 py-1.5 text-left rounded-[8px] outline-none text-[13px] font-normal transition-colors hover:bg-[#007aff] hover:!text-white"
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
                <div className="my-1.5 h-px bg-black/[0.08] dark:bg-white/[0.08]" />
                <button
                  type="button"
                  disabled={trashCount === 0}
                  className="flex w-[calc(100%-12px)] items-center mx-1.5 px-3 py-1.5 text-left rounded-[8px] outline-none text-[13px] font-normal text-red-600 dark:text-red-400 transition-colors hover:bg-red-500 hover:!text-white disabled:opacity-40"
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
                <div className="my-1.5 h-px bg-black/[0.08] dark:bg-white/[0.08]" />
                {menu.isPinned && menu.item.id !== "files" && (
                  <button
                    type="button"
                    className="flex w-[calc(100%-12px)] items-center mx-1.5 px-3 py-1.5 text-left rounded-[8px] outline-none text-[13px] font-normal transition-colors hover:bg-[#007aff] hover:!text-white"
                    onClick={() => {
                      unpinApp(menu.item.id);
                      setMenu(null);
                    }}
                  >
                    Remove from Dock
                  </button>
                )}
                {!menu.isPinned && (
                  <button
                    type="button"
                    className="flex w-[calc(100%-12px)] items-center mx-1.5 px-3 py-1.5 text-left rounded-[8px] outline-none text-[13px] font-normal transition-colors hover:bg-[#007aff] hover:!text-white"
                    onClick={() => {
                      pinApp(menu.item);
                      setMenu(null);
                    }}
                  >
                    Keep in Dock
                  </button>
                )}
                {menu.isRunning && (
                  <button
                    type="button"
                    className="flex w-[calc(100%-12px)] items-center mx-1.5 px-3 py-1.5 text-left rounded-[8px] outline-none text-[13px] font-normal transition-colors hover:bg-red-500 hover:!text-white"
                    onClick={() => handleQuit(menu.item.builtinAppId || menu.item.id)}
                  >
                    Quit
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}

      <ModalAlert
        open={emptyTrashAlert}
        title="Empty Trash?"
        message="Are you sure you want to permanently erase all items in the Trash? You cannot undo this action."
        confirmLabel="Empty Trash"
        confirmDestructive={true}
        cancelLabel="Cancel"
        onConfirm={async () => {
          await emptyAll();
          setEmptyTrashAlert(false);
        }}
        onCancel={() => setEmptyTrashAlert(false)}
        layout="stacked"
      />
    </>
  );
}
