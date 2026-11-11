"use client";

import type { FileEntry } from "@/src/lib/api/files";

type FileContextMenuProps = {
  x: number;
  y: number;
  entry: FileEntry | null;
  onOpen: () => void;
  onDownload?: () => void;
  onCopyPath: () => void;
  onInfo: () => void;
  onTerminalHere: () => void;
  onMoveToTrash?: () => void;
  onClose: () => void;
};

export function FileContextMenu({
  x,
  y,
  entry,
  onOpen,
  onDownload,
  onCopyPath,
  onInfo,
  onTerminalHere,
  onMoveToTrash,
  onClose,
}: FileContextMenuProps) {
  const isDir = !entry || entry.type === "dir";

  return (
    <div
      role="menu"
      aria-label="File actions"
      className="fixed z-[120] min-w-56 overflow-hidden rounded-[16px] border border-[var(--md-sys-color-outline-variant)]/30 py-1.5 shadow-[var(--md-sys-elevation-level3)] bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)] backdrop-blur-3xl animate-menu-in select-none font-google-sans"
      style={{
        left: x,
        top: y,
      }}
    >
      <MenuItem
        label="Open"
        onSelect={() => {
          onOpen();
          onClose();
        }}
      />
      {isDir ? (
        <MenuItem
          label="Open Terminal Here"
          onSelect={() => {
            onTerminalHere();
            onClose();
          }}
        />
      ) : (
        <MenuItem
          label="Download"
          onSelect={() => {
            onDownload?.();
            onClose();
          }}
        />
      )}
      <div className="my-1.5 h-px bg-[var(--md-sys-color-outline-variant)]/20" />
      <MenuItem
        label="Copy Path"
        onSelect={() => {
          onCopyPath();
          onClose();
        }}
      />
      <MenuItem
        label={isDir ? "Folder Information" : "File Information"}
        onSelect={() => {
          onInfo();
          onClose();
        }}
      />
      {entry && onMoveToTrash && (
        <>
          <div className="my-1.5 h-px bg-[var(--md-sys-color-outline-variant)]/20" />
          <MenuItem
            label="Move to Trash"
            shortcut="⌘⌫"
            onSelect={() => {
              onMoveToTrash();
              onClose();
            }}
          />
        </>
      )}
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
      className="m3-state-layer flex w-[calc(100%-12px)] items-center justify-between mx-1.5 px-3 py-2 text-left rounded-[10px] outline-none text-[13px] font-medium transition-colors hover:bg-[var(--md-sys-color-primary-container)] hover:text-[var(--md-sys-color-on-primary-container)] group"
      onClick={onSelect}
    >
      <span>{label}</span>
      {shortcut && <span className="text-[11px] opacity-60 group-hover:opacity-100 font-mono">{shortcut}</span>}
    </button>
  );
}
