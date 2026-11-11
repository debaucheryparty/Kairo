"use client";

import { useEffect, useState, useCallback } from "react";
import { useServer } from "@/src/lib/api/server-context";
import { useRuntimeClient, useSelectedServer } from "@/src/lib/session";
import { M3Card, M3Chip, M3Button, M3IconButton } from "@/src/components/m3";
import type { SystemMetrics, DockerContainer, ProcessInfo } from "@kairo/runtime";
import { ContainerAction } from "@kairo/runtime";

function formatUptime(seconds: number) {
  if (!seconds) return "—";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatBytes(bytes: number) {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

type DashboardTab = "metrics" | "docker" | "processes";

export function DashboardApp() {
  const selected = useSelectedServer();
  const runtimeClient = useRuntimeClient();
  const { server } = useServer();

  const [activeTab, setActiveTab] = useState<DashboardTab>("metrics");
  const [liveMetrics, setLiveMetrics] = useState<SystemMetrics | null>(null);
  const [containers, setContainers] = useState<DockerContainer[]>([]);
  const [dockerAvailable, setDockerAvailable] = useState<boolean>(true);
  const [processes, setProcesses] = useState<ProcessInfo[]>([]);
  const [procFilter, setProcFilter] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const isLive = Boolean(runtimeClient?.getSession());
  const name = selected?.name || server?.name || "Server";
  const host = selected?.address || server?.host;

  // Poll metrics every 2s
  useEffect(() => {
    if (!runtimeClient?.getSession()) {
      setLiveMetrics(null);
      return;
    }

    let active = true;
    const fetchMetrics = async () => {
      try {
        const metrics = await runtimeClient.getMetrics();
        if (active) setLiveMetrics(metrics);
      } catch {}
    };

    void fetchMetrics();
    const interval = setInterval(() => {
      void fetchMetrics();
    }, 2000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [runtimeClient]);

  // Fetch containers and processes
  const loadData = useCallback(async () => {
    if (!runtimeClient?.getSession()) return;
    setIsRefreshing(true);
    try {
      const res = await runtimeClient.listContainers(true).catch(() => null);
      if (res) {
        setContainers(res.containers || []);
        setDockerAvailable(res.dockerAvailable);
      }

      const procs = await runtimeClient.listProcesses().catch(() => []);
      if (procs) {
        setProcesses(procs);
      }
    } finally {
      setIsRefreshing(false);
    }
  }, [runtimeClient]);

  useEffect(() => {
    if (isLive) {
      void loadData();
    }
  }, [isLive, loadData, activeTab]);

  const handleContainerAction = async (containerId: string, action: ContainerAction) => {
    if (!runtimeClient?.getSession()) return;
    try {
      setActionMessage(`Applying container action...`);
      const res = await runtimeClient.manageContainer(containerId, action);
      setActionMessage(res.message || "Done");
      await loadData();
    } catch (e) {
      setActionMessage(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setTimeout(() => setActionMessage(null), 3000);
    }
  };

  const handleKillProcess = async (processId: string) => {
    if (!runtimeClient?.getSession()) return;
    try {
      await runtimeClient.killProcess(processId);
      setProcesses((prev) => prev.filter((p) => p.processId !== processId));
      setActionMessage(`Terminated process ${processId}`);
    } catch (e) {
      setActionMessage(`Failed to kill process: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setTimeout(() => setActionMessage(null), 3000);
    }
  };

  const filteredProcesses = processes.filter((p) =>
    (p.executable + " " + p.owner + " " + p.pid).toLowerCase().includes(procFilter.toLowerCase()),
  );

  return (
    <div className="flex h-full w-full flex-col bg-[var(--md-sys-color-surface)] text-[var(--md-sys-color-on-surface)] select-none font-sans overflow-hidden">
      {/* Top App Header (Material 3 Surface / Toolbar) */}
      <div className="flex items-center justify-between px-6 py-3.5 bg-[var(--md-sys-color-surface-container-low)] border-b border-[var(--md-sys-color-outline-variant)]/25">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-[14px] bg-[var(--md-sys-color-primary-container)] border border-[var(--md-sys-color-outline-variant)]/30 flex items-center justify-center text-[var(--md-sys-color-on-primary-container)] shadow-sm">
            <span className="material-symbol text-[22px]">dns</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-[var(--md-sys-color-on-surface)] tracking-tight">{name}</h2>
              <span
                className={`size-2 rounded-full ${
                  isLive ? "bg-[var(--md-sys-color-primary)] shadow-[0_0_8px_var(--md-sys-color-primary)]" : "bg-amber-400"
                }`}
              />
              <span className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">{isLive ? "Live Agent" : "Offline"}</span>
            </div>
            <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]/80">
              {host} • Uptime: {formatUptime(liveMetrics?.uptimeSeconds || 0)}
            </p>
          </div>
        </div>

        {/* M3 Segmented Tab Bar (Matching SecondaryTabBar.qml) */}
        <div className="flex items-center gap-1.5 p-1 rounded-full bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)]/25">
          <M3Chip
            selected={activeTab === "metrics"}
            onClick={() => setActiveTab("metrics")}
            icon="monitoring"
          >
            Metrics
          </M3Chip>
          <M3Chip
            selected={activeTab === "docker"}
            onClick={() => setActiveTab("docker")}
            icon="deployed_code"
          >
            Docker {containers.length > 0 ? `(${containers.length})` : ""}
          </M3Chip>
          <M3Chip
            selected={activeTab === "processes"}
            onClick={() => setActiveTab("processes")}
            icon="terminal"
          >
            Processes
          </M3Chip>
        </div>

        {/* Refresh Action Button */}
        <M3IconButton
          icon="refresh"
          title="Refresh Metrics & Status"
          onClick={() => void loadData()}
          disabled={isRefreshing}
          variant="tonal"
          className={isRefreshing ? "animate-spin" : ""}
        />
      </div>

      {/* Action Notification Banner */}
      {actionMessage && (
        <div className="bg-[var(--md-sys-color-primary-container)] border-b border-[var(--md-sys-color-outline-variant)]/25 px-6 py-2 text-[12px] text-[var(--md-sys-color-on-primary-container)] flex items-center gap-2 animate-in fade-in">
          <span className="material-symbol text-[16px]">info</span>
          <span>{actionMessage}</span>
        </div>
      )}

      {/* Main Tab Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* TAB 1: METRICS */}
        {activeTab === "metrics" && (
          <div className="space-y-6">
            {/* Top 4 Hardware Metric Cards (Material 3 expressive containers) */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* CPU Card */}
              <M3Card variant="filled" className="flex flex-col justify-between">
                <div className="flex items-center justify-between text-white/60 mb-3">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--md-sys-color-on-surface-variant)]">CPU Usage</span>
                  <span className="material-symbol text-[20px] text-[var(--m3-primary)]">memory</span>
                </div>
                <div className="text-3xl font-bold text-[var(--md-sys-color-on-surface)] mb-2 font-display">
                  {liveMetrics ? `${Math.round(liveMetrics.cpuUsagePercent)}%` : "0%"}
                </div>
                <div className="w-full h-2 rounded-full bg-[var(--md-sys-color-surface-container)] overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[var(--md-sys-color-primary)] to-[var(--md-sys-color-primary-container)] rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(100, Math.max(0, liveMetrics?.cpuUsagePercent || 0))}%` }}
                  />
                </div>
              </M3Card>

              {/* Memory Card */}
              <M3Card variant="filled" className="flex flex-col justify-between">
                <div className="flex items-center justify-between text-white/60 mb-3">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--md-sys-color-on-surface-variant)]">RAM Usage</span>
                  <span className="material-symbol text-[20px] text-[var(--md-sys-color-secondary,#67d4aa)]">speed</span>
                </div>
                <div className="text-3xl font-bold text-[var(--md-sys-color-on-surface)] mb-2 font-display">
                  {liveMetrics && liveMetrics.memoryTotalBytes > 0
                    ? `${Math.round((liveMetrics.memoryUsedBytes / liveMetrics.memoryTotalBytes) * 100)}%`
                    : "0%"}
                </div>
                <div className="w-full h-2 rounded-full bg-[var(--md-sys-color-surface-container)] overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[var(--md-sys-color-secondary,#67d4aa)] to-[var(--md-sys-color-primary)] rounded-full transition-all duration-300"
                    style={{
                      width: `${
                        liveMetrics && liveMetrics.memoryTotalBytes > 0
                          ? Math.min(100, Math.max(0, (liveMetrics.memoryUsedBytes / liveMetrics.memoryTotalBytes) * 100))
                          : 0
                      }%`,
                    }}
                  />
                </div>
              </M3Card>

              {/* Disk Storage Card */}
              <M3Card variant="filled" className="flex flex-col justify-between">
                <div className="flex items-center justify-between text-white/60 mb-3">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--md-sys-color-on-surface-variant)]">Disk Storage</span>
                  <span className="material-symbol text-[20px] text-[var(--md-sys-color-tertiary,#79d5f0)]">hard_drive</span>
                </div>
                <div className="text-3xl font-bold text-[var(--md-sys-color-on-surface)] mb-2 font-display">
                  {liveMetrics && liveMetrics.diskTotalBytes > 0
                    ? `${Math.round((liveMetrics.diskUsedBytes / liveMetrics.diskTotalBytes) * 100)}%`
                    : "0%"}
                </div>
                <div className="w-full h-2 rounded-full bg-[var(--md-sys-color-surface-container)] overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[var(--md-sys-color-tertiary,#79d5f0)] to-[var(--md-sys-color-primary)] rounded-full transition-all duration-300"
                    style={{
                      width: `${
                        liveMetrics && liveMetrics.diskTotalBytes > 0
                          ? Math.min(100, Math.max(0, (liveMetrics.diskUsedBytes / liveMetrics.diskTotalBytes) * 100))
                          : 0
                      }%`,
                    }}
                  />
                </div>
              </M3Card>

              {/* Network / Load Card */}
              <M3Card variant="filled" className="flex flex-col justify-between">
                <div className="flex items-center justify-between text-white/60 mb-3">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--md-sys-color-on-surface-variant)]">Load Average</span>
                  <span className="material-symbol text-[20px] text-[var(--md-sys-color-primary)]">monitoring</span>
                </div>
                <div className="text-base font-semibold text-[var(--md-sys-color-on-surface)] mb-1 font-mono">
                  1m: {liveMetrics?.loadAverage1m?.toFixed(2) ?? "0.00"}
                </div>
                <div className="text-sm font-medium text-[var(--md-sys-color-on-surface-variant)] font-mono">
                  5m: {liveMetrics?.loadAverage5m?.toFixed(2) ?? "0.00"} · 15m: {liveMetrics?.loadAverage15m?.toFixed(2) ?? "0.00"}
                </div>
              </M3Card>
            </div>

            {/* Host Information (Material 3 surfaceContainer) */}
            <M3Card variant="filled" className="space-y-4">
              <h3 className="text-xs font-bold text-[var(--md-sys-color-on-surface)] uppercase tracking-wider">Host Information</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-[13px]">
                <div>
                  <span className="text-[var(--md-sys-color-on-surface-variant)] block text-[11px] font-medium">System Status</span>
                  <span className="font-semibold text-[var(--md-sys-color-primary)]">Active (Normal)</span>
                </div>
                <div>
                  <span className="text-[var(--md-sys-color-on-surface-variant)] block text-[11px] font-medium">Server Host</span>
                  <span className="font-mono text-[var(--md-sys-color-on-surface)]">{host || "127.0.0.1"}</span>
                </div>
                <div>
                  <span className="text-[var(--md-sys-color-on-surface-variant)] block text-[11px] font-medium">Docker Daemon</span>
                  <span className={`font-semibold ${dockerAvailable ? "text-[var(--md-sys-color-primary)]" : "text-[var(--md-sys-color-on-surface-variant)]/60"}`}>
                    {dockerAvailable ? "Running" : "Not Found"}
                  </span>
                </div>
                <div>
                  <span className="text-[var(--md-sys-color-on-surface-variant)] block text-[11px] font-medium">Agent Protocol</span>
                  <span className="font-semibold text-[var(--md-sys-color-primary)]">Kairo v1 Protobuf</span>
                </div>
              </div>
            </M3Card>
          </div>
        )}

        {/* TAB 2: DOCKER CONTAINERS */}
        {activeTab === "docker" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold text-[var(--md-sys-color-on-surface)] uppercase tracking-wider">Docker Containers</h3>
                <p className="text-[12px] text-[var(--md-sys-color-on-surface-variant)]">Manage local and remote server container lifecycles.</p>
              </div>
              <M3Button
                variant="tonal"
                icon="refresh"
                onClick={() => void loadData()}
                className="!py-1 !px-3 !text-xs !rounded-full"
              >
                Refresh
              </M3Button>
            </div>

            {containers.length === 0 ? (
              <div className="p-8 rounded-[18px] bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)]/25 text-center">
                <span className="material-symbol text-[40px] text-[var(--md-sys-color-on-surface-variant)]/40 mx-auto mb-3 block">deployed_code</span>
                <h4 className="text-sm font-semibold text-[var(--md-sys-color-on-surface)] mb-1">No Docker Containers Found</h4>
                <p className="text-[12px] text-[var(--md-sys-color-on-surface-variant)] max-w-sm mx-auto">
                  {dockerAvailable
                    ? "No containers are currently running or stopped on this host."
                    : "Docker service is not currently running on this server."}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {containers.map((c) => {
                  const isRunning = c.state.toLowerCase() === "running";
                  return (
                    <div
                      key={c.id}
                      className="p-4 rounded-[18px] bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)]/25 hover:border-[var(--md-sys-color-outline-variant)]/50 transition-all flex flex-col justify-between shadow-sm"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span
                              className={`size-2.5 rounded-full ${
                                isRunning
                                  ? "bg-[var(--md-sys-color-primary)] shadow-[0_0_8px_var(--md-sys-color-primary)]"
                                  : "bg-[var(--md-sys-color-error)]"
                              }`}
                            />
                            <h4 className="text-sm font-semibold text-[var(--md-sys-color-on-surface)] truncate max-w-[200px]">
                              {c.name.replace(/^\//, "")}
                            </h4>
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                              isRunning
                                ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                                : "bg-red-500/15 text-red-300 border border-red-500/30"
                            }`}
                          >
                            {c.state}
                          </span>
                        </div>

                        <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] truncate font-mono mb-2">
                          Image: {c.image}
                        </p>

                        {c.ports && c.ports.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-3">
                            {c.ports.map((port, idx) => (
                              <span
                                key={idx}
                                className="px-2 py-0.5 rounded-md bg-[var(--md-sys-color-surface-container-high)] text-[10px] text-[var(--md-sys-color-on-surface-variant)] font-mono"
                              >
                                {port}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Controls */}
                      <div className="flex items-center gap-2 pt-3 border-t border-[var(--md-sys-color-outline-variant)]/20">
                        {isRunning ? (
                          <>
                            <M3Button
                              variant="tonal"
                              icon="stop"
                              onClick={() => handleContainerAction(c.id, ContainerAction.Stop)}
                              className="flex-1 !bg-red-500/15 !text-red-300 hover:!bg-red-500/25 !text-xs !py-1.5"
                            >
                              Stop
                            </M3Button>
                            <M3Button
                              variant="tonal"
                              icon="refresh"
                              onClick={() => handleContainerAction(c.id, ContainerAction.Restart)}
                              className="flex-1 !text-xs !py-1.5"
                            >
                              Restart
                            </M3Button>
                          </>
                        ) : (
                          <M3Button
                            variant="filled"
                            icon="play_arrow"
                            onClick={() => handleContainerAction(c.id, ContainerAction.Start)}
                            className="flex-1 !bg-emerald-600 !text-white hover:!bg-emerald-500 !text-xs !py-1.5"
                          >
                            Start
                          </M3Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: PROCESS MANAGER (Matching dots-hyprland killDialog.qml) */}
        {activeTab === "processes" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-xs font-bold text-[var(--md-sys-color-on-surface)] uppercase tracking-wider">Process Manager</h3>
                <p className="text-[12px] text-[var(--md-sys-color-on-surface-variant)]">View and terminate hung or high-usage processes.</p>
              </div>

              {/* M3 Search Bar Pill */}
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)]/30 w-64 shadow-sm">
                <span className="material-symbol text-[18px] text-[var(--md-sys-color-on-surface-variant)]">search</span>
                <input
                  type="text"
                  value={procFilter}
                  onChange={(e) => setProcFilter(e.target.value)}
                  placeholder="Filter processes..."
                  className="bg-transparent text-xs text-[var(--md-sys-color-on-surface)] placeholder-[var(--md-sys-color-on-surface-variant)]/50 focus:outline-none w-full"
                />
              </div>
            </div>

            <div className="rounded-[18px] bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)]/25 overflow-hidden shadow-sm">
              <div className="grid grid-cols-12 px-4 py-2.5 bg-[var(--md-sys-color-surface-container-high)] border-b border-[var(--md-sys-color-outline-variant)]/20 text-[11px] font-bold text-[var(--md-sys-color-on-surface-variant)] uppercase tracking-wider">
                <span className="col-span-2">PID</span>
                <span className="col-span-6">Executable</span>
                <span className="col-span-2">User</span>
                <span className="col-span-2 text-right">Action</span>
              </div>

              <div className="divide-y divide-[var(--md-sys-color-outline-variant)]/15 max-h-[380px] overflow-y-auto">
                {filteredProcesses.length === 0 ? (
                  <div className="p-6 text-center text-[var(--md-sys-color-on-surface-variant)] text-xs">
                    No matching processes found.
                  </div>
                ) : (
                  filteredProcesses.slice(0, 100).map((proc) => (
                    <div
                      key={proc.processId || proc.pid}
                      className="grid grid-cols-12 items-center px-4 py-2 hover:bg-[var(--md-sys-color-on-surface)]/5 text-xs transition-colors"
                    >
                      <span className="col-span-2 font-mono text-[var(--md-sys-color-on-surface-variant)]">{proc.pid}</span>
                      <span className="col-span-6 font-semibold text-[var(--md-sys-color-on-surface)] truncate pr-2">
                        {proc.executable}
                      </span>
                      <span className="col-span-2 text-[var(--md-sys-color-on-surface-variant)] truncate font-mono">{proc.owner || "root"}</span>
                      <div className="col-span-2 flex justify-end">
                        <M3Button
                          variant="tonal"
                          onClick={() => handleKillProcess(proc.processId || String(proc.pid))}
                          className="!py-1 !px-3 !rounded-full !bg-rose-500/15 !text-rose-300 hover:!bg-rose-500 hover:!text-white !text-[11px]"
                        >
                          Kill
                        </M3Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
