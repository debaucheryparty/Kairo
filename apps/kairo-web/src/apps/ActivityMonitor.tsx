import { useCallback, useEffect, useState } from 'react';
import type { KairoClient, KairoSession, ProcessInfo, SystemMetrics } from '@kairo/runtime';

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
  const [activeTab, setActiveTab] = useState<'telemetry' | 'processes'>('telemetry');
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [processes, setProcesses] = useState<ProcessInfo[]>([]);
  const [procSearch, setProcSearch] = useState('');
  const [loadingProcesses, setLoadingProcesses] = useState(false);

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

  const fetchProcesses = useCallback(async () => {
    try {
      setLoadingProcesses(true);
      const list = await client.listProcesses();
      setProcesses(list);
    } catch (e) {
      console.error('Failed to list processes:', e);
    } finally {
      setLoadingProcesses(false);
    }
  }, [client]);

  useEffect(() => {
    if (activeTab === 'processes') {
      fetchProcesses();
      const interval = setInterval(fetchProcesses, 4000);
      return () => clearInterval(interval);
    }
  }, [activeTab, fetchProcesses]);

  const handleKill = async (pid: string) => {
    try {
      await client.killProcess(pid);
      setProcesses((prev) => prev.filter((p) => p.processId !== pid));
    } catch (e) {
      console.error('Failed to kill process:', e);
    }
  };

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

  const filteredProcesses = processes.filter((p) => {
    const q = procSearch.toLowerCase();
    return (
      p.executable.toLowerCase().includes(q) ||
      p.pid.toString().includes(q) ||
      p.owner.toLowerCase().includes(q) ||
      p.arguments.some((arg) => arg.toLowerCase().includes(q))
    );
  });

  return (
    <div className="monitor-app" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Tab Navigation */}
      <div
        className="monitor-tabs"
        style={{
          display: 'flex',
          gap: 8,
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          paddingBottom: 8,
          marginBottom: 12,
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab('telemetry')}
          style={{
            background: activeTab === 'telemetry' ? 'rgba(99, 102, 241, 0.2)' : 'transparent',
            border: activeTab === 'telemetry' ? '1px solid rgba(99, 102, 241, 0.4)' : '1px solid transparent',
            borderRadius: 6,
            color: activeTab === 'telemetry' ? '#a5b4fc' : '#94a3b8',
            fontSize: 12,
            fontWeight: 600,
            padding: '5px 12px',
            cursor: 'pointer',
          }}
        >
          Telemetry & Hardware
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('processes')}
          style={{
            background: activeTab === 'processes' ? 'rgba(99, 102, 241, 0.2)' : 'transparent',
            border: activeTab === 'processes' ? '1px solid rgba(99, 102, 241, 0.4)' : '1px solid transparent',
            borderRadius: 6,
            color: activeTab === 'processes' ? '#a5b4fc' : '#94a3b8',
            fontSize: 12,
            fontWeight: 600,
            padding: '5px 12px',
            cursor: 'pointer',
          }}
        >
          Processes {processes.length > 0 && `(${processes.length})`}
        </button>
      </div>

      {activeTab === 'telemetry' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>
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
      ) : (
        /* Processes Table */
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center' }}>
            <input
              type="text"
              placeholder="Search process name, PID, or user..."
              value={procSearch}
              onChange={(e) => setProcSearch(e.target.value)}
              style={{
                flex: 1,
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 6,
                padding: '6px 10px',
                color: '#f8fafc',
                fontSize: 12,
                outline: 'none',
              }}
            />
            <button
              type="button"
              onClick={fetchProcesses}
              disabled={loadingProcesses}
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 6,
                color: '#cbd5e1',
                fontSize: 11,
                padding: '6px 12px',
                cursor: 'pointer',
              }}
            >
              {loadingProcesses ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>

          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 8,
              background: 'rgba(0,0,0,0.2)',
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', color: '#94a3b8', background: 'rgba(255,255,255,0.02)' }}>
                  <th style={{ padding: '8px 10px', width: 60 }}>PID</th>
                  <th style={{ padding: '8px 10px' }}>Name</th>
                  <th style={{ padding: '8px 10px' }}>Owner</th>
                  <th style={{ padding: '8px 10px', width: 60, textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredProcesses.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>
                      {loadingProcesses ? 'Loading process tree...' : 'No matching processes.'}
                    </td>
                  </tr>
                ) : (
                  filteredProcesses.map((proc) => (
                    <tr
                      key={proc.processId}
                      style={{
                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      <td style={{ padding: '6px 10px', color: '#a5b4fc' }}>{proc.pid}</td>
                      <td style={{ padding: '6px 10px', color: '#f1f5f9' }} title={proc.arguments.join(' ')}>
                        <span style={{ fontWeight: 600 }}>{proc.executable}</span>
                        {proc.arguments.length > 1 && (
                          <span style={{ color: '#64748b', marginLeft: 6, fontSize: 10 }}>
                            {proc.arguments.slice(1).join(' ').slice(0, 45)}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '6px 10px', color: '#94a3b8' }}>{proc.owner}</td>
                      <td style={{ padding: '6px 10px', textAlign: 'right' }}>
                        <button
                          type="button"
                          onClick={() => handleKill(proc.processId)}
                          style={{
                            background: 'rgba(239, 68, 68, 0.15)',
                            border: '1px solid rgba(239, 68, 68, 0.3)',
                            borderRadius: 4,
                            color: '#f87171',
                            fontSize: 10,
                            padding: '2px 6px',
                            cursor: 'pointer',
                          }}
                        >
                          Kill
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
