"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  FilePlus,
  FolderPlus,
  Info,
  PanelLeft,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { ApiError } from "@/src/lib/api/client";
import {
  createDirectory,
  createFile,
  downloadUrl,
  joinPath,
  listFiles,
  parentPath,
  renameFile,
  uploadFile,
  type FileEntry,
} from "@/src/lib/api/files";
import { useWindowManager } from "@/src/components/window/window-context";
import { useServer } from "@/src/lib/api/server-context";
import { platform } from "@platform";
import { useRuntimeClient, useSelectedServer } from "@/src/lib/session";
import { formatSize, totalSize } from "@/src/lib/files/format";
import { moveToTrash, useTrash } from "@/src/lib/files/trash";
import { MacFolderIcon } from "@/src/components/brand/MacFolderIcon";
import { FileContextMenu } from "@/src/components/apps/files/FileContextMenu";
import { FileList } from "@/src/components/apps/files/FileList";
import { M3IconButton, M3Button, M3Dialog, M3TextField } from "@/src/components/m3";

type Dialog =
  | { type: "file"; value: string }
  | { type: "dir"; value: string }
  | { type: "rename"; value: string; from: string };

type MenuState = {
  x: number;
  y: number;
  entry: FileEntry | null;
};

export function FilesApp() {
  const { openWindow } = useWindowManager();
  const { server } = useServer();
  const selectedServer = useSelectedServer();
  const runtimeClient = useRuntimeClient();
  const rawUser = selectedServer?.username || server?.username;
  const detectedHome =
    runtimeClient?.getHomeDirectory() ||
    runtimeClient?.getSession()?.capabilities.find((c) => c.startsWith("home:"))?.slice(5);
  const [detectedUserHome, setDetectedUserHome] = useState<string | null>(null);
  const homePath =
    detectedHome ||
    detectedUserHome ||
    (rawUser === "root" ? "/root" : rawUser ? `/home/${rawUser}` : "/");
  const [path, setPath] = useState(homePath);
  const [history, setHistory] = useState<string[]>([homePath]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sectionOpen, setSectionOpen] = useState(true);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [expandedEntries, setExpandedEntries] = useState<Record<string, FileEntry[]>>({});
  const [loadingPaths, setLoadingPaths] = useState<Set<string>>(new Set());

  const uploadRef = useRef<HTMLInputElement>(null);
  const serverId = selectedServer?.id || "";
  const { count: trashCount } = useTrash(serverId);

  async function load(nextPath: string) {
    if (!serverId) return;
    setError(null);
    try {
      const result = await listFiles(serverId, nextPath, runtimeClient);
      const sorted = result.entries
        .filter((e) => e.name !== ".keep")
        .sort((a, b) => {
          if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
      setEntries(sorted);
      setPath(result.path || nextPath);
      setExpandedEntries((prev) => ({ ...prev, [result.path || nextPath]: sorted }));

      if (nextPath !== path) {
        setExpandedPaths(new Set());
      }
    } catch {
      setEntries([]);
      setPath(nextPath);
      setError(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!serverId) return;
    let cancelled = false;
    listFiles(serverId, homePath, runtimeClient)
      .then((result) => {
        if (cancelled) return;
        const sorted = result.entries
          .filter((e) => e.name !== ".keep")
          .sort((a, b) => {
            if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
            return a.name.localeCompare(b.name);
          });
        setEntries(sorted);
        setPath(result.path || homePath);
        setError(null);
      })
      .catch(async () => {
        if (cancelled) return;
        try {
          const homeList = await listFiles(serverId, "/home", runtimeClient);
          const firstUser = homeList.entries.find((e) => e.type === "dir" && !e.name.startsWith("."));
          if (firstUser && !cancelled) {
            const userHome = `/home/${firstUser.name}`;
            setDetectedUserHome(userHome);
            const userResult = await listFiles(serverId, userHome, runtimeClient);
            const sorted = userResult.entries
              .filter((e) => e.name !== ".keep")
              .sort((a, b) => {
                if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
                return a.name.localeCompare(b.name);
              });
            setEntries(sorted);
            setPath(userHome);
            setError(null);
            return;
          }
        } catch {}

        if (homePath !== "/" && !cancelled) {
          listFiles(serverId, "/", runtimeClient)
            .then((result) => {
              if (cancelled) return;
              const sorted = result.entries
                .filter((e) => e.name !== ".keep")
                .sort((a, b) => {
                  if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
                  return a.name.localeCompare(b.name);
                });
              setEntries(sorted);
              setPath("/");
              setError(null);
            })
            .catch(() => {
              if (cancelled) return;
              setEntries([]);
              setError(null);
            })
            .finally(() => {
              if (!cancelled) setLoading(false);
            });
          return;
        }
        setEntries([]);
        setError(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [serverId, homePath, runtimeClient]);

  useEffect(() => {
    if (!runtimeClient?.getSession()) return;
    let unsubscribe: (() => void) | undefined;
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;

    void runtimeClient
      .watchDirectory(path, false)
      .then(() => {
        unsubscribe = runtimeClient.onFileEvent((event) => {
          const eventDir = event.path.slice(0, event.path.lastIndexOf("/")) || "/";
          if (eventDir === path || event.path === path) {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
              void load(path);
            }, 300);
          }
        });
      })
      .catch(() => undefined);

    return () => {
      clearTimeout(debounceTimer);
      unsubscribe?.();
    };
  }, [runtimeClient, path]);

  function goTo(nextPath: string) {
    if (nextPath === path) return;
    const nextHistory = history.slice(0, historyIndex + 1);
    nextHistory.push(nextPath);
    setHistory(nextHistory);
    setHistoryIndex(nextHistory.length - 1);
    setSelected(null);
    if (expandedEntries[nextPath]) {
      setEntries(expandedEntries[nextPath]);
      setPath(nextPath);
      setError(null);
    }
    void load(nextPath);
  }

  function back() {
    if (historyIndex <= 0) return;
    const nextIndex = historyIndex - 1;
    setHistoryIndex(nextIndex);
    setSelected(null);
    const target = history[nextIndex];
    if (expandedEntries[target]) {
      setEntries(expandedEntries[target]);
      setPath(target);
      setError(null);
    }
    void load(target);
  }

  function forward() {
    if (historyIndex >= history.length - 1) return;
    const nextIndex = historyIndex + 1;
    setHistoryIndex(nextIndex);
    setSelected(null);
    const target = history[nextIndex];
    if (expandedEntries[target]) {
      setEntries(expandedEntries[target]);
      setPath(target);
      setError(null);
    }
    void load(target);
  }

  function openEntry(entry: FileEntry) {
    if (entry.type === "dir") {
      goTo(entry.path);
      return;
    }
    openWindow("viewer", {
      filePath: entry.path,
      fileName: entry.name,
      fileSize: entry.size,
      modified: entry.modified,
      mime: entry.mime,
      isDirectory: false,
    });
  }

  async function toggleExpandPath(itemPath: string) {
    if (expandedPaths.has(itemPath)) {
      setExpandedPaths((prev) => {
        const next = new Set(prev);
        next.delete(itemPath);
        return next;
      });
      return;
    }

    setExpandedPaths((prev) => new Set(prev).add(itemPath));

    if (!expandedEntries[itemPath] && serverId) {
      setLoadingPaths((prev) => new Set(prev).add(itemPath));
      try {
        const result = await listFiles(serverId, itemPath, runtimeClient);
        const sorted = result.entries
          .filter((e) => e.name !== ".keep")
          .sort((a, b) => {
            if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
            return a.name.localeCompare(b.name);
          });
        setExpandedEntries((prev) => ({ ...prev, [itemPath]: sorted }));
      } catch {
        setExpandedEntries((prev) => ({ ...prev, [itemPath]: [] }));
      } finally {
        setLoadingPaths((prev) => {
          const next = new Set(prev);
          next.delete(itemPath);
          return next;
        });
      }
    }
  }

  function openSelected() {
    const entry = selectedEntry;
    if (!entry) return;
    openEntry(entry);
  }

  const selectedEntry = useMemo(() => {
    if (!selected) return null;
    const direct = entries.find((entry) => entry.path === selected);
    if (direct) return direct;
    for (const list of Object.values(expandedEntries)) {
      const nested = list.find((entry) => entry.path === selected);
      if (nested) return nested;
    }
    return null;
  }, [entries, expandedEntries, selected]);
  const visible = useMemo(() => {
    const list = entries.filter((entry) => entry.name !== ".keep");
    const needle = query.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((entry) => entry.name.toLowerCase().includes(needle));
  }, [entries, query]);

  async function submitDialog() {
    if (!dialog || !dialog.value.trim()) return;
    const name = dialog.value.trim();
    try {
      if (dialog.type === "file") {
        await createFile(serverId, joinPath(path, name), runtimeClient);
      } else if (dialog.type === "dir") {
        await createDirectory(serverId, joinPath(path, name), runtimeClient);
      } else if (dialog.type === "rename") {
        await renameFile(serverId, dialog.from, joinPath(parentPath(dialog.from), name));
      }
      setDialog(null);
      await load(path);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "filesystem operation failed");
    }
  }

  async function handleMoveToTrash(entry: FileEntry | null) {
    const target = entry || selectedEntry;
    if (!target) return;
    try {
      await moveToTrash(serverId, target);
      setSelected(null);
      await load(path);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "failed to move item to trash");
    }
  }

  async function onUpload(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;
    try {
      await uploadFile(serverId, path, file, runtimeClient);
      await load(path);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "upload failed");
    }
  }

  function openContextMenu(event: MouseEvent, entry: FileEntry | null) {
    event.preventDefault();
    event.stopPropagation();
    if (entry) setSelected(entry.path);
    const width = 210;
    const height = 180;
    setMenu({
      x: Math.min(event.clientX, window.innerWidth - width - 8),
      y: Math.min(event.clientY, window.innerHeight - height - 8),
      entry,
    });
  }

  function copyPath(value: string) {
    void navigator.clipboard.writeText(value);
  }

  function openInfo(entry: FileEntry | null) {
    const target = entry;
    if (!target) return;
    openWindow("viewer", {
      filePath: target.path,
      fileName: target.name,
      fileSize: target.size,
      modified: target.modified,
      mime: target.mime,
      isDirectory: target.type === "dir",
      infoOnly: true,
    });
  }

  function openTerminalHere(entry: FileEntry | null) {
    const cwd = entry?.type === "dir" ? entry.path : path;
    openWindow("terminal", { cwd });
  }

  const favorites = [
    { label: "Desktop", path: `${homePath}/Desktop`, type: "desktop" as const },
    { label: "Documents", path: `${homePath}/Documents`, type: "documents" as const },
    { label: "Downloads", path: `${homePath}/Downloads`, type: "downloads" as const },
    { label: "Movies", path: `${homePath}/Movies`, type: "movies" as const },
    { label: "Music", path: `${homePath}/Music`, type: "music" as const },
    { label: "Pictures", path: `${homePath}/Pictures`, type: "pictures" as const },
    { label: "Public", path: `${homePath}/Public`, type: "public" as const },
    { label: "Code", path: `${homePath}/Code`, type: "code" as const },
  ];

  const currentFolderTitle =
    path === "/"
      ? "Root Volume"
      : path === homePath
        ? "Home"
        : path.split("/").filter(Boolean).pop() || "Files";

  return (
    <div
      className="relative flex h-full min-h-0 overflow-hidden bg-[var(--md-sys-color-surface)] text-[var(--md-sys-color-on-surface)] select-none"
      onClick={() => setMenu(null)}
      onKeyDown={(event) => {
        if (event.key === "Enter") openSelected();
      }}
    >
      {sidebarOpen && (
        <aside className="flex w-[215px] shrink-0 flex-col overflow-y-auto border-r border-[var(--md-sys-color-outline-variant)]/20 bg-[var(--md-sys-color-surface-container-low)] p-2.5 text-[13px] font-google-sans">
          <div className="flex items-center justify-between px-2 py-1.5 mb-1">
            <span className="text-[11px] font-bold tracking-wider uppercase text-[var(--md-sys-color-outline)]">
              Favorites
            </span>
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              className="m3-state-layer rounded-full p-1 text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] transition-colors"
              title="Hide Sidebar"
            >
              <PanelLeft className="size-3.5" />
            </button>
          </div>

          <div className="space-y-0.5">
            {favorites.map((fav) => {
              const active = path === fav.path;
              return (
                <button
                  key={fav.path}
                  type="button"
                  className={`m3-state-layer m3-focus-ring flex w-full items-center gap-2.5 rounded-[12px] px-3 py-2 text-left text-[13px] outline-none transition-all ${
                    active
                      ? "bg-[var(--md-sys-color-secondary-container)] text-[var(--md-sys-color-on-secondary-container)] font-bold shadow-sm"
                      : "text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)] hover:text-[var(--md-sys-color-on-surface)]"
                  }`}
                  onClick={() => goTo(fav.path)}
                >
                  <MacFolderIcon name={fav.label} type={fav.type} className="size-4.5 shrink-0" />
                  <span className="truncate">{fav.label}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-4 pt-3 border-t border-[var(--md-sys-color-outline-variant)]/20">
            <button
              type="button"
              onClick={() => setSectionOpen((prev) => !prev)}
              className="flex w-full items-center justify-between px-2 py-1 mb-1 text-[11px] font-bold tracking-wider uppercase text-[var(--md-sys-color-outline)] outline-none"
            >
              <span>Locations</span>
              <ChevronDown
                className={`size-3 transition-transform ${
                  sectionOpen ? "" : "-rotate-90"
                }`}
              />
            </button>

            {sectionOpen && (
              <div className="space-y-0.5">
                <button
                  type="button"
                  className={`m3-state-layer m3-focus-ring flex w-full items-center gap-2.5 rounded-[12px] px-3 py-2 text-left text-[13px] outline-none transition-all ${
                    path === "/"
                      ? "bg-[var(--md-sys-color-secondary-container)] text-[var(--md-sys-color-on-secondary-container)] font-bold shadow-sm"
                      : "text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)] hover:text-[var(--md-sys-color-on-surface)]"
                  }`}
                  onClick={() => goTo("/")}
                >
                  <MacFolderIcon name="root" className="size-4 shrink-0" />
                  <span className="truncate">Root Volume</span>
                </button>
                <button
                  type="button"
                  className={`m3-state-layer m3-focus-ring flex w-full items-center gap-2.5 rounded-[12px] px-3 py-2 text-left text-[13px] outline-none transition-all ${
                    path === homePath
                      ? "bg-[var(--md-sys-color-secondary-container)] text-[var(--md-sys-color-on-secondary-container)] font-bold shadow-sm"
                      : "text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)] hover:text-[var(--md-sys-color-on-surface)]"
                  }`}
                  onClick={() => goTo(homePath)}
                >
                  <MacFolderIcon name="home" className="size-4 shrink-0" />
                  <span className="truncate">Home Volume</span>
                </button>
                <button
                  type="button"
                  className="m3-state-layer m3-focus-ring flex w-full items-center justify-between rounded-[12px] px-3 py-2 text-left text-[13px] outline-none text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)] hover:text-[var(--md-sys-color-on-surface)] transition-all"
                  onClick={() => openWindow("trash")}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <MacFolderIcon name="trash" className="size-4 shrink-0" />
                    <span className="truncate">Trash</span>
                  </div>
                  {trashCount > 0 && (
                    <span className="rounded-full bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)] px-2 py-0.5 text-[10px] font-bold">
                      {trashCount}
                    </span>
                  )}
                </button>
              </div>
            )}
          </div>
        </aside>
      )}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--md-sys-color-surface)] text-[var(--md-sys-color-on-surface)] font-google-sans">
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--md-sys-color-outline-variant)]/20 px-3 bg-[var(--md-sys-color-surface-container)]">
          <div className="flex items-center gap-2 min-w-0">
            {!sidebarOpen && (
              <M3IconButton
                variant="standard"
                icon="dock_to_right"
                onClick={() => setSidebarOpen(true)}
                title="Show Sidebar"
                className="!size-8"
              />
            )}

            <div className="flex items-center gap-0.5">
              <M3IconButton
                variant="standard"
                icon="chevron_left"
                onClick={back}
                disabled={historyIndex <= 0}
                title="Back"
                className="!size-8"
              />
              <M3IconButton
                variant="standard"
                icon="chevron_right"
                onClick={forward}
                disabled={historyIndex >= history.length - 1}
                title="Forward"
                className="!size-8"
              />
            </div>

            <h2 className="ml-1 text-[14px] font-bold text-[var(--md-sys-color-on-surface)] truncate">
              {currentFolderTitle}
            </h2>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <M3IconButton
              variant="tonal"
              icon="create_new_folder"
              onClick={() => setDialog({ type: "dir", value: "" })}
              title="New Folder"
              className="!size-9"
            />
            <M3IconButton
              variant="outlined"
              icon="note_add"
              onClick={() => setDialog({ type: "file", value: "" })}
              title="New File"
              className="!size-9"
            />
            <M3IconButton
              variant="standard"
              icon="delete"
              disabled={!selectedEntry}
              onClick={() => handleMoveToTrash(selectedEntry)}
              title="Move to Trash"
              className="!size-9"
            />
            <M3IconButton
              variant="outlined"
              icon="download"
              disabled={!selectedEntry || selectedEntry.type !== "file"}
              onClick={() => {
                if (selectedEntry?.type === "file") {
                  platform.downloadFile(serverId, selectedEntry.path, downloadUrl(serverId, selectedEntry.path));
                }
              }}
              title="Download File"
              className="!size-9"
            />
            <M3IconButton
              variant="standard"
              icon="info"
              disabled={!selectedEntry}
              onClick={() => openInfo(selectedEntry)}
              title="Get Info"
              className="!size-9"
            />

            <div className="relative ml-2">
              <Search className="pointer-events-none absolute left-3 top-2.5 size-3.5 text-[var(--md-sys-color-outline)]" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search..."
                className="w-36 rounded-full border border-[var(--md-sys-color-outline-variant)]/40 bg-[var(--md-sys-color-surface-container-highest)] py-1.5 pl-8 pr-6 text-[12px] text-[var(--md-sys-color-on-surface)] placeholder-[var(--md-sys-color-outline)] outline-none focus:w-48 focus:border-[var(--md-sys-color-primary)] transition-all font-google-sans"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-2 top-2.5 text-[var(--md-sys-color-outline)] hover:text-[var(--md-sys-color-on-surface)]"
                >
                  <X className="size-3" />
                </button>
              ) : null}
            </div>
          </div>
        </header>

        <input
          ref={uploadRef}
          type="file"
          className="hidden"
          onChange={(event) => {
            void onUpload(event.target.files);
            event.target.value = "";
          }}
        />

        {error ? (
          <p
            className="border-b border-red-500/20 bg-red-500/10 px-4 py-2 text-[12px] text-red-600 dark:text-red-400"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        {loading ? (
          <div className="flex min-h-0 flex-1 items-center justify-center text-[13px] text-neutral-400">
            Loading files…
          </div>
        ) : visible.length === 0 ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center text-sm text-[var(--md-sys-color-on-surface-variant)] gap-1 select-none font-google-sans">
            <div className="size-16 rounded-[24px] bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)]/20 flex items-center justify-center text-[var(--md-sys-color-primary)] mb-2 shadow-sm">
              <span className="material-symbol text-[36px]" data-fill="1">folder_open</span>
            </div>
            <span className="font-medium text-[var(--md-sys-color-on-surface)]">This folder is empty</span>
            <span className="text-xs text-[var(--md-sys-color-outline)]">Drop files here or click + to create one</span>
          </div>
        ) : (
          <FileList
            path={path}
            entries={visible}
            selected={selected}
            onSelect={setSelected}
            onOpen={openEntry}
            onParent={() => path !== "/" && goTo(parentPath(path))}
            onContextMenu={openContextMenu}
            expandedPaths={expandedPaths}
            onToggleExpand={toggleExpandPath}
            expandedEntries={expandedEntries}
            loadingPaths={loadingPaths}
          />
        )}

        <footer className="flex h-8 shrink-0 items-center justify-between border-t border-[var(--md-sys-color-outline-variant)]/20 px-4 text-[11px] font-medium text-[var(--md-sys-color-on-surface-variant)] bg-[var(--md-sys-color-surface-container)] font-google-sans">
          <span>
            {visible.length} {visible.length === 1 ? "item" : "items"}
          </span>
          <span>{formatSize(totalSize(visible))}</span>
        </footer>
      </div>

      {dialog && (
        <M3Dialog
          open={Boolean(dialog)}
          onClose={() => setDialog(null)}
          icon={dialog.type === "dir" ? "folder" : "description"}
          headline={
            dialog.type === "dir"
              ? "New Folder"
              : dialog.type === "file"
              ? "New File"
              : "Rename Item"
          }
          supportingText={
            dialog.type === "rename"
              ? "Enter a new name for this item."
              : `Enter a name for this ${dialog.type === "dir" ? "folder" : "file"}.`
          }
          confirmLabel={dialog.type === "rename" ? "Rename" : "Create"}
          cancelLabel="Cancel"
          onConfirm={() => void submitDialog()}
        >
          <M3TextField
            autoFocus
            variant="outlined"
            label={dialog.type === "dir" ? "Folder name" : dialog.type === "file" ? "File name" : "New name"}
            value={dialog.value}
            onChange={(e) => setDialog({ ...dialog, value: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void submitDialog();
              }
            }}
            clearable
            className="w-full mt-2"
          />
        </M3Dialog>
      )}

      {menu && (
        <FileContextMenu
          x={menu.x}
          y={menu.y}
          entry={menu.entry}
          onOpen={() => {
            if (menu.entry) openEntry(menu.entry);
            else goTo(path);
          }}
          onDownload={() => {
            if (menu.entry?.type === "file") {
              platform.downloadFile(serverId, menu.entry.path, downloadUrl(serverId, menu.entry.path));
            }
          }}
          onCopyPath={() => copyPath(menu.entry?.path || path)}
          onInfo={() => openInfo(menu.entry)}
          onTerminalHere={() => openTerminalHere(menu.entry)}
          onMoveToTrash={() => handleMoveToTrash(menu.entry || selectedEntry)}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}
