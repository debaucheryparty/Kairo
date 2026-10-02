"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertCircle,
  Cpu,
  ExternalLink,
  Layers,
  Play,
  RefreshCw,
  Search,
  Server,
  ServerOff,
  Sparkles,
  Terminal,
  Zap,
} from "lucide-react";
import { MacAppIcon } from "@/src/components/brand/MacAppIcon";
import { useWindowManager } from "@/src/components/window/window-context";
import { useRuntimeClient, useSelectedServer } from "@/src/lib/session";
import type { GetGpuInfoResponsePayload, LinuxApp } from "@kairo/runtime";

interface LocalApp {
  id: string;
  name: string;
  genericName?: string;
  category: "Development" | "Graphics" | "Internet" | "System" | "Utilities";
  description: string;
  icon: string;
  exec: string;
  isTerminal?: boolean;
}

const CATEGORIES = [
  "All",
  "Development",
  "Graphics",
  "Internet",
  "System",
  "Utilities",
] as const;

export function RemoteAppsApp() {
  const { openWindow } = useWindowManager();
  const runtimeClient = useRuntimeClient();
  const selectedServer = useSelectedServer();

  const [apps, setApps] = useState<LocalApp[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [launchingId, setLaunchingId] = useState<string | null>(null);
  const [customExec, setCustomExec] = useState("");
  const [gpuInfo, setGpuInfo] = useState<GetGpuInfoResponsePayload | null>(null);

  const isLive = Boolean(runtimeClient?.getSession());

  const fetchApps = useCallback(async () => {
    if (!runtimeClient?.getSession()) {
      setApps([]);
      setGpuInfo(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [remoteApps, gpuData] = await Promise.all([
        runtimeClient.listApplications(),
        runtimeClient.getGpuInfo().catch(() => null),
      ]);

      if (gpuData) {
        setGpuInfo(gpuData);
      }

      if (Array.isArray(remoteApps) && remoteApps.length > 0) {
        const mapped: LocalApp[] = remoteApps.map((a: LinuxApp) => {
          let category: LocalApp["category"] = "Utilities";
          const catStr = a.categories.join(" ").toLowerCase();
          if (catStr.includes("develop") || catStr.includes("ide") || catStr.includes("code") || catStr.includes("texteditor")) {
            category = "Development";
          } else if (catStr.includes("graph") || catStr.includes("image") || catStr.includes("paint") || catStr.includes("photo")) {
            category = "Graphics";
          } else if (catStr.includes("web") || catStr.includes("net") || catStr.includes("browser")) {
            category = "Internet";
          } else if (catStr.includes("system") || catStr.includes("monitor") || catStr.includes("admin")) {
            category = "System";
          }

          return {
            id: a.appId,
            name: a.name,
            genericName: a.genericName,
            category,
            description: a.comment || a.genericName || `Launch ${a.exec} on remote host`,
            icon: a.icon || (a.isTerminal ? "terminal" : "files"),
            exec: a.exec,
            isTerminal: a.isTerminal,
          };
        });

        setApps(mapped);
      } else {
        setApps([]);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to query applications from host agent";
      setError(message);
      setApps([]);
    } finally {
      setLoading(false);
    }
  }, [runtimeClient]);

  useEffect(() => {
    void fetchApps();
  }, [fetchApps]);

  const handleLaunchApp = useCallback(
    async (app: LocalApp) => {
      if (!runtimeClient?.getSession()) {
        setError("Cannot launch application: host agent session is not active");
        return;
      }

      setLaunchingId(app.id);
      setError(null);
      try {
        const resp = await runtimeClient.launchApplication({
          appId: app.id,
          exec: app.exec,
        });

        openWindow("surface", {
          surfaceId: resp.surfaceId,
          appName: app.name,
          appExec: app.exec,
          appIcon: app.icon,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to launch application on host";
        setError(message);
      } finally {
        setLaunchingId(null);
      }
    },
    [openWindow, runtimeClient]
  );

  const handleCustomLaunch = useCallback(async () => {
    if (!customExec.trim()) return;
    if (!runtimeClient?.getSession()) {
      setError("Cannot launch application: host agent session is not active");
      return;
    }

    const exec = customExec.trim();
    const appName = exec.split(" ")[0] || "Custom App";
    setLaunchingId("custom");
    setError(null);
    try {
      const resp = await runtimeClient.launchApplication({
        appId: "custom",
        exec,
      });

      openWindow("surface", {
        surfaceId: resp.surfaceId,
        appName,
        appExec: exec,
      });
      setCustomExec("");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to launch command on host";
      setError(message);
    } finally {
      setLaunchingId(null);
    }
  }, [customExec, openWindow, runtimeClient]);

  const filteredApps = useMemo(() => {
    return apps.filter((app) => {
      const matchesCategory =
        selectedCategory === "All" || app.category === selectedCategory;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        app.name.toLowerCase().includes(q) ||
        (app.genericName && app.genericName.toLowerCase().includes(q)) ||
        app.description.toLowerCase().includes(q) ||
        app.exec.toLowerCase().includes(q);
      return matchesCategory && matchesSearch;
    });
  }, [apps, selectedCategory, searchQuery]);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-slate-950 text-slate-100 select-none">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 bg-slate-900/60 px-6 py-4 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-700 shadow-lg shadow-indigo-500/25">
            <Layers className="h-5 w-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold tracking-tight text-white">
                Linux GUI Applications
              </h1>
              <span className="inline-flex items-center gap-1 rounded-full border border-indigo-400/20 bg-indigo-500/10 px-2 py-0.5 text-[11px] font-medium text-indigo-300">
                <Sparkles className="h-3 w-3" />
                Remote Streaming
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Launch and stream interactive desktop applications from {selectedServer?.name || "Remote Host"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300">
            <span
              className={`h-2 w-2 rounded-full ${
                isLive ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]" : "bg-amber-400"
              }`}
            />
            <span>{isLive ? "Host Agent Connected" : "Agent Disconnected"}</span>
          </div>

          <button
            type="button"
            onClick={() => void fetchApps()}
            disabled={loading || !isLive}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-white/10 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 border-b border-red-500/20 bg-red-500/10 px-6 py-2.5 text-xs text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
          <span>{error}</span>
        </div>
      )}

      {isLive && gpuInfo && (
        <div className="border-b border-white/5 bg-slate-900/30 px-6 py-3">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4 text-xs text-slate-400">
              <div className="flex items-center gap-1.5">
                <Zap className="h-4 w-4 text-amber-400" />
                <span className="font-medium text-slate-300">Hardware Acceleration:</span>
                <span className="text-slate-400">
                  {gpuInfo.gpuAvailable ? "GPU Enabled" : "Headless Xvfb / Software Encoder"}
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <Cpu className="h-4 w-4 text-sky-400" />
                <span className="font-medium text-slate-300">Encoder Codec:</span>
                <span className="font-mono text-slate-400">{gpuInfo.defaultEncoder}</span>
              </div>

              <div className="flex items-center gap-1.5">
                <Activity className="h-4 w-4 text-emerald-400" />
                <span className="font-medium text-slate-300">Target Latency:</span>
                <span className="text-emerald-400 font-mono">&lt; 20ms Ultra-Low</span>
              </div>
            </div>

            <div className="text-[11px] text-slate-500 font-mono">
              Protocol: Kairo Stream v1 • 60 FPS
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-4 border-b border-white/5 bg-slate-900/10 px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-1.5">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                  selectedCategory === cat
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                    : "bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="relative min-w-[240px] max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search applications or binaries..."
              className="w-full rounded-lg border border-white/10 bg-slate-900/80 py-1.5 pl-9 pr-3 text-xs text-white placeholder-slate-500 outline-none transition-all focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-slate-900/50 p-2">
          <Terminal className="ml-2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={customExec}
            onChange={(e) => setCustomExec(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleCustomLaunch();
            }}
            placeholder="Launch arbitrary Linux GUI binary on host (e.g. firefox, xclock, blender, wireshark)..."
            className="flex-1 bg-transparent px-2 text-xs text-slate-200 placeholder-slate-500 outline-none"
          />
          <button
            type="button"
            onClick={() => void handleCustomLaunch()}
            disabled={!customExec.trim() || launchingId === "custom" || !isLive}
            className="flex items-center gap-1 rounded-md bg-indigo-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-40"
          >
            <Play className="h-3 w-3" />
            <span>Launch</span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {!isLive ? (
          <div className="flex h-64 flex-col items-center justify-center text-center">
            <ServerOff className="h-10 w-10 text-slate-600 mb-3" />
            <p className="text-sm font-semibold text-slate-200">Remote Host Not Connected</p>
            <p className="text-xs text-slate-400 mt-1 max-w-sm">
              Connect to an active Kairo Linux host agent to browse installed desktop applications and initiate hardware-accelerated GUI streams.
            </p>
          </div>
        ) : filteredApps.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center text-center">
            <Layers className="h-10 w-10 text-slate-600 mb-3" />
            <p className="text-sm font-semibold text-slate-200">
              {apps.length === 0 ? "No Desktop Applications Discovered" : "No matching applications"}
            </p>
            <p className="text-xs text-slate-400 mt-1 max-w-sm">
              {apps.length === 0
                ? "No .desktop application files were found in system or user directories on this host. You can launch any GUI binary using the command launcher above."
                : "Try adjusting your category filter or search query."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredApps.map((app) => {
              const isLaunching = launchingId === app.id;
              return (
                <div
                  key={app.id}
                  className="group relative flex flex-col justify-between overflow-hidden rounded-xl border border-white/10 bg-gradient-to-b from-slate-900/80 to-slate-900/40 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-indigo-500/40 hover:bg-slate-900 hover:shadow-xl hover:shadow-indigo-500/10"
                >
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div className="relative">
                        <MacAppIcon
                          icon={app.icon}
                          name={app.name}
                          className="h-12 w-12 rounded-xl transition-transform duration-200 group-hover:scale-105"
                        />
                      </div>
                      <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-medium text-slate-400">
                        {app.category}
                      </span>
                    </div>

                    <div className="mt-3">
                      <h3 className="text-sm font-semibold text-white group-hover:text-indigo-300 transition-colors">
                        {app.name}
                      </h3>
                      {app.genericName && (
                        <p className="text-[11px] text-slate-400 mt-0.5 font-medium">
                          {app.genericName}
                        </p>
                      )}
                      <p className="text-xs text-slate-400 mt-2 line-clamp-2 leading-relaxed">
                        {app.description}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between gap-2">
                    <span className="truncate font-mono text-[10px] text-slate-500" title={app.exec}>
                      $ {app.exec}
                    </span>

                    <button
                      type="button"
                      onClick={() => void handleLaunchApp(app)}
                      disabled={isLaunching || !isLive}
                      className="flex items-center gap-1.5 rounded-lg bg-indigo-600/90 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-all hover:bg-indigo-500 active:scale-95 disabled:opacity-50"
                    >
                      {isLaunching ? (
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <ExternalLink className="h-3.5 w-3.5" />
                      )}
                      <span>{isLaunching ? "Opening..." : "Launch"}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-white/10 bg-slate-900/60 px-6 py-2.5 text-xs text-slate-400 backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <Server className="h-3.5 w-3.5 text-indigo-400" />
          <span>Host: {selectedServer?.hostname || selectedServer?.address || "Disconnected"}</span>
          <span className="text-slate-600">•</span>
          <span>{apps.length} applications discovered</span>
        </div>
        <div className="text-[11px] text-slate-500">
          Remote Linux GUI Streaming • Hardware accelerated
        </div>
      </div>
    </div>
  );
}
