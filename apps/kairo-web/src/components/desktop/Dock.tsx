"use client";

import { APP_META, type AppId } from "@/src/data/apps";
import { DOCK_GLYPHS } from "@/src/components/desktop/dock-icons";
import { useWindowManager } from "@/src/components/window/window-context";

type DockProps = {
  onComingSoon: () => void;
  onOpenSpotlight: () => void;
};

const iconClass =
  "size-11 sm:size-12 overflow-hidden rounded-[13px] shadow-sm transition-all duration-200 ease-out group-hover:-translate-y-2.5 group-hover:scale-115 active:scale-95 group-focus-visible:ring-2 group-focus-visible:ring-white";

export function Dock({ onComingSoon, onOpenSpotlight }: DockProps) {
  const { windows, focusedId, openWindow, restoreWindow, focusWindow } = useWindowManager();

  const dockApps: { id: AppId | "launchpad"; title: string; action: () => void }[] = [
    {
      id: "files",
      title: "Finder",
      action: () => handleSelect("files"),
    },
    {
      id: "launchpad",
      title: "Launchpad",
      action: onOpenSpotlight,
    },
    {
      id: "terminal",
      title: "Terminal",
      action: () => handleSelect("terminal"),
    },
    {
      id: "editor",
      title: "Code Editor",
      action: () => handleSelect("editor"),
    },
    {
      id: "dashboard",
      title: "Activity Monitor",
      action: () => handleSelect("dashboard"),
    },
    {
      id: "databases",
      title: "Databases & Docker",
      action: () => handleSelect("databases"),
    },
    {
      id: "domains",
      title: "Domains & Reverse Proxy",
      action: () => handleSelect("domains"),
    },
    {
      id: "settings",
      title: "System Settings",
      action: () => handleSelect("settings"),
    },
  ];

  function handleSelect(app: AppId) {
    const existing = windows.find((item) => item.app === app);
    if (!existing) {
      openWindow(app);
      return;
    }
    if (existing.minimized) {
      restoreWindow(existing.id);
      return;
    }
    focusWindow(existing.id);
  }

  return (
    <nav
      aria-label="Applications"
      className="pointer-events-none absolute inset-x-0 bottom-3 z-50 flex justify-center"
    >
      <div className="pointer-events-auto flex items-end gap-2.5 rounded-[26px] border border-white/20 dark:border-white/10 bg-white/25 dark:bg-black/35 px-4 py-2.5 shadow-[0_20px_50px_rgba(0,0,0,0.38),inset_0_1px_1px_rgba(255,255,255,0.3)] backdrop-blur-3xl">
        {dockApps.map((item) => {
          const Glyph = DOCK_GLYPHS[item.id === "launchpad" ? "launchpad" : (item.id as keyof typeof DOCK_GLYPHS)];
          const open = item.id !== "launchpad" && windows.find((w) => w.app === item.id);
          const focused = open && open.id === focusedId && !open.minimized;

          return (
            <button
              key={item.id}
              type="button"
              aria-label={item.title}
              title={item.title}
              aria-pressed={Boolean(open)}
              className="group relative flex w-[48px] sm:w-[52px] flex-col items-center outline-none"
              onClick={item.action}
            >
              <div className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 rounded-md bg-black/75 px-2.5 py-1 text-[11px] font-medium text-white shadow-lg backdrop-blur-md opacity-0 transition-opacity group-hover:opacity-100 whitespace-nowrap z-50 border border-white/10">
                {item.title}
              </div>
              <Glyph className={iconClass} />
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
          title="Trash"
          className="group relative flex w-[48px] sm:w-[52px] flex-col items-center outline-none"
          onClick={() => handleSelect("files")}
        >
          <div className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 rounded-md bg-black/75 px-2.5 py-1 text-[11px] font-medium text-white shadow-lg backdrop-blur-md opacity-0 transition-opacity group-hover:opacity-100 whitespace-nowrap z-50 border border-white/10">
            Trash
          </div>
          <DOCK_GLYPHS.trash className={iconClass} />
        </button>
      </div>
    </nav>
  );
}
