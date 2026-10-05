"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Code2,
  FileCode,
  FileText,
  Folder,
  FolderOpen,
  Globe,
  Play,
  RefreshCw,
  Save,
  Search,
  Settings,
  Terminal,
  X,
} from "lucide-react";
import { useWindowManager, type WindowPayload } from "@/src/components/window/window-context";
import { useRuntimeClient, useSelectedServer } from "@/src/lib/session";
import { listFiles, readFile, writeFile, type FileEntry } from "@/src/lib/api/files";
import { getHighlightLanguage } from "@/src/lib/files/file-type";

interface OpenTab {
  path: string;
  name: string;
  content: string;
  savedContent: string;
  language: string;
}

export function EditorApp({ payload }: { payload?: WindowPayload }) {
  const { openWindow } = useWindowManager();
  const runtimeClient = useRuntimeClient();
  const selectedServer = useSelectedServer();
  const serverId = selectedServer?.id || "";

  const detectedHome =
    runtimeClient?.getHomeDirectory() ||
    runtimeClient?.getSession()?.capabilities.find((c) => c.startsWith("home:"))?.slice(5) ||
    "/home";

  const [currentDir, setCurrentDir] = useState<string>(payload?.cwd || detectedHome);
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [openTabs, setOpenTabs] = useState<OpenTab[]>([]);
  const [activeTabPath, setActiveTabPath] = useState<string | null>(null);
  const [activeSidebar, setActiveSidebar] = useState<"explorer" | "search">("explorer");
  const [searchQuery, setSearchQuery] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  // Web mode (embedded code-server or VS Code Web URL)
  const [webMode, setWebMode] = useState(false);
  const [webUrl, setWebUrl] = useState("http://localhost:8080");

  const activeTab = useMemo(
    () => openTabs.find((t) => t.path === activeTabPath),
    [openTabs, activeTabPath]
  );

  const loadDirectory = useCallback(
    async (dir: string) => {
      if (!runtimeClient?.getSession()) return;
      setLoadingFiles(true);
      try {
        const res = await listFiles(serverId, dir, runtimeClient);
        setEntries(res.entries);
      } catch {
        // Ignore listing errors
      } finally {
        setLoadingFiles(false);
      }
    },
    [runtimeClient, serverId]
  );

  useEffect(() => {
    void loadDirectory(currentDir);
  }, [currentDir, loadDirectory]);

  // Open file from payload if specified
  useEffect(() => {
    if (payload?.filePath) {
      void openFile(payload.filePath, payload.fileName || payload.filePath.split("/").pop() || "file");
    }
  }, [payload?.filePath]);

  const openFile = useCallback(
    async (filePath: string, fileName: string) => {
      const existing = openTabs.find((t) => t.path === filePath);
      if (existing) {
        setActiveTabPath(filePath);
        return;
      }

      if (!runtimeClient?.getSession()) return;

      try {
        const fileData = await readFile(serverId, filePath, runtimeClient);
        const lang = getHighlightLanguage(fileName);
        const newTab: OpenTab = {
          path: filePath,
          name: fileName,
          content: fileData.content,
          savedContent: fileData.content,
          language: lang,
        };
        setOpenTabs((prev) => [...prev, newTab]);
        setActiveTabPath(filePath);
      } catch {
        // Fallback for new / unreadable files
        const lang = getHighlightLanguage(fileName);
        const newTab: OpenTab = {
          path: filePath,
          name: fileName,
          content: "",
          savedContent: "",
          language: lang,
        };
        setOpenTabs((prev) => [...prev, newTab]);
        setActiveTabPath(filePath);
      }
    },
    [openTabs, runtimeClient, serverId]
  );

  const closeTab = useCallback(
    (path: string, e?: React.MouseEvent) => {
      e?.stopPropagation();
      setOpenTabs((prev) => {
        const next = prev.filter((t) => t.path !== path);
        if (activeTabPath === path) {
          setActiveTabPath(next.at(-1)?.path || null);
        }
        return next;
      });
    },
    [activeTabPath]
  );

  const updateContent = useCallback((newContent: string) => {
    setOpenTabs((prev) =>
      prev.map((t) => (t.path === activeTabPath ? { ...t, content: newContent } : t))
    );
  }, [activeTabPath]);

  const handleSave = useCallback(async () => {
    if (!activeTab || !runtimeClient?.getSession()) return;
    setIsSaving(true);
    setSaveStatus(null);
    try {
      await writeFile(serverId, activeTab.path, activeTab.content, runtimeClient);
      setOpenTabs((prev) =>
        prev.map((t) => (t.path === activeTab.path ? { ...t, savedContent: t.content } : t))
      );
      setSaveStatus("Saved");
      setTimeout(() => setSaveStatus(null), 2000);
    } catch (err) {
      setSaveStatus("Failed to save");
    } finally {
      setIsSaving(false);
    }
  }, [activeTab, runtimeClient, serverId]);

  // Handle Ctrl+S / Cmd+S
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void handleSave();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleSave]);

  const filteredEntries = useMemo(() => {
    if (!searchQuery) return entries;
    return entries.filter((e) => e.name.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [entries, searchQuery]);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-[#18181b] text-slate-200 select-none font-sans">
      {/* Top Application Bar */}
      <div className="flex h-9 items-center justify-between border-b border-white/10 bg-[#1e1e24] px-3 text-xs select-none">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 font-medium text-slate-200">
            <Code2 className="h-4 w-4 text-sky-400" />
            <span className="font-semibold">Visual Studio Code</span>
            <span className="rounded bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-mono text-sky-400">
              Web-Native
            </span>
          </div>

          <div className="hidden sm:flex items-center gap-1 font-mono text-[11px] text-slate-400">
            <span>{currentDir}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {saveStatus ? (
            <span
              className={`text-[11px] font-medium ${
                saveStatus === "Saved" ? "text-emerald-400" : "text-red-400"
              }`}
            >
              {saveStatus}
            </span>
          ) : null}

          <button
            type="button"
            onClick={() => setWebMode(!webMode)}
            className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] transition-colors ${
              webMode
                ? "bg-sky-600 text-white"
                : "border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
            }`}
            title="Toggle Embedded Code-Server / Web VS Code"
          >
            <Globe className="h-3 w-3" />
            <span>Web URL</span>
          </button>

          <button
            type="button"
            disabled={!activeTab || isSaving}
            onClick={() => void handleSave()}
            className="flex items-center gap-1 rounded bg-sky-600 px-2.5 py-1 text-[11px] font-medium text-white transition-colors hover:bg-sky-500 disabled:opacity-50"
          >
            <Save className="h-3 w-3" />
            <span>Save</span>
          </button>

          <button
            type="button"
            onClick={() => openWindow("terminal", { cwd: currentDir })}
            className="flex items-center gap-1 rounded border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-slate-300 hover:bg-white/10"
            title="Open Integrated Terminal"
          >
            <Terminal className="h-3 w-3" />
            <span className="hidden sm:inline">Terminal</span>
          </button>
        </div>
      </div>

      {webMode ? (
        <div className="flex flex-1 flex-col overflow-hidden bg-black">
          <div className="flex items-center gap-2 border-b border-white/10 bg-slate-900 px-3 py-1.5 text-xs">
            <span className="text-slate-400 font-mono text-[11px]">URL:</span>
            <input
              type="text"
              value={webUrl}
              onChange={(e) => setWebUrl(e.target.value)}
              className="flex-1 rounded border border-white/10 bg-slate-950 px-2 py-0.5 font-mono text-xs text-slate-200 outline-none"
              placeholder="http://localhost:8080"
            />
            <button
              type="button"
              onClick={() => {
                const iframe = document.getElementById("vscode-iframe") as HTMLIFrameElement;
                if (iframe) iframe.src = webUrl;
              }}
              className="rounded bg-sky-600 px-2.5 py-0.5 text-[11px] text-white"
            >
              Connect
            </button>
          </div>
          <iframe
            id="vscode-iframe"
            src={webUrl}
            className="h-full w-full border-none bg-black"
            title="VS Code Web"
          />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* Activity Bar */}
          <div className="flex w-12 flex-col items-center justify-between border-r border-white/10 bg-[#1e1e24] py-3 text-slate-400">
            <div className="flex flex-col items-center gap-4">
              <button
                type="button"
                onClick={() => setActiveSidebar("explorer")}
                className={`p-2 rounded-lg transition-colors ${
                  activeSidebar === "explorer"
                    ? "bg-white/10 text-white"
                    : "hover:bg-white/5 hover:text-slate-200"
                }`}
                title="Explorer"
              >
                <Folder className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => setActiveSidebar("search")}
                className={`p-2 rounded-lg transition-colors ${
                  activeSidebar === "search"
                    ? "bg-white/10 text-white"
                    : "hover:bg-white/5 hover:text-slate-200"
                }`}
                title="Search Files"
              >
                <Search className="h-5 w-5" />
              </button>
            </div>

            <div className="flex flex-col items-center gap-4">
              <button
                type="button"
                onClick={() => openWindow("settings")}
                className="p-2 rounded-lg hover:bg-white/5 hover:text-slate-200"
                title="Settings"
              >
                <Settings className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Sidebar */}
          <div className="flex w-60 flex-col border-r border-white/10 bg-[#18181d]">
            <div className="flex items-center justify-between border-b border-white/10 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              <span>{activeSidebar === "explorer" ? "Explorer" : "Search"}</span>
              <button
                type="button"
                onClick={() => void loadDirectory(currentDir)}
                className="hover:text-white"
                title="Refresh"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loadingFiles ? "animate-spin" : ""}`} />
              </button>
            </div>

            {activeSidebar === "search" ? (
              <div className="p-2 border-b border-white/10">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter files..."
                  className="w-full rounded border border-white/10 bg-slate-900 px-2 py-1 text-xs text-slate-200 outline-none"
                />
              </div>
            ) : null}

            <div className="min-h-0 flex-1 overflow-auto p-1 font-mono text-xs">
              {filteredEntries.map((entry) => {
                const isDir = entry.type === "dir";
                const isSelected = activeTabPath === entry.path;
                return (
                  <button
                    key={entry.path}
                    type="button"
                    onClick={() => {
                      if (isDir) {
                        setCurrentDir(entry.path);
                      } else {
                        void openFile(entry.path, entry.name);
                      }
                    }}
                    className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition-colors ${
                      isSelected
                        ? "bg-sky-500/20 text-sky-300 font-medium"
                        : "text-slate-300 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    {isDir ? (
                      <FolderOpen className="h-4 w-4 shrink-0 text-amber-400" />
                    ) : (
                      <FileCode className="h-4 w-4 shrink-0 text-sky-400" />
                    )}
                    <span className="truncate">{entry.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Main Code Editing Workspace */}
          <div className="flex min-w-0 flex-1 flex-col bg-[#141416]">
            {/* Tab Bar */}
            <div className="flex h-9 items-center overflow-x-auto border-b border-white/10 bg-[#18181d] px-1 text-xs">
              {openTabs.map((tab) => {
                const isActive = tab.path === activeTabPath;
                const isDirty = tab.content !== tab.savedContent;
                return (
                  <div
                    key={tab.path}
                    onClick={() => setActiveTabPath(tab.path)}
                    className={`group flex items-center gap-2 border-r border-white/5 px-3 py-1.5 cursor-pointer transition-colors ${
                      isActive
                        ? "bg-[#141416] text-white border-t-2 border-t-sky-400"
                        : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
                    }`}
                  >
                    <FileText className="h-3.5 w-3.5 text-sky-400" />
                    <span className="font-mono text-[11px] truncate max-w-[140px]">
                      {tab.name}
                    </span>
                    {isDirty ? (
                      <span className="h-2 w-2 rounded-full bg-sky-400" />
                    ) : null}
                    <button
                      type="button"
                      onClick={(e) => closeTab(tab.path, e)}
                      className="rounded p-0.5 opacity-0 group-hover:opacity-100 hover:bg-white/10"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Editor Area */}
            {activeTab ? (
              <div className="relative flex min-h-0 flex-1 overflow-auto bg-[#141416]">
                <textarea
                  value={activeTab.content}
                  onChange={(e) => updateContent(e.target.value)}
                  spellCheck={false}
                  className="h-full w-full resize-none border-none bg-transparent p-4 font-mono text-[13px] leading-relaxed text-slate-100 outline-none select-text"
                  placeholder="Type code here..."
                />
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 text-slate-500">
                <Code2 className="h-12 w-12 text-slate-700" />
                <p className="text-sm font-medium">Select a file from the Explorer to edit</p>
                <span className="font-mono text-xs text-slate-600">Press Ctrl+S to save changes</span>
              </div>
            )}

            {/* Bottom Status Bar */}
            <div className="flex h-6 items-center justify-between border-t border-white/10 bg-[#1e1e24] px-3 font-mono text-[10px] text-slate-400">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1 text-sky-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
                  <span>main</span>
                </span>
                <span>0 errors</span>
              </div>

              <div className="flex items-center gap-4">
                <span>Spaces: 2</span>
                <span>UTF-8</span>
                <span className="uppercase text-sky-300 font-semibold">
                  {activeTab?.language || "Plain Text"}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
