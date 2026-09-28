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
      className="fixed z-[120] min-w-52 overflow-hidden rounded-[16px] border py-1.5 shadow-[0_20px_50px_rgba(0,0,0,0.3)] backdrop-blur-3xl animate-menu-in select-none"
      style={{
        left: x,
        top: y,
        background: "var(--menu-bg)",
        borderColor: "var(--menu-border)",
        color: "var(--menu-fg)",
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
      <div className="my-1.5 h-px bg-black/[0.08] dark:bg-white/[0.08]" />
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
          <div className="my-1.5 h-px bg-black/[0.08] dark:bg-white/[0.08]" />
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
      className="flex w-[calc(100%-12px)] items-center justify-between mx-1.5 px-3 py-1.5 text-left rounded-[8px] outline-none text-[13px] font-normal transition-colors hover:bg-[#007aff] hover:!text-white focus-visible:bg-[#007aff] focus-visible:!text-white group"
      onClick={onSelect}
    >
      <span>{label}</span>
      {shortcut && <span className="text-[11px] opacity-50 group-hover:opacity-100">{shortcut}</span>}
    </button>
  );
}
