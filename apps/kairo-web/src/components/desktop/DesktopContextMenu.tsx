"use client";

import { useWindowManager } from "@/src/components/window/window-context";

type DesktopContextMenuProps = {
  x: number;
  y: number;
  onClose: () => void;
  onComingSoon: () => void;
  onLogOut: () => void;
};

export function DesktopContextMenu({
  x,
  y,
  onClose,
  onLogOut,
}: Omit<DesktopContextMenuProps, "onComingSoon"> & { onComingSoon?: () => void }) {
  const { openWindow, tileWindows } = useWindowManager();

  return (
    <div
      role="menu"
      aria-label="Desktop"
      className="absolute z-[100] min-w-52 overflow-hidden rounded-[14px] border border-black/10 dark:border-white/15 bg-white/85 dark:bg-[#1c1c20]/90 py-1.5 shadow-2xl backdrop-blur-3xl animate-menu-in ring-1 ring-black/10 dark:ring-black/40 text-[12px]"
      style={{ left: x, top: y }}
    >
      <MenuItem
        label="Refresh"
        onSelect={() => {
          onClose();
        }}
      />
      <MenuItem
        label="Tile Windows"
        shortcut="⌥T"
        onSelect={() => {
          tileWindows();
          onClose();
        }}
      />
      <div className="my-1 h-px bg-black/[0.06] dark:bg-white/[0.08]" />
      <MenuItem
        label="Open Terminal"
        shortcut="⌘T"
        onSelect={() => {
          openWindow("terminal");
          onClose();
        }}
      />
      <MenuItem
        label="Open Files"
        shortcut="⌘O"
        onSelect={() => {
          openWindow("files");
          onClose();
        }}
      />
      <div className="my-1 h-px bg-black/[0.06] dark:bg-white/[0.08]" />
      <MenuItem
        label="About Kairo"
        onSelect={() => {
          openWindow("about");
          onClose();
        }}
      />
      <MenuItem
        label="Server Dashboard"
        onSelect={() => {
          openWindow("dashboard");
          onClose();
        }}
      />
      <MenuItem
        label="Settings"
        shortcut="⌘,"
        onSelect={() => {
          openWindow("settings");
          onClose();
        }}
      />
      <div className="my-1 h-px bg-black/[0.06] dark:bg-white/[0.08]" />
      <MenuItem
        label="Leave server"
        shortcut="⌘Q"
        onSelect={() => {
          onLogOut();
          onClose();
        }}
      />
    </div>
  );
}

function MenuItem({
  label,
  shortcut,
  onSelect,
}: {
  label: string;
  shortcut?: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className="flex w-[calc(100%-8px)] items-center justify-between mx-1 px-3 py-1.5 text-left rounded-md outline-none text-[12px] transition-colors hover:bg-[#007aff] hover:text-white focus-visible:bg-[#007aff] focus-visible:text-white"
      onClick={onSelect}
    >
      <span>{label}</span>
      {shortcut && <span className="text-[11px] opacity-60 ml-4 font-mono">{shortcut}</span>}
    </button>
  );
}
