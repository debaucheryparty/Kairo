import { useEffect, useState } from 'react';
import type { KairoClient, KairoSession, SystemMetrics } from '@kairo/runtime';

interface ActivityMonitorProps {
  client: KairoClient;
  session: KairoSession | null;
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${Math.floor(seconds % 60)}s`;
}

export function ActivityMonitor({ client, session }: ActivityMonitorProps) {
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);

  useEffect(() => {
    let isMounted = true;
    const fetchMetrics = async () => {
      try {
        const data = await client.getMetrics();
        if (isMounted) {
          setMetrics(data);
        }
      } catch (e) {
        console.error('Failed to fetch metrics:', e);
      }
    };

    fetchMetrics();
    const interval = setInterval(fetchMetrics, 2000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [client]);

  if (!session) {
    return (
      <div className="monitor-app empty">
        <p>No active agent session.</p>
      </div>
    );
  }

  const memPercent =
    metrics && metrics.memoryTotalBytes > 0
      ? Math.round((metrics.memoryUsedBytes / metrics.memoryTotalBytes) * 100)
      : 0;

  const diskPercent =
    metrics && metrics.diskTotalBytes > 0
      ? Math.round((metrics.diskUsedBytes / metrics.diskTotalBytes) * 100)
      : 0;

  const cpuPercent = metrics ? Math.round(metrics.cpuUsagePercent) : 0;

  return (
    <div className="monitor-app">
      {/* Real-time Hardware Telemetry */}
      <div className="monitor-section">
        <h3>Hardware Utilization</h3>
        <div className="telemetry-grid">
          <div className="telemetry-card">
            <div className="metric-header" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span className="telemetry-label">CPU Usage</span>
              <span className="telemetry-val" style={{ color: cpuPercent > 80 ? '#f87171' : '#38bdf8' }}>
                {cpuPercent}%
              </span>
            </div>
            <div style={{ height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${Math.min(cpuPercent, 100)}%`,
                  background: cpuPercent > 80 ? '#ef4444' : '#38bdf8',
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
            <div style={{ fontSize: 10, color: 'var(--color-text-muted)', marginTop: 4 }}>
              Load: {metrics ? `${metrics.loadAverage1m.toFixed(2)}, ${metrics.loadAverage5m.toFixed(2)}, ${metrics.loadAverage15m.toFixed(2)}` : '...'}
            </div>
          </div>

          <div className="telemetry-card">
            <div className="metric-header" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span className="telemetry-label">Memory</span>
              <span className="telemetry-val" style={{ color: memPercent > 85 ? '#f87171' : '#a855f7' }}>
                {memPercent}%
              </span>
            </div>
            <div style={{ height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${Math.min(memPercent, 100)}%`,
                  background: memPercent > 85 ? '#ef4444' : '#a855f7',
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
            <div style={{ fontSize: 10, color: 'var(--color-text-muted)', marginTop: 4 }}>
              {metrics ? `${formatBytes(metrics.memoryUsedBytes)} / ${formatBytes(metrics.memoryTotalBytes)}` : '...'}
            </div>
          </div>

          <div className="telemetry-card">
            <div className="metric-header" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span className="telemetry-label">Disk Storage</span>
              <span className="telemetry-val" style={{ color: diskPercent > 90 ? '#f87171' : '#10b981' }}>
                {diskPercent}%
              </span>
            </div>
            <div style={{ height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${Math.min(diskPercent, 100)}%`,
                  background: diskPercent > 90 ? '#ef4444' : '#10b981',
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
            <div style={{ fontSize: 10, color: 'var(--color-text-muted)', marginTop: 4 }}>
              {metrics ? `${formatBytes(metrics.diskUsedBytes)} / ${formatBytes(metrics.diskTotalBytes)}` : '...'}
            </div>
          </div>

          <div className="telemetry-card">
            <div className="metric-header" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span className="telemetry-label">Host Uptime</span>
              <span className="telemetry-val text-success">
                {metrics ? formatUptime(metrics.uptimeSeconds) : '...'}
              </span>
            </div>
            <div style={{ fontSize: 10, color: 'var(--color-text-muted)', marginTop: 10 }}>
              Agent Status: <span style={{ color: '#10b981' }}>● Active</span>
            </div>
          </div>
        </div>
      </div>

      {/* Protocol & Session Telemetry */}
      <div className="monitor-section">
        <h3>Session Telemetry</h3>
        <div className="telemetry-grid">
          <div className="telemetry-card">
            <span className="telemetry-label">Connection</span>
            <span className="telemetry-val text-success">Online (Direct TCP/WS)</span>
          </div>
          <div className="telemetry-card">
            <span className="telemetry-label">Protocol Version</span>
            <span className="telemetry-val">v{session.protocolVersion}</span>
          </div>
        </div>
      </div>

      <div className="monitor-section">
        <h3>Identifiers</h3>
        <div className="id-row">
          <span className="id-label">Agent ID:</span>
          <code className="id-val">{session.computerId}</code>
        </div>
        <div className="id-row">
          <span className="id-label">Session ID:</span>
          <code className="id-val">{session.sessionId}</code>
        </div>
      </div>

      <div className="monitor-section">
        <h3>Negotiated Capabilities ({session.capabilities.length})</h3>
        <div className="capabilities-grid">
          {session.capabilities.map((cap) => (
            <div key={cap} className="cap-badge">
              <span className="cap-dot" />
              <span>{cap}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
