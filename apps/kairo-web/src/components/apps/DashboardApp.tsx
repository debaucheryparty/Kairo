"use client";

import { useEffect, useState } from "react";
import { BrandMark } from "@/src/components/brand/BrandMark";
import { useServer } from "@/src/lib/api/server-context";
import { useRuntimeClient, useSelectedServer } from "@/src/lib/session";
import type { SystemMetrics } from "@kairo/runtime";

function formatUptime(seconds: number) {
  if (!seconds) return "—";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function statusCopy(status: string | undefined, error: string | null, name: string, isLive: boolean) {
  if (isLive) return "Connected to live Kairo Agent.";
  if (status === "online") return "Connected over SSH.";
  if (status === "connecting") return `Connecting to ${name}…`;
  if (status === "authentication_failed")
    return "Authentication failed. Edit the server and retry.";
  return error || "Unable to connect to server.";
}

export function DashboardApp() {
  const selected = useSelectedServer();
  const runtimeClient = useRuntimeClient();
  const { server, loading, error, refresh, lastUpdatedAt } = useServer();
  const [liveMetrics, setLiveMetrics] = useState<SystemMetrics | null>(null);

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

  const isLive = Boolean(runtimeClient?.getSession());
  const online = isLive || server?.status === "online";
  const name = selected?.name || server?.name || "Server";
  const host = selected?.address || server?.host;
  const hostname = selected?.hostname || server?.hostname;
  const username = selected?.username || server?.username;
  const lastUpdated = isLive
    ? "just now"
    : lastUpdatedAt
      ? formatClock(lastUpdatedAt)
      : server?.lastSeen
        ? formatLastSeen(server.lastSeen)
        : null;

  return (
    <div className="h-full overflow-auto sui-app p-6">
      <div className="flex items-center gap-3">
        <BrandMark size={36} />
        <p className="text-[11px] font-medium uppercase tracking-[0.22em] sui-muted">Kairo</p>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <h3 className="text-2xl font-semibold tracking-tight sui-title">{name}</h3>
        <span
          className={`size-2 rounded-full ${
            online ? "bg-emerald-500" : loading ? "bg-amber-400" : "bg-red-500"
          }`}
          aria-hidden
        />
        <span className="text-sm sui-muted">
          {online ? "Online" : loading && !server ? "Connecting" : "Offline"}
        </span>
        <button
          type="button"
          onClick={() => void refresh()}
          className="ml-auto rounded-md border border-black/10 bg-black/[0.03] px-2.5 py-1 text-[12px] sui-title hover:bg-black/[0.06]"
        >
          Refresh
        </button>
      </div>
      <p className="mt-2 text-sm sui-muted">
        {loading && !server && !isLive ? "Loading live metrics…" : statusCopy(server?.status, error, name, isLive)}
      </p>
      {username && host ? (
        <p className="mt-1 text-xs sui-muted">
          {username}@{host}
          {hostname ? ` · ${hostname}` : ""}
        </p>
      ) : null}
      <p className="mt-1 text-xs sui-muted">
        {loading && !server && !isLive
          ? "Connecting to agent..."
          : isLive
            ? (liveMetrics ? `Live • Last updated: ${lastUpdated || "just now"}` : "Agent connected • Loading metrics...")
            : "Agent not loaded / offline"}
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <MetricCard
          label="CPU"
          value={isLive && liveMetrics ? `${Math.round(liveMetrics.cpuUsagePercent)}%` : "—"}
          loading={loading && !server && !isLive}
          unavailable={!isLive && !loading}
        />
        <MetricCard
          label="RAM"
          value={isLive && liveMetrics && liveMetrics.memoryTotalBytes > 0 ? `${Math.round((liveMetrics.memoryUsedBytes / liveMetrics.memoryTotalBytes) * 100)}%` : "—"}
          loading={loading && !server && !isLive}
          unavailable={!isLive && !loading}
        />
        <MetricCard
          label="Disk"
          value={isLive && liveMetrics && liveMetrics.diskTotalBytes > 0 ? `${Math.round((liveMetrics.diskUsedBytes / liveMetrics.diskTotalBytes) * 100)}%` : "—"}
          loading={loading && !server && !isLive}
          unavailable={!isLive && !loading}
        />
        <MetricCard
          label="Uptime"
          value={isLive && liveMetrics ? formatUptime(liveMetrics.uptimeSeconds) : "—"}
          loading={loading && !server && !isLive}
          unavailable={!isLive && !loading}
        />
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  loading,
  unavailable,
}: {
  label: string;
  value: string;
  loading: boolean;
  unavailable?: boolean;
}) {
  return (
    <div className="sui-card rounded-xl px-4 py-3 shadow-sm">
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] sui-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums sui-title">{loading ? "…" : value}</p>
      {unavailable && !loading ? <p className="mt-1 text-[11px] sui-muted">Unavailable</p> : null}
    </div>
  );
}

function formatLastSeen(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatClock(ms: number) {
  return new Date(ms).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
