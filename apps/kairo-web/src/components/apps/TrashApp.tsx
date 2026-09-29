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
import { ModalAlert } from "@/src/components/desktop/ModalAlert";

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
    <div className="flex h-full w-full flex-col bg-white dark:bg-[#161619] text-neutral-900 dark:text-neutral-100 select-none">
      <header className="flex h-11 shrink-0 items-center justify-between border-b border-black/[0.08] dark:border-white/[0.08] px-4 bg-[#fafafa] dark:bg-[#1f1f23]">
        <div className="flex items-center gap-3">
          <span className="text-[13px] font-medium text-neutral-700 dark:text-neutral-300">
            {items.length} {items.length === 1 ? "item" : "items"}
            {items.length > 0 && ` (${formatSize(totalBytes)})`}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {selectedItem && (
            <>
              <button
                type="button"
                disabled={isProcessing}
                onClick={() => handleRestore(selectedItem)}
                className="flex items-center gap-1.5 rounded-lg border border-black/10 dark:border-white/10 bg-white/80 dark:bg-white/10 px-2.5 py-1 text-[12px] font-medium text-neutral-800 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-white/15 transition-colors shadow-sm"
              >
                <RotateCcw className="size-3.5" />
                <span>Put Back</span>
              </button>
              <button
                type="button"
                disabled={isProcessing}
                onClick={() => setDeleteAlertItem(selectedItem)}
                className="flex items-center gap-1.5 rounded-lg border border-red-500/20 bg-red-500/10 px-2.5 py-1 text-[12px] font-medium text-red-600 dark:text-red-400 hover:bg-red-500/20 transition-colors shadow-sm"
              >
                <Trash2 className="size-3.5" />
                <span>Delete Immediately</span>
              </button>
            </>
          )}

          <button
            type="button"
            disabled={items.length === 0 || isProcessing}
            onClick={() => setEmptyAlertOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-black/10 dark:border-white/10 bg-white/80 dark:bg-white/10 px-2.5 py-1 text-[12px] font-medium text-neutral-800 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-white/15 disabled:opacity-40 transition-colors shadow-sm"
          >
            <Trash2 className="size-3.5 text-neutral-500" />
            <span>Empty Trash</span>
          </button>
        </div>
      </header>

      {items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
          <div className="size-16 rounded-full bg-black/[0.04] dark:bg-white/[0.06] flex items-center justify-center mb-3">
            <Trash2 className="size-8 text-neutral-400 dark:text-neutral-500" />
          </div>
          <h3 className="text-[15px] font-semibold text-neutral-800 dark:text-neutral-200">
            Trash is Empty
          </h3>
          <p className="text-[12px] text-neutral-500 dark:text-neutral-400 mt-1 max-w-sm leading-relaxed">
            Items moved to the Trash from the File Manager will appear here before being permanently erased.
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          <div className="min-w-[600px]">
            <div className="sticky top-0 z-10 grid grid-cols-12 gap-2 border-b border-black/[0.08] dark:border-white/[0.08] bg-[#f2f2f4] dark:bg-[#202024] px-4 py-1.5 text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
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
                    className={`grid grid-cols-12 gap-2 items-center rounded-lg px-3 py-1.5 text-[12px] cursor-default transition-colors ${
                      isSelected
                        ? "bg-[#007aff] text-white shadow-sm font-medium"
                        : "text-neutral-800 dark:text-neutral-200 hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                    }`}
                  >
                    <div className="col-span-5 flex items-center gap-2 min-w-0">
                      {item.isDir ? (
                        <MacFolderIcon name={item.name} className="size-4.5 shrink-0" />
                      ) : (
                        <TrashFileIcon name={item.name} isSelected={isSelected} />
                      )}
                      <span className="truncate">{item.name}</span>
                    </div>

                    <div
                      className={`col-span-3 truncate text-[11px] font-mono ${
                        isSelected ? "text-white/85" : "text-neutral-500 dark:text-neutral-400"
                      }`}
                    >
                      {item.originalPath}
                    </div>

                    <div
                      className={`col-span-2 truncate text-[11px] ${
                        isSelected ? "text-white/85" : "text-neutral-500 dark:text-neutral-400"
                      }`}
                    >
                      {formatModified(item.deletedAt)}
                    </div>

                    <div
                      className={`col-span-2 truncate text-right text-[11px] ${
                        isSelected ? "text-white/85" : "text-neutral-500 dark:text-neutral-400"
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

      <ModalAlert
        open={emptyAlertOpen}
        title="Empty Trash?"
        message="Are you sure you want to permanently erase all items in the Trash? You cannot undo this action."
        confirmLabel="Empty Trash"
        confirmDestructive={true}
        cancelLabel="Cancel"
        onConfirm={handleEmptyTrash}
        onCancel={() => setEmptyAlertOpen(false)}
        layout="stacked"
      />

      <ModalAlert
        open={Boolean(deleteAlertItem)}
        title="Delete Immediately?"
        message={`Are you sure you want to permanently delete "${deleteAlertItem?.name}"? You cannot undo this action.`}
        confirmLabel="Delete"
        confirmDestructive={true}
        cancelLabel="Cancel"
        onConfirm={() => deleteAlertItem && handlePermanentDelete(deleteAlertItem)}
        onCancel={() => setDeleteAlertItem(null)}
        layout="stacked"
      />
    </div>
  );
}

function TrashFileIcon({ name, isSelected }: { name: string; isSelected: boolean }) {
  const ext = name.split(".").pop()?.toLowerCase();
  const cls = `size-4 shrink-0 ${isSelected ? "text-white" : "text-neutral-500 dark:text-neutral-400"}`;

  if (["jpg", "jpeg", "png", "webp", "gif", "svg"].includes(ext || "")) {
    return <FileImage className={cls} />;
  }
  if (["mp4", "mov", "webm", "mkv"].includes(ext || "")) {
    return <FileVideo className={cls} />;
  }
  if (["mp3", "wav", "ogg", "flac"].includes(ext || "")) {
    return <FileAudio className={cls} />;
  }
  if (["js", "ts", "tsx", "jsx", "rs", "py", "json", "sh", "yaml", "yml"].includes(ext || "")) {
    return <FileCode className={cls} />;
  }
  if (["txt", "md", "csv", "log"].includes(ext || "")) {
    return <FileText className={cls} />;
  }
  return <FileIcon className={cls} />;
}
