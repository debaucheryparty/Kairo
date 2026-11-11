"use client";

import { useState } from "react";
import {
  RotateCcw,
  Trash2,
  AlertTriangle,
  FileText,
  FileCode,
  FileImage,
  FileAudio,
  FileVideo,
  File as FileIcon,
} from "lucide-react";
import { useSelectedServer } from "@/src/lib/session";
import { useTrash, type TrashItem } from "@/src/lib/files/trash";
import { formatModified, formatSize } from "@/src/lib/files/format";
import { MacFolderIcon } from "@/src/components/brand/MacFolderIcon";
import { M3Button, M3IconButton, M3Dialog } from "@/src/components/m3";

export function TrashApp() {
  const selectedServer = useSelectedServer();
  const serverId = selectedServer?.id || "";
  const { items, restoreItem, deleteItem, emptyAll } = useTrash(serverId);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [emptyAlertOpen, setEmptyAlertOpen] = useState(false);
  const [deleteAlertItem, setDeleteAlertItem] = useState<TrashItem | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const selectedItem = items.find((x) => x.id === selectedId) || null;
  const totalBytes = items.reduce((acc, x) => acc + x.size, 0);

  async function handleRestore(item: TrashItem) {
    setIsProcessing(true);
    try {
      await restoreItem(item);
      if (selectedId === item.id) setSelectedId(null);
    } finally {
      setIsProcessing(false);
    }
  }

  async function handlePermanentDelete(item: TrashItem) {
    setIsProcessing(true);
    try {
      await deleteItem(item);
      if (selectedId === item.id) setSelectedId(null);
    } finally {
      setIsProcessing(false);
      setDeleteAlertItem(null);
    }
  }

  async function handleEmptyTrash() {
    setIsProcessing(true);
    try {
      await emptyAll();
      setSelectedId(null);
    } finally {
      setIsProcessing(false);
      setEmptyAlertOpen(false);
    }
  }

  return (
    <div className="flex h-full w-full flex-col bg-[var(--md-sys-color-surface)] text-[var(--md-sys-color-on-surface)] select-none font-google-sans">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--md-sys-color-outline-variant)]/20 px-4 bg-[var(--md-sys-color-surface-container)]">
        <div className="flex items-center gap-3">
          <span className="text-[13px] font-semibold text-[var(--md-sys-color-on-surface-variant)]">
            {items.length} {items.length === 1 ? "item" : "items"}
            {items.length > 0 && ` (${formatSize(totalBytes)})`}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {selectedItem && (
            <>
              <M3Button
                variant="tonal"
                disabled={isProcessing}
                onClick={() => handleRestore(selectedItem)}
                icon="restore"
                className="!h-8 !px-3 !text-xs"
              >
                Put Back
              </M3Button>
              <M3Button
                variant="outlined"
                disabled={isProcessing}
                onClick={() => setDeleteAlertItem(selectedItem)}
                icon="delete_forever"
                className="!h-8 !px-3 !text-xs !text-[var(--md-sys-color-error)] !border-[var(--md-sys-color-error)]/40"
              >
                Delete
              </M3Button>
            </>
          )}

          <M3Button
            variant="filled"
            disabled={items.length === 0 || isProcessing}
            onClick={() => setEmptyAlertOpen(true)}
            icon="delete_sweep"
            className="!h-8 !px-3.5 !text-xs"
          >
            Empty Trash
          </M3Button>
        </div>
      </header>

      {items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
          <div className="size-16 rounded-full bg-[var(--md-sys-color-surface-container-highest)] flex items-center justify-center mb-3 text-[var(--md-sys-color-outline)]">
            <span className="material-symbol text-[32px]">delete</span>
          </div>
          <h3 className="text-[16px] font-bold text-[var(--md-sys-color-on-surface)]">
            Trash is Empty
          </h3>
          <p className="text-[13px] text-[var(--md-sys-color-on-surface-variant)] mt-1 max-w-sm leading-relaxed">
            Items moved to the Trash from the File Manager will appear here before being permanently erased.
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          <div className="min-w-[600px]">
            <div className="sticky top-0 z-10 grid grid-cols-12 gap-2 border-b border-[var(--md-sys-color-outline-variant)]/20 bg-[var(--md-sys-color-surface-container)] px-4 py-2 text-[11px] font-bold text-[var(--md-sys-color-on-surface-variant)]">
              <span className="col-span-5">Name</span>
              <span className="col-span-3">Original Location</span>
              <span className="col-span-2">Date Deleted</span>
              <span className="col-span-2 text-right">Size</span>
            </div>

            <div className="p-1 space-y-0.5">
              {items.map((item) => {
                const isSelected = selectedId === item.id;
                return (
                  <div
                    key={item.id}
                    onClick={() => setSelectedId(item.id)}
                    onDoubleClick={() => handleRestore(item)}
                    className={`m3-state-layer grid grid-cols-12 gap-2 items-center rounded-[10px] px-3.5 py-2 text-[12px] cursor-pointer transition-all ${
                      isSelected
                        ? "bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)] font-bold shadow-sm"
                        : "text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container-high)]"
                    }`}
                  >
                    <div className="col-span-5 flex items-center gap-2.5 min-w-0">
                      {item.isDir ? (
                        <MacFolderIcon name={item.name} className="size-4.5 shrink-0" />
                      ) : (
                        <TrashFileIcon name={item.name} isSelected={isSelected} />
                      )}
                      <span className="truncate">{item.name}</span>
                    </div>

                    <div
                      className={`col-span-3 truncate text-[11px] font-mono ${
                        isSelected ? "text-inherit opacity-90" : "text-[var(--md-sys-color-on-surface-variant)]"
                      }`}
                    >
                      {item.originalPath}
                    </div>

                    <div
                      className={`col-span-2 truncate text-[11px] ${
                        isSelected ? "text-inherit opacity-90" : "text-[var(--md-sys-color-on-surface-variant)]"
                      }`}
                    >
                      {formatModified(item.deletedAt)}
                    </div>

                    <div
                      className={`col-span-2 truncate text-right text-[11px] ${
                        isSelected ? "text-inherit opacity-90" : "text-[var(--md-sys-color-on-surface-variant)]"
                      }`}
                    >
                      {item.isDir ? "—" : formatSize(item.size)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <M3Dialog
        open={emptyAlertOpen}
        onClose={() => setEmptyAlertOpen(false)}
        icon="delete_sweep"
        headline="Empty Trash?"
        supportingText="Are you sure you want to permanently erase all items in the Trash? You cannot undo this action."
        confirmLabel="Empty Trash"
        cancelLabel="Cancel"
        onConfirm={handleEmptyTrash}
      />

      <M3Dialog
        open={Boolean(deleteAlertItem)}
        onClose={() => setDeleteAlertItem(null)}
        icon="delete_forever"
        headline="Delete Immediately?"
        supportingText={`Are you sure you want to permanently delete "${deleteAlertItem?.name}"? You cannot undo this action.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={() => deleteAlertItem && handlePermanentDelete(deleteAlertItem)}
      />
    </div>
  );
}

function TrashFileIcon({ name, isSelected }: { name: string; isSelected: boolean }) {
  const ext = name.split(".").pop()?.toLowerCase();
  let symbol = "draft";

  if (["jpg", "jpeg", "png", "webp", "gif", "svg"].includes(ext || "")) {
    symbol = "image";
  } else if (["mp4", "mov", "webm", "mkv"].includes(ext || "")) {
    symbol = "movie";
  } else if (["mp3", "wav", "ogg", "flac"].includes(ext || "")) {
    symbol = "audiotrack";
  } else if (["pdf"].includes(ext || "")) {
    symbol = "picture_as_pdf";
  } else if (["js", "ts", "tsx", "jsx", "rs", "py", "json", "sh", "yaml", "yml"].includes(ext || "")) {
    symbol = "code";
  } else if (["txt", "md", "csv", "log"].includes(ext || "")) {
    symbol = "description";
  } else if (["zip", "tar", "gz", "7z"].includes(ext || "")) {
    symbol = "folder_zip";
  }

  return (
    <span
      className={`material-symbol text-[19px] shrink-0 select-none ${
        isSelected
          ? "text-[var(--md-sys-color-on-primary-container)]"
          : "text-[var(--md-sys-color-on-surface-variant)] opacity-80"
      }`}
      data-fill="1"
      aria-hidden="true"
    >
      {symbol}
    </span>
  );
}
