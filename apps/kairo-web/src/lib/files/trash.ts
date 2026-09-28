"use client";

import { useEffect, useState, useCallback } from "react";
import {
  createDirectory,
  deleteFile,
  renameFile,
  type FileEntry,
} from "@/src/lib/api/files";

export type TrashItem = {
  id: string;
  name: string;
  originalPath: string;
  trashPath: string;
  isDir: boolean;
  size: number;
  deletedAt: string;
};

const TRASH_DIR = "/tmp/.kairo_trash";

function getStorageKey(serverId: string) {
  return `kairo_trash_${serverId || "default"}`;
}

export function loadTrashManifest(serverId: string): TrashItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(getStorageKey(serverId));
    if (!raw) return [];
    return JSON.parse(raw) as TrashItem[];
  } catch {
    return [];
  }
}

export function saveTrashManifest(serverId: string, items: TrashItem[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(getStorageKey(serverId), JSON.stringify(items));
    window.dispatchEvent(new CustomEvent("kairo:trash-updated", { detail: { serverId } }));
  } catch {}
}

export async function moveToTrash(serverId: string, entry: FileEntry): Promise<TrashItem> {
  const timestamp = Date.now();
  const safeName = entry.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const trashPath = `${TRASH_DIR}/${timestamp}_${safeName}`;

  try {
    await createDirectory(serverId, TRASH_DIR);
  } catch {}

  await renameFile(serverId, entry.path, trashPath);

  const item: TrashItem = {
    id: `${timestamp}-${Math.random().toString(36).slice(2, 7)}`,
    name: entry.name,
    originalPath: entry.path,
    trashPath,
    isDir: entry.type === "dir",
    size: entry.size,
    deletedAt: new Date().toISOString(),
  };

  const existing = loadTrashManifest(serverId);
  saveTrashManifest(serverId, [item, ...existing]);
  return item;
}

export async function restoreFromTrash(serverId: string, item: TrashItem): Promise<void> {
  await renameFile(serverId, item.trashPath, item.originalPath);
  const existing = loadTrashManifest(serverId);
  saveTrashManifest(
    serverId,
    existing.filter((x) => x.id !== item.id)
  );
}

export async function deletePermanently(serverId: string, item: TrashItem): Promise<void> {
  try {
    await deleteFile(serverId, item.trashPath);
  } catch {}
  const existing = loadTrashManifest(serverId);
  saveTrashManifest(
    serverId,
    existing.filter((x) => x.id !== item.id)
  );
}

export async function emptyTrash(serverId: string): Promise<void> {
  const existing = loadTrashManifest(serverId);
  for (const item of existing) {
    try {
      await deleteFile(serverId, item.trashPath);
    } catch {}
  }
  saveTrashManifest(serverId, []);
}

export function useTrash(serverId: string) {
  const [items, setItems] = useState<TrashItem[]>(() => loadTrashManifest(serverId));

  const refresh = useCallback(() => {
    setItems(loadTrashManifest(serverId));
  }, [serverId]);

  useEffect(() => {
    refresh();
    const handleUpdate = () => refresh();
    window.addEventListener("kairo:trash-updated", handleUpdate);
    return () => window.removeEventListener("kairo:trash-updated", handleUpdate);
  }, [refresh]);

  return {
    items,
    count: items.length,
    moveToTrash: (entry: FileEntry) => moveToTrash(serverId, entry),
    restoreItem: (item: TrashItem) => restoreFromTrash(serverId, item),
    deleteItem: (item: TrashItem) => deletePermanently(serverId, item),
    emptyAll: () => emptyTrash(serverId),
    refresh,
  };
}
