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
      className="absolute z-[100] min-w-56 overflow-hidden rounded-[16px] border py-1.5 shadow-[0_20px_50px_rgba(0,0,0,0.3)] backdrop-blur-3xl animate-menu-in select-none text-[13px]"
      style={{
        left: x,
        top: y,
        background: "var(--menu-bg)",
        borderColor: "var(--menu-border)",
        color: "var(--menu-fg)",
      }}
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
      <div className="my-1.5 h-px bg-black/[0.08] dark:bg-white/[0.08]" />
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
      <div className="my-1.5 h-px bg-black/[0.08] dark:bg-white/[0.08]" />
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
      <div className="my-1.5 h-px bg-black/[0.08] dark:bg-white/[0.08]" />
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
      className="flex w-[calc(100%-12px)] items-center justify-between mx-1.5 px-3 py-1.5 text-left rounded-[8px] outline-none text-[13px] font-normal transition-colors hover:bg-[#007aff] hover:!text-white focus-visible:bg-[#007aff] focus-visible:!text-white group/item"
      onClick={onSelect}
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
