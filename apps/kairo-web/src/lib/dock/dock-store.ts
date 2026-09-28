"use client";

import { useEffect, useState, useCallback } from "react";

export type DockItem = {
  id: string;
  title: string;
  icon?: string;
  exec?: string;
  builtinAppId?: string;
};

const STORAGE_KEY = "kairo_dock_items_v2";

export const DEFAULT_DOCK_ITEMS: DockItem[] = [
  { id: "files", title: "Finder", builtinAppId: "files" },
  { id: "terminal", title: "Terminal", builtinAppId: "terminal" },
  { id: "dashboard", title: "Activity Monitor", builtinAppId: "dashboard" },
  { id: "settings", title: "System Settings", builtinAppId: "settings" },
];

export function loadDockItems(): DockItem[] {
  if (typeof window === "undefined") return DEFAULT_DOCK_ITEMS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_DOCK_ITEMS;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_DOCK_ITEMS;
    return parsed;
  } catch {
    return DEFAULT_DOCK_ITEMS;
  }
}

export function saveDockItems(items: DockItem[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    window.dispatchEvent(new CustomEvent("kairo:dock-updated"));
  } catch {}
}

export function addDockItem(item: DockItem) {
  const current = loadDockItems();
  if (current.some((x) => x.id === item.id)) return;
  saveDockItems([...current, item]);
}

export function removeDockItem(id: string) {
  if (id === "files") return;
  const current = loadDockItems();
  saveDockItems(current.filter((x) => x.id !== id));
}

export function isDockItemPinned(id: string): boolean {
  const current = loadDockItems();
  return current.some((x) => x.id === id);
}

export function useDockStore() {
  const [items, setItems] = useState<DockItem[]>(loadDockItems);

  const refresh = useCallback(() => {
    setItems(loadDockItems());
  }, []);

  useEffect(() => {
    refresh();
    const handler = () => refresh();
    window.addEventListener("kairo:dock-updated", handler);
    return () => window.removeEventListener("kairo:dock-updated", handler);
  }, [refresh]);

  return {
    dockItems: items,
    pinApp: addDockItem,
    unpinApp: removeDockItem,
    isPinned: (id: string) => items.some((x) => x.id === id),
  };
}
