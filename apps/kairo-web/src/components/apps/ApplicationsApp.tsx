"use client";

import { useState, useEffect } from "react";
import { useWindowManager } from "@/src/components/window/window-context";

interface LinuxAppItem {
  id: string;
  name: string;
  genericName?: string;
  comment?: string;
  icon?: string;
  exec: string;
  categories?: string[];
}

export function ApplicationsApp() {
  const { openWindow } = useWindowManager();
  const [apps, setApps] = useState<LinuxAppItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [customCmd, setCustomCmd] = useState("");
  const [customArgs, setCustomArgs] = useState("");
  const [activeSurfaces, setActiveSurfaces] = useState<
    { id: string; name: string; exec: string; launchedAt: string }[]
  >([]);

  useEffect(() => {
    let cancelled = false;
    async function loadApps() {
      setLoading(true);
      try {
        const res = await fetch("/api/apps").catch(() => null);
        if (res && res.ok) {
          const data = await res.json();
          if (!cancelled && Array.isArray(data.apps)) {
            setApps(data.apps);
          }
        }
      } catch {
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadApps();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLaunch = (name: string, exec: string, icon?: string) => {
    if (!exec.trim()) return;
    const surfaceId = `surf-${Date.now()}`;
    const newSurface = {
      id: surfaceId,
      name,
      exec,
      launchedAt: new Date().toLocaleTimeString(),
    };

    setActiveSurfaces((prev) => [newSurface, ...prev]);

    openWindow("surface", {
      surfaceId,
      appName: name,
      appExec: exec,
      appIcon: icon,
    });
  };

  const handleCustomLaunch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customCmd.trim()) return;
    const fullCmd = customArgs.trim() ? `${customCmd.trim()} ${customArgs.trim()}` : customCmd.trim();
    handleLaunch(customCmd.trim(), fullCmd, "⚡");
    setCustomCmd("");
    setCustomArgs("");
  };

  const filteredApps = apps.filter((app) => {
    const q = search.toLowerCase();
    return (
      app.name.toLowerCase().includes(q) ||
      app.exec.toLowerCase().includes(q) ||
      (app.comment && app.comment.toLowerCase().includes(q))
    );
  });

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-slate-950 text-slate-100 select-none">
      <div className="border-b border-white/10 bg-slate-900/60 p-4 backdrop-blur-md">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-white">
              Remote Linux Applications
            </h2>
            <p className="text-xs text-slate-400">
              Launch installed software or run custom executables directly on the remote Linux host.
            </p>
          </div>
        </div>

        <form onSubmit={handleCustomLaunch} className="mt-3 flex items-center gap-2">
          <input
            type="text"
            placeholder="Command or executable (e.g. htop, bash, python3, firefox)..."
            value={customCmd}
            onChange={(e) => setCustomCmd(e.target.value)}
            className="flex-1 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white placeholder-slate-500 outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 font-mono"
          />
          <input
            type="text"
            placeholder="Arguments (optional)..."
            value={customArgs}
            onChange={(e) => setCustomArgs(e.target.value)}
            className="w-48 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white placeholder-slate-500 outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 font-mono"
          />
          <button
            type="submit"
            disabled={!customCmd.trim()}
            className="flex items-center gap-1.5 rounded-md bg-sky-500 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition-all hover:bg-sky-400 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <span>Run</span>
            <span>→</span>
          </button>
        </form>
      </div>

      {activeSurfaces.length > 0 && (
        <div className="border-b border-white/5 bg-slate-900/40 px-4 py-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-emerald-400">
              ● Active Remote Surfaces ({activeSurfaces.length})
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {activeSurfaces.map((surf) => (
              <div
                key={surf.id}
                className="flex items-center gap-2 rounded-md border border-emerald-500/20 bg-emerald-950/20 px-2.5 py-1 text-xs text-emerald-200"
              >
                <span>{surf.name}</span>
                <span className="font-mono text-[10px] text-slate-500">({surf.launchedAt})</span>
                <button
                  type="button"
                  onClick={() =>
                    openWindow("surface", {
                      surfaceId: surf.id,
                      appName: surf.name,
                      appExec: surf.exec,
                    })
                  }
                  className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-white hover:bg-white/20"
                >
                  Focus
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4">
        {apps.length > 0 ? (
          <>
            <div className="mb-3">
              <input
                type="text"
                placeholder="Filter installed apps..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white placeholder-slate-500 outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {filteredApps.map((app) => (
                <div
                  key={app.id}
                  className="group relative flex items-start gap-3 rounded-lg border border-white/10 bg-white/5 p-3.5 transition-all hover:border-sky-500/40 hover:bg-white/[0.08]"
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white/10 text-xl font-mono">
                    {app.icon || "⚙️"}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="truncate text-sm font-medium text-white">{app.name}</h3>
                      <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
                        {app.exec}
                      </span>
                    </div>

                    {app.comment && (
                      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-400">
                        {app.comment}
                      </p>
                    )}

                    <div className="mt-3 flex items-center justify-end">
                      <button
                        type="button"
                        onClick={() => handleLaunch(app.name, app.exec, app.icon)}
                        className="flex items-center gap-1.5 rounded-md bg-sky-500 px-3 py-1 text-xs font-semibold text-white shadow-sm transition-all hover:bg-sky-400"
                      >
                        <span>Launch</span>
                        <span>→</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center text-slate-500">
            <span className="text-4xl">⚡</span>
            <p className="mt-3 text-sm font-medium text-slate-300">
              {loading ? "Querying host applications..." : "No desktop application packages discovered"}
            </p>
            <p className="mt-1 max-w-sm text-xs text-slate-500">
              Use the command launcher above to run any executable, binary, or script directly on the remote Linux host.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
