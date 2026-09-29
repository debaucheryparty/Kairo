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
import { useSelectedServer } from "@/src/lib/session";
import { formatSize, totalSize } from "@/src/lib/files/format";
import { moveToTrash, useTrash } from "@/src/lib/files/trash";
import { MacFolderIcon } from "@/src/components/brand/MacFolderIcon";
import { FileContextMenu } from "@/src/components/apps/files/FileContextMenu";
import { FileList } from "@/src/components/apps/files/FileList";
import { ModalAlert } from "@/src/components/desktop/ModalAlert";

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
  const homePath =
    selectedServer?.username || server?.username
      ? `/home/${selectedServer?.username || server?.username}`
      : "/home/root";
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

  const uploadRef = useRef<HTMLInputElement>(null);
  const serverId = selectedServer?.id || "";
  const { count: trashCount } = useTrash(serverId);

  async function load(nextPath: string) {
    if (!serverId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await listFiles(serverId, nextPath);
      const sorted = [...result.entries].sort((a, b) => {
        if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      setEntries(sorted);
      setPath(result.path || nextPath);
    } catch (err) {
      setEntries([]);
      setError(err instanceof ApiError ? err.message : "unable to list files");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!serverId) return;
    let cancelled = false;
    listFiles(serverId, homePath)
      .then((result) => {
        if (cancelled) return;
        const sorted = [...result.entries].sort((a, b) => {
          if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
        setEntries(sorted);
        setPath(result.path || homePath);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setEntries([]);
        setError(err instanceof ApiError ? err.message : "unable to list files");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [serverId]);

  function goTo(nextPath: string) {
    if (nextPath === path) return;
    const nextHistory = history.slice(0, historyIndex + 1);
    nextHistory.push(nextPath);
    setHistory(nextHistory);
    setHistoryIndex(nextHistory.length - 1);
    setSelected(null);
    void load(nextPath);
  }

  function back() {
    if (historyIndex <= 0) return;
    const nextIndex = historyIndex - 1;
    setHistoryIndex(nextIndex);
    setSelected(null);
    void load(history[nextIndex]);
  }

  function forward() {
    if (historyIndex >= history.length - 1) return;
    const nextIndex = historyIndex + 1;
    setHistoryIndex(nextIndex);
    setSelected(null);
    void load(history[nextIndex]);
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

  function toggleExpandPath(itemPath: string) {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(itemPath)) next.delete(itemPath);
      else next.add(itemPath);
      return next;
    });
  }

  function openSelected() {
    const entry = selectedEntry;
    if (!entry) return;
    openEntry(entry);
  }

  const selectedEntry = entries.find((entry) => entry.path === selected) || null;
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return entries;
    return entries.filter((entry) => entry.name.toLowerCase().includes(needle));
  }, [entries, query]);

  async function submitDialog() {
    if (!dialog || !dialog.value.trim()) return;
    const name = dialog.value.trim();
    try {
      if (dialog.type === "file") {
        await createFile(serverId, joinPath(path, name));
      } else if (dialog.type === "dir") {
        await createDirectory(serverId, joinPath(path, name));
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
      await uploadFile(serverId, path, file);
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
      className="relative flex h-full min-h-0 overflow-hidden bg-white/80 dark:bg-[#1a1a1e]/85 text-neutral-800 dark:text-neutral-200 select-none backdrop-blur-3xl"
      onClick={() => setMenu(null)}
      onKeyDown={(event) => {
        if (event.key === "Enter") openSelected();
      }}
    >
      {sidebarOpen && (
        <aside className="flex w-[210px] shrink-0 flex-col overflow-y-auto border-r border-black/[0.06] dark:border-white/[0.08] bg-black/[0.02] dark:bg-black/20 p-2.5 text-[13px]">
          <div className="flex items-center justify-between px-2 py-1.5 mb-1">
            <span className="text-[11px] font-semibold tracking-wider uppercase text-neutral-400 dark:text-neutral-500">
              Favorites
            </span>
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              className="rounded p-1 text-neutral-400 hover:text-neutral-700 dark:hover:text-white transition-colors"
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
                  className={`flex w-full items-center gap-2 rounded-[8px] px-2.5 py-1.5 text-left text-[13px] outline-none transition-colors ${
                    active
                      ? "bg-black/[0.08] dark:bg-white/[0.12] font-medium text-neutral-900 dark:text-white shadow-sm"
                      : "text-neutral-700 dark:text-neutral-300 hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                  }`}
                  onClick={() => goTo(fav.path)}
                >
                  <MacFolderIcon name={fav.label} type={fav.type} className="size-4.5 shrink-0" />
                  <span className="truncate">{fav.label}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-4 pt-3 border-t border-black/[0.06] dark:border-white/[0.08]">
            <button
              type="button"
              onClick={() => setSectionOpen((prev) => !prev)}
              className="flex w-full items-center justify-between px-2 py-1 mb-1 text-[11px] font-semibold tracking-wider uppercase text-neutral-400 dark:text-neutral-500 outline-none"
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
                  className={`flex w-full items-center gap-2 rounded-[8px] px-2.5 py-1.5 text-left text-[13px] outline-none transition-colors ${
                    path === "/"
                      ? "bg-black/[0.08] dark:bg-white/[0.12] font-medium text-neutral-900 dark:text-white shadow-sm"
                      : "text-neutral-700 dark:text-neutral-300 hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                  }`}
                  onClick={() => goTo("/")}
                >
                  <MacFolderIcon name="root" className="size-4 shrink-0" />
                  <span className="truncate">Root Volume</span>
                </button>
                <button
                  type="button"
                  className={`flex w-full items-center gap-2 rounded-[8px] px-2.5 py-1.5 text-left text-[13px] outline-none transition-colors ${
                    path === homePath
                      ? "bg-black/[0.08] dark:bg-white/[0.12] font-medium text-neutral-900 dark:text-white shadow-sm"
                      : "text-neutral-700 dark:text-neutral-300 hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                  }`}
                  onClick={() => goTo(homePath)}
                >
                  <MacFolderIcon name="home" className="size-4 shrink-0" />
                  <span className="truncate">Home Volume</span>
                </button>
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-[8px] px-2.5 py-1.5 text-left text-[13px] outline-none text-neutral-700 dark:text-neutral-300 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors"
                  onClick={() => openWindow("trash")}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Trash2 aria-hidden className="size-4 shrink-0 text-neutral-500" />
                    <span className="truncate">Trash</span>
                  </div>
                  {trashCount > 0 && (
                    <span className="rounded-full bg-black/10 dark:bg-white/10 px-1.5 py-0.2 text-[10px] font-medium text-neutral-500">
                      {trashCount}
                    </span>
                  )}
                </button>
              </div>
            )}
          </div>
        </aside>
      )}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex h-11 shrink-0 items-center justify-between border-b border-black/[0.06] dark:border-white/[0.08] px-3.5 bg-black/[0.01] dark:bg-white/[0.02]">
          <div className="flex items-center gap-2 min-w-0">
            {!sidebarOpen && (
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className="rounded p-1 text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition-colors"
                title="Show Sidebar"
              >
                <PanelLeft className="size-4" />
              </button>
            )}

            <div className="flex items-center gap-0.5">
              <button
                type="button"
                aria-label="Back"
                className="rounded-full p-1 text-neutral-600 dark:text-neutral-300 hover:bg-black/10 dark:hover:bg-white/10 disabled:opacity-30 transition-colors"
                onClick={back}
                disabled={historyIndex <= 0}
              >
                <ChevronLeft className="size-4" />
              </button>
              <button
                type="button"
                aria-label="Forward"
                className="rounded-full p-1 text-neutral-600 dark:text-neutral-300 hover:bg-black/10 dark:hover:bg-white/10 disabled:opacity-30 transition-colors"
                onClick={forward}
                disabled={historyIndex >= history.length - 1}
              >
                <ChevronRight className="size-4" />
              </button>
            </div>

            <h2 className="ml-1 text-[14px] font-semibold text-neutral-900 dark:text-neutral-100 truncate">
              {currentFolderTitle}
            </h2>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setDialog({ type: "dir", value: "" })}
              className="rounded-lg p-1.5 text-neutral-600 dark:text-neutral-300 hover:bg-black/8 dark:hover:bg-white/10 transition-colors"
              title="New Folder"
            >
              <FolderPlus className="size-4" />
            </button>

            <button
              type="button"
              onClick={() => setDialog({ type: "file", value: "" })}
              className="rounded-lg p-1.5 text-neutral-600 dark:text-neutral-300 hover:bg-black/8 dark:hover:bg-white/10 transition-colors"
              title="New File"
            >
              <FilePlus className="size-4" />
            </button>

            <button
              type="button"
              disabled={!selectedEntry}
              onClick={() => handleMoveToTrash(selectedEntry)}
              className="rounded-lg p-1.5 text-neutral-600 dark:text-neutral-300 hover:bg-black/8 dark:hover:bg-white/10 disabled:opacity-30 transition-colors"
              title="Move to Trash"
            >
              <Trash2 className="size-4" />
            </button>

            <button
              type="button"
              disabled={!selectedEntry || selectedEntry.type !== "file"}
              onClick={() => {
                if (selectedEntry?.type === "file") {
                  window.location.href = downloadUrl(serverId, selectedEntry.path);
                }
              }}
              className="rounded-lg p-1.5 text-neutral-600 dark:text-neutral-300 hover:bg-black/8 dark:hover:bg-white/10 disabled:opacity-30 transition-colors"
              title="Download File"
            >
              <Download className="size-4" />
            </button>

            <button
              type="button"
              disabled={!selectedEntry}
              onClick={() => openInfo(selectedEntry)}
              className="rounded-lg p-1.5 text-neutral-600 dark:text-neutral-300 hover:bg-black/8 dark:hover:bg-white/10 disabled:opacity-30 transition-colors"
              title="Get Info"
            >
              <Info className="size-4" />
            </button>

            <div className="relative ml-1">
              <Search className="pointer-events-none absolute left-2.5 top-2 size-3.5 text-neutral-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search"
                className="w-36 rounded-full border border-black/10 dark:border-white/15 bg-black/[0.04] dark:bg-white/[0.08] py-1 pl-8 pr-6 text-[12px] text-neutral-800 dark:text-neutral-200 placeholder-neutral-400 outline-none focus:w-44 focus:ring-2 focus:ring-[#007aff]/50 transition-all"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-2 top-2 text-neutral-400 hover:text-neutral-700 dark:hover:text-white"
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
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center text-[13px] text-neutral-400">
            <MacFolderIcon className="size-12 mb-2 opacity-50" />
            <span>This folder is empty</span>
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
          />
        )}

        <footer className="flex h-7 shrink-0 items-center justify-between border-t border-black/[0.06] dark:border-white/[0.08] px-4 text-[11px] text-neutral-500 dark:text-neutral-400 bg-black/[0.01] dark:bg-white/[0.02]">
          <span>
            {visible.length} {visible.length === 1 ? "item" : "items"}
          </span>
          <span>{formatSize(totalSize(visible))}</span>
        </footer>
      </div>

      {dialog && (
        <div
          role="dialog"
          aria-modal="true"
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/25 backdrop-blur-[3px] animate-fade-in"
          onClick={() => setDialog(null)}
        >
          <div
            className="w-[320px] rounded-[20px] p-5 shadow-[0_24px_60px_rgba(0,0,0,0.35)] backdrop-blur-3xl border border-black/10 dark:border-white/15 bg-white/95 dark:bg-[#242428]/95 text-neutral-900 dark:text-neutral-100 animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-center text-[13px] font-semibold mb-1">
              {dialog.type === "dir"
                ? "New Folder"
                : dialog.type === "file"
                  ? "New File"
                  : "Rename Item"}
            </h3>
            <p className="text-center text-[11px] opacity-70 mb-3.5">
              Enter a name for this {dialog.type === "dir" ? "folder" : "file"}.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void submitDialog();
              }}
            >
              <input
                autoFocus
                className="w-full rounded-lg border border-black/15 dark:border-white/20 bg-black/[0.03] dark:bg-white/[0.08] px-3 py-1.5 text-[13px] text-neutral-900 dark:text-neutral-100 outline-none focus:border-[#007aff] focus:ring-1 focus:ring-[#007aff]"
                value={dialog.value}
                onChange={(e) => setDialog({ ...dialog, value: e.target.value })}
              />

              <div className="flex items-center gap-2 mt-4">
                <button
                  type="button"
                  onClick={() => setDialog(null)}
                  className="flex-1 rounded-full bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/15 py-1.5 text-[12px] font-medium text-neutral-800 dark:text-neutral-200 transition-colors outline-none"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded-full bg-[#007aff] hover:bg-[#0071eb] py-1.5 text-[12px] font-medium text-white shadow-sm transition-colors outline-none"
                >
                  {dialog.type === "rename" ? "Rename" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
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
              window.location.href = downloadUrl(serverId, menu.entry.path);
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
