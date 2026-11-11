"use client";

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { Search, X, Pin, Loader2, AlertCircle, Sparkles, Terminal, Calculator, HelpCircle } from "lucide-react";
import {
  BUILTIN_VPS_APPS,
  mergeVpsApplications,
  type VpsApp,
  APP_CATEGORIES,
  type AppCategory,
} from "@/src/lib/api/applications";
import { AppIcon } from "@/src/components/brand/AppIcon";
import { useWindowManager } from "@/src/components/window/window-context";
import { useSession, useRuntimeClient } from "@/src/lib/session";
import { useDockStore } from "@/src/lib/dock/dock-store";
import { HyprSearchIcon, HyprAppsIcon } from "@/src/components/desktop/HyprIcons";
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
        const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
        const effectiveDpr = Math.min(Math.max(dpr, 1), 2);
        const args =
          app.id.includes("chrome") || (app.exec && app.exec.includes("chrome"))
            ? [`--force-device-scale-factor=${effectiveDpr}`]
            : undefined;

        await runtimeClient.launchApplication({
          appId: app.id,
          exec: app.exec,
          args,
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
        setSelectedIndex((prev) => Math.min(filteredApps.length - 1, prev + 4));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(0, prev - 4));
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
  }, [open, filteredApps, selectedIndex, launchApp, onClose]);

  if (!open) return null;

  const recentApps = apps.slice(0, 6);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Application Launcher"
      className="fixed inset-0 z-[150] flex items-start justify-center pt-[10vh] sm:pt-[12vh] bg-black/45 backdrop-blur-md select-none animate-hypr-pop"
      onClick={onClose}
    >
      <div
        className="relative flex w-[720px] max-w-[94vw] max-h-[82vh] flex-col rounded-[28px] border border-white/12 bg-[#141318]/96 text-white shadow-[0_32px_100px_rgba(0,0,0,0.7)] backdrop-blur-3xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search header with M3 Pill Container */}
        <div className="p-4 border-b border-white/10">
          <div className="flex items-center gap-3 px-4 py-2.5 rounded-full bg-white/[0.04] border border-white/10 focus-within:border-[var(--m3-primary)]/60 focus-within:ring-2 focus-within:ring-[var(--m3-primary)]/20 transition-all">
            {query.startsWith(">") ? (
              <Terminal className="size-5 text-[var(--m3-primary)] shrink-0 animate-hypr-pop" />
            ) : query.startsWith("=") ? (
              <Calculator className="size-5 text-emerald-400 shrink-0 animate-hypr-pop" />
            ) : query.startsWith("?") ? (
              <HelpCircle className="size-5 text-amber-400 shrink-0 animate-hypr-pop" />
            ) : (
              <HyprSearchIcon className="size-5 text-[var(--m3-primary)]/80 shrink-0" />
            )}
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search, calculate or run (use > for shell, = for math, ? for search)..."
              className="flex-1 bg-transparent text-[16px] font-medium text-white placeholder-white/40 outline-none"
            />
            {launchingId && (
              <div className="flex items-center gap-1.5 text-xs text-[var(--m3-primary)] shrink-0 font-medium animate-pulse">
                <Loader2 className="size-3.5 animate-spin" />
                <span>Launching...</span>
              </div>
            )}
            {query && (
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
            )}
            <kbd className="hidden sm:inline-block px-2 py-0.5 rounded-full text-[10px] font-mono bg-white/10 text-white/60">
              ESC
            </kbd>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 px-5 py-2.5 bg-rose-500/15 border-b border-rose-500/20 text-rose-300 text-xs animate-hypr-pop">
            <AlertCircle className="size-4 shrink-0 text-rose-400" />
            <span className="truncate flex-1">{error}</span>
          </div>
        )}

        {/* Category Pills (Material 3) */}
        <div className="flex items-center gap-2 overflow-x-auto px-5 py-2.5 border-b border-white/8 scrollbar-none">
          {APP_CATEGORIES.map((cat) => {
            const active = category === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat)}
                className={`rounded-full px-3.5 py-1 text-xs font-semibold transition-all shrink-0 ${
                  active
                    ? "bg-[var(--m3-primary)] text-[var(--m3-on-primary)] shadow-[0_0_12px_var(--m3-primary)]"
                    : "bg-white/5 text-white/60 hover:text-white hover:bg-white/10"
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>

        {/* Apps Scroll Area */}
        <div className="flex-1 overflow-y-auto p-5 scrollbar-thin scrollbar-thumb-white/15">
          {!query && category === "All" && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3 px-1">
                <span className="text-[11px] font-bold tracking-wider uppercase text-white/40">
                  Quick Access
                </span>
                <span className="text-[11px] text-white/30 font-mono">
                  {selectedServer?.hostname || "VPS Local"}
                </span>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                {recentApps.map((app) => (
                  <button
                    key={`recent-${app.id}`}
                    type="button"
                    onClick={() => void launchApp(app)}
                    className="group flex flex-col items-center rounded-2xl p-2.5 hover:bg-white/8 transition-all outline-none"
                  >
                    <div className="size-13 p-1 transition-transform group-hover:scale-110 group-active:scale-95 flex items-center justify-center">
                      <AppIcon icon={app.icon} name={app.name} className="size-full" />
                    </div>
                    <span className="mt-2 text-center text-xs font-medium text-white/90 truncate w-full group-hover:text-white">
                      {app.name}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-3 px-1">
              <span className="text-[11px] font-bold tracking-wider uppercase text-white/40">
                {query ? "Search Results" : "Applications on VPS"}
              </span>
              <span className="text-[11px] text-white/40 font-mono">
                {filteredApps.length} {filteredApps.length === 1 ? "app" : "apps"}
              </span>
            </div>

            {filteredApps.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Search className="size-8 text-white/20 mb-2" />
                <p className="text-sm text-white/60">
                  No applications found matching &ldquo;{query}&rdquo;
                </p>
                <p className="text-xs text-white/40 mt-1">
                  Try searching for Chrome, Text Editor, Terminal, GIMP, or Python
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {filteredApps.map((app, index) => {
                  const isSelected = index === selectedIndex;
                  const pinned = isPinned(app.id);
                  return (
                    <button
                      key={app.id}
                      type="button"
                      onClick={() => void launchApp(app)}
                      className={`group flex items-start gap-3 rounded-[20px] p-3 text-left transition-all outline-none border ${
                        launchingId === app.id
                          ? "bg-[var(--m3-primary)]/20 border-[var(--m3-primary)]/50"
                          : isSelected
                          ? "bg-[var(--m3-primary)]/12 border-[var(--m3-primary)]/55 shadow-[0_0_18px_-3px_var(--m3-primary)]"
                          : "border-white/5 bg-white/[0.02] hover:bg-white/[0.06] hover:border-white/15"
                      }`}
                    >
                      <div className="size-11 shrink-0 p-0.5 transition-transform group-hover:scale-105 group-active:scale-95 flex items-center justify-center">
                        <AppIcon icon={app.icon} name={app.name} className="size-full" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-sm font-semibold text-white truncate group-hover:text-[#c4b5fd]">
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
                                ? "text-[var(--m3-primary)] bg-[var(--m3-primary)]/20 opacity-100"
                                : "text-white/40 hover:text-white hover:bg-white/10 opacity-0 group-hover:opacity-100"
                            }`}
                          >
                            <Pin className="size-3" />
                          </button>
                        </div>
                        <p className="text-xs text-white/50 truncate mt-0.5 leading-snug">
                          {app.description}
                        </p>
                        <div className="flex items-center gap-1.5 mt-1.5">
                          <span className="text-[10px] font-mono text-white/40 truncate">
                            {app.exec}
                          </span>
                          {app.builtinAppId ? (
                            <span className="ml-auto text-[9px] px-1.5 py-0.2 rounded-full bg-white/10 text-white/60">
                              Built-in
                            </span>
                          ) : (
                            <span className="ml-auto text-[9px] px-1.5 py-0.2 rounded-full bg-[var(--m3-primary)]/20 text-[var(--m3-primary)] font-medium">
                              VPS
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer shortcuts */}
        <div className="flex items-center justify-between border-t border-white/10 px-5 py-2.5 text-xs text-white/50 bg-black/30">
          <div className="flex items-center gap-3">
            <span>
              <kbd className="rounded px-1.5 py-0.5 font-mono text-[10px] bg-white/10 text-white/80">
                ↑↓←→
              </kbd>{" "}
              Navigate
            </span>
            <span>
              <kbd className="rounded px-1.5 py-0.5 font-mono text-[10px] bg-white/10 text-white/80">
                ↵
              </kbd>{" "}
              Launch
            </span>
          </div>
          <span>
            <kbd className="rounded px-1.5 py-0.5 font-mono text-[10px] bg-white/10 text-white/80">
              ESC
            </kbd>{" "}
            Dismiss
          </span>
        </div>
      </div>
    </div>
  );
}
