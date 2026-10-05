"use client";

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { Search, MoreHorizontal, X, Pin, Loader2, AlertCircle } from "lucide-react";
import {
  BUILTIN_VPS_APPS,
  mergeVpsApplications,
  type VpsApp,
  APP_CATEGORIES,
  type AppCategory,
} from "@/src/lib/api/applications";
import { MacAppIcon } from "@/src/components/brand/MacAppIcon";
import { useWindowManager } from "@/src/components/window/window-context";
import { useSession, useRuntimeClient } from "@/src/lib/session";
import { useDockStore } from "@/src/lib/dock/dock-store";
import type { AppId } from "@/src/data/apps";

interface SpotlightModalProps {
  open: boolean;
  onClose: () => void;
}

export function SpotlightModal({ open, onClose }: SpotlightModalProps) {
  const { openWindow } = useWindowManager();
  const { selectedServer } = useSession();
  const runtimeClient = useRuntimeClient();
  const { isPinned, pinApp, unpinApp } = useDockStore();
  const [apps, setApps] = useState<VpsApp[]>(BUILTIN_VPS_APPS);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<AppCategory>("All");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [launchingId, setLaunchingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchApps = useCallback(async () => {
    if (!runtimeClient?.getSession()) {
      setApps(BUILTIN_VPS_APPS);
      return;
    }
    try {
      const remote = await runtimeClient.listApplications();
      if (Array.isArray(remote) && remote.length > 0) {
        setApps(mergeVpsApplications(remote));
      } else {
        setApps(BUILTIN_VPS_APPS);
      }
    } catch {
      setApps(BUILTIN_VPS_APPS);
    }
  }, [runtimeClient]);

  useEffect(() => {
    if (open) {
      void fetchApps();
    }
  }, [fetchApps, selectedServer?.id, open]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setCategory("All");
      setSelectedIndex(0);
      setError(null);
      const timer = setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [open]);

  const filteredApps = useMemo(() => {
    return apps.filter((app) => {
      const matchCat = category === "All" || app.category === category;
      if (!matchCat) return false;
      if (!query.trim()) return true;
      const q = query.toLowerCase();
      return (
        app.name.toLowerCase().includes(q) ||
        (app.genericName && app.genericName.toLowerCase().includes(q)) ||
        app.description.toLowerCase().includes(q) ||
        app.exec.toLowerCase().includes(q)
      );
    });
  }, [apps, category, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query, category]);

  const launchApp = useCallback(
    async (app: VpsApp) => {
      if (app.builtinAppId) {
        onClose();
        openWindow(app.builtinAppId as AppId);
        return;
      }

      if (!runtimeClient?.getSession()) {
        setError("Cannot launch application: host agent session is not active");
        return;
      }

      setLaunchingId(app.id);
      setError(null);
      try {
        await runtimeClient.launchApplication({
          appId: app.id,
          exec: app.exec,
        });

        onClose();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to launch application on host";
        setError(message);
      } finally {
        setLaunchingId(null);
      }
    },
    [onClose, openWindow, runtimeClient]
  );

  useEffect(() => {
    if (!open) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }

      if (filteredApps.length === 0) return;

      if (e.key === "ArrowRight") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % filteredApps.length);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filteredApps.length) % filteredApps.length);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(filteredApps.length - 1, prev + 6));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(0, prev - 6));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const selected = filteredApps[selectedIndex];
        if (selected) {
          void launchApp(selected);
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, filteredApps, selectedIndex, launchApp]);

  if (!open) return null;

  const recentApps = apps.slice(0, 6);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Spotlight Search"
      className="fixed inset-0 z-[150] flex items-start justify-center pt-[10vh] sm:pt-[12vh] bg-black/35 backdrop-blur-[4px] select-none animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative flex w-[700px] max-w-[94vw] max-h-[82vh] flex-col rounded-[24px] border border-white/20 dark:border-white/12 bg-[#1e1e24]/92 dark:bg-[#141418]/94 text-white shadow-[0_32px_100px_rgba(0,0,0,0.65)] backdrop-blur-3xl overflow-hidden animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
          <Search className="size-5 text-white/50 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Spotlight Search"
            className="flex-1 bg-transparent text-[17px] font-normal text-white placeholder-white/40 outline-none"
          />
          {launchingId && (
            <div className="flex items-center gap-1.5 text-xs text-sky-400 shrink-0 font-medium">
              <Loader2 className="size-3.5 animate-spin" />
              <span>Launching...</span>
            </div>
          )}
          {query ? (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              className="rounded-full p-1 text-white/40 hover:text-white transition-colors"
            >
              <X className="size-4" />
            </button>
          ) : null}
          <div className="flex items-center gap-2 text-white/40">
            <button
              type="button"
              className="rounded-full p-1 hover:text-white hover:bg-white/10 transition-colors"
              title="Options"
            >
              <MoreHorizontal className="size-4" />
            </button>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 px-5 py-2.5 bg-red-500/15 border-b border-red-500/20 text-red-300 text-xs animate-fade-in">
            <AlertCircle className="size-4 shrink-0 text-red-400" />
            <span className="truncate flex-1">{error}</span>
          </div>
        )}

        <div className="flex items-center gap-1.5 overflow-x-auto px-5 py-2.5 border-b border-white/8 scrollbar-none">
          {APP_CATEGORIES.map((cat) => {
            const active = category === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat)}
                className={`rounded-full px-3 py-1 text-[12px] font-medium transition-all shrink-0 ${
                  active
                    ? "bg-white/20 text-white shadow-sm border border-white/15"
                    : "bg-white/5 text-white/60 hover:text-white hover:bg-white/10 border border-transparent"
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto p-5 scrollbar-thin scrollbar-thumb-white/15">
          {!query && category === "All" && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3 px-1">
                <span className="text-[11px] font-medium tracking-wide uppercase text-white/40">
                  Quick Access
                </span>
                <span className="text-[11px] text-white/30">
                  {selectedServer?.hostname || "VPS"}
                </span>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                {recentApps.map((app) => {
                  return (
                    <button
                      key={`recent-${app.id}`}
                      type="button"
                      onClick={() => void launchApp(app)}
                      className="group flex flex-col items-center rounded-2xl p-2.5 hover:bg-white/10 transition-all outline-none"
                    >
                      <div className="size-13 p-1 transition-transform group-hover:scale-105 group-active:scale-95 flex items-center justify-center">
                        <MacAppIcon icon={app.icon} name={app.name} className="size-full" />
                      </div>
                      <span className="mt-2 text-center text-[12px] font-normal text-white/90 truncate w-full group-hover:text-white">
                        {app.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-3 px-1">
              <span className="text-[11px] font-medium tracking-wide uppercase text-white/40">
                {query ? "Search Results" : "Installed VPS Applications"}
              </span>
              <span className="text-[11px] text-white/40">
                {filteredApps.length} {filteredApps.length === 1 ? "app" : "apps"}
              </span>
            </div>

            {filteredApps.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Search className="size-8 text-white/20 mb-2" />
                <p className="text-[13px] text-white/60">
                  No applications found on VPS matching &ldquo;{query}&rdquo;
                </p>
                <p className="text-[11px] text-white/40 mt-1">
                  Try searching for bash, files, htop, python, or docker
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {filteredApps.map((app, index) => {
                  const selected = index === selectedIndex;
                  const pinned = isPinned(app.id);
                  return (
                    <button
                      key={app.id}
                      type="button"
                      onClick={() => void launchApp(app)}
                      className={`group flex items-start gap-3 rounded-[16px] p-3 text-left transition-all outline-none border ${
                        launchingId === app.id
                          ? "bg-sky-500/10 border-sky-500/25"
                          : selected
                          ? "bg-white/15 border-white/25 shadow-md"
                          : "border-transparent hover:bg-white/8 hover:border-white/10"
                      }`}
                    >
                      <div className="size-11 shrink-0 p-0.5 transition-transform group-hover:scale-105 group-active:scale-95 flex items-center justify-center">
                        <MacAppIcon icon={app.icon} name={app.name} className="size-full" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-[13px] font-medium text-white truncate group-hover:text-white">
                            {app.name}
                          </span>
                          <button
                            type="button"
                            title={pinned ? "Remove from Dock" : "Add to Dock"}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (pinned) {
                                unpinApp(app.id);
                              } else {
                                pinApp({
                                  id: app.id,
                                  title: app.name,
                                  icon: app.icon,
                                  exec: app.exec,
                                  builtinAppId: app.builtinAppId,
                                });
                              }
                            }}
                            className={`rounded-md p-1 transition-all ${
                              pinned
                                ? "text-sky-400 bg-sky-500/20 opacity-100"
                                : "text-white/40 hover:text-white hover:bg-white/10 opacity-0 group-hover:opacity-100"
                            }`}
                          >
                            <Pin className="size-3" />
                          </button>
                        </div>
                        <p className="text-[11px] text-white/50 truncate mt-0.5 leading-snug">
                          {app.description}
                        </p>
                        <span className="inline-block mt-1 text-[10px] text-white/35 font-mono">
                          {app.exec}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-white/8 px-5 py-2.5 text-[11px] text-white/40 bg-black/20">
          <div className="flex items-center gap-3">
            <span>
              <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px] text-white/70">
                ↑↓
              </kbd>{" "}
              Navigate
            </span>
            <span>
              <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px] text-white/70">
                ↵
              </kbd>{" "}
              Open
            </span>
          </div>
          <span>
            <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px] text-white/70">
              ESC
            </kbd>{" "}
            Close
          </span>
        </div>
      </div>
    </div>
  );
}
