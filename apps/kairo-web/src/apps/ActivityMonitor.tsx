import { useCallback, useEffect, useState } from 'react';
import {
  ContainerAction,
  type DockerContainer,
  type KairoClient,
  type KairoSession,
  type ProcessInfo,
  ServiceAction,
  type SystemMetrics,
  type SystemService,
} from '@kairo/runtime';

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
  const [activeTab, setActiveTab] = useState<'telemetry' | 'processes' | 'containers' | 'services'>('telemetry');
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [processes, setProcesses] = useState<ProcessInfo[]>([]);
  const [procSearch, setProcSearch] = useState('');
  const [loadingProcesses, setLoadingProcesses] = useState(false);

  // Docker state
  const [containers, setContainers] = useState<DockerContainer[]>([]);
  const [dockerAvailable, setDockerAvailable] = useState<boolean>(true);
  const [loadingContainers, setLoadingContainers] = useState(false);
  const [containerLogs, setContainerLogs] = useState<{ id: string; logs: string } | null>(null);

  // Services state
  const [services, setServices] = useState<SystemService[]>([]);
  const [systemdAvailable, setSystemdAvailable] = useState<boolean>(true);
  const [loadingServices, setLoadingServices] = useState(false);
  const [serviceSearch, setServiceSearch] = useState('');

  // Fetch telemetry metrics
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

  // Fetch running processes
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

  // Fetch Docker containers
  const fetchContainers = useCallback(async () => {
    try {
      setLoadingContainers(true);
      const res = await client.listContainers(true);
      setContainers(res.containers);
      setDockerAvailable(res.dockerAvailable);
    } catch (e) {
      console.error('Failed to list containers:', e);
    } finally {
      setLoadingContainers(false);
    }
  }, [client]);

  useEffect(() => {
    if (activeTab === 'containers') {
      fetchContainers();
      const interval = setInterval(fetchContainers, 5000);
      return () => clearInterval(interval);
    }
  }, [activeTab, fetchContainers]);

  // Fetch System services
  const fetchServices = useCallback(async () => {
    try {
      setLoadingServices(true);
      const res = await client.listServices();
      setServices(res.services);
      setSystemdAvailable(res.systemdAvailable);
    } catch (e) {
      console.error('Failed to list services:', e);
    } finally {
      setLoadingServices(false);
    }
  }, [client]);

  useEffect(() => {
    if (activeTab === 'services') {
      fetchServices();
      const interval = setInterval(fetchServices, 8000);
      return () => clearInterval(interval);
    }
  }, [activeTab, fetchServices]);

  const handleKill = async (pid: string) => {
    try {
      await client.killProcess(pid);
      setProcesses((prev) => prev.filter((p) => p.processId !== pid));
    } catch (e) {
      console.error('Failed to kill process:', e);
    }
  };

  const handleManageContainer = async (id: string, action: ContainerAction) => {
    try {
      await client.manageContainer(id, action);
      await fetchContainers();
    } catch (e) {
      console.error('Failed to manage container:', e);
    }
  };

  const handleViewContainerLogs = async (id: string) => {
    try {
      const logs = await client.getContainerLogs(id, 150);
      setContainerLogs({ id, logs });
    } catch (e) {
      console.error('Failed to fetch container logs:', e);
    }
  };

  const handleManageService = async (name: string, action: ServiceAction) => {
    try {
      await client.manageService(name, action);
      await fetchServices();
    } catch (e) {
      console.error('Failed to manage service:', e);
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

  const filteredServices = services.filter((s) => {
    const q = serviceSearch.toLowerCase();
    return s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q);
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
          Hardware & Telemetry
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
        <button
          type="button"
          onClick={() => setActiveTab('containers')}
          style={{
            background: activeTab === 'containers' ? 'rgba(99, 102, 241, 0.2)' : 'transparent',
            border: activeTab === 'containers' ? '1px solid rgba(99, 102, 241, 0.4)' : '1px solid transparent',
            borderRadius: 6,
            color: activeTab === 'containers' ? '#a5b4fc' : '#94a3b8',
            fontSize: 12,
            fontWeight: 600,
            padding: '5px 12px',
            cursor: 'pointer',
          }}
        >
          Docker {containers.length > 0 && `(${containers.length})`}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('services')}
          style={{
            background: activeTab === 'services' ? 'rgba(99, 102, 241, 0.2)' : 'transparent',
            border: activeTab === 'services' ? '1px solid rgba(99, 102, 241, 0.4)' : '1px solid transparent',
            borderRadius: 6,
            color: activeTab === 'services' ? '#a5b4fc' : '#94a3b8',
            fontSize: 12,
            fontWeight: 600,
            padding: '5px 12px',
            cursor: 'pointer',
          }}
        >
          Services {services.length > 0 && `(${services.length})`}
        </button>
      </div>

      {activeTab === 'telemetry' && (
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
                <span className="telemetry-label">Session ID</span>
                <span className="telemetry-val code">{session.sessionId.slice(0, 16)}...</span>
              </div>
              <div className="telemetry-card">
                <span className="telemetry-label">Computer / Host ID</span>
                <span className="telemetry-val code">{session.computerId.slice(0, 16)}...</span>
              </div>
              <div className="telemetry-card">
                <span className="telemetry-label">Protocol Version</span>
                <span className="telemetry-val">v{session.protocolVersion}</span>
              </div>
              <div className="telemetry-card">
                <span className="telemetry-label">Capabilities</span>
                <span className="telemetry-val" style={{ fontSize: 11 }}>
                  {session.capabilities.join(', ')}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'processes' && (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          {/* Process Controls */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
            <input
              type="text"
              placeholder="Search process name, PID, or user..."
              value={procSearch}
              onChange={(e) => setProcSearch(e.target.value)}
              style={{
                flex: 1,
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: 6,
                padding: '6px 12px',
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
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: 6,
                color: '#cbd5e1',
                padding: '6px 12px',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              {loadingProcesses ? 'Refreshing...' : '🔄 Refresh'}
            </button>
          </div>

          {/* Process Table */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 6,
              background: 'rgba(0, 0, 0, 0.2)',
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 11 }}>
              <thead>
                <tr
                  style={{
                    background: 'rgba(255, 255, 255, 0.04)',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                    color: '#94a3b8',
                  }}
                >
                  <th style={{ padding: '8px 10px', width: 60 }}>PID</th>
                  <th style={{ padding: '8px 10px' }}>Executable & Args</th>
                  <th style={{ padding: '8px 10px', width: 90 }}>Owner</th>
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

      {activeTab === 'containers' && (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          {!dockerAvailable ? (
            <div
              style={{
                padding: 24,
                textAlign: 'center',
                background: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                borderRadius: 8,
                color: '#fca5a5',
              }}
            >
              <div style={{ fontSize: 24, marginBottom: 8 }}>🐳</div>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>Docker Daemon Unavailable</div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>
                Docker is either not installed or the docker daemon is not currently running on this remote host.
              </div>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: '#94a3b8' }}>
                  {containers.length} container(s) found on host
                </span>
                <button
                  type="button"
                  onClick={fetchContainers}
                  disabled={loadingContainers}
                  style={{
                    background: 'rgba(255, 255, 255, 0.08)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: 6,
                    color: '#cbd5e1',
                    padding: '6px 12px',
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  {loadingContainers ? 'Refreshing...' : '🔄 Refresh'}
                </button>
              </div>

              <div
                style={{
                  flex: 1,
                  overflowY: 'auto',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: 6,
                  background: 'rgba(0, 0, 0, 0.2)',
                }}
              >
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 11 }}>
                  <thead>
                    <tr
                      style={{
                        background: 'rgba(255, 255, 255, 0.04)',
                        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                        color: '#94a3b8',
                      }}
                    >
                      <th style={{ padding: '8px 10px', width: 80 }}>ID</th>
                      <th style={{ padding: '8px 10px' }}>Name / Image</th>
                      <th style={{ padding: '8px 10px', width: 90 }}>Status</th>
                      <th style={{ padding: '8px 10px', width: 140 }}>Ports</th>
                      <th style={{ padding: '8px 10px', width: 160, textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {containers.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>
                          No Docker containers currently configured.
                        </td>
                      </tr>
                    ) : (
                      containers.map((c) => {
                        const isRunning = c.state.toLowerCase() === 'running';
                        return (
                          <tr
                            key={c.id}
                            style={{
                              borderBottom: '1px solid rgba(255,255,255,0.04)',
                              fontFamily: 'var(--font-mono)',
                            }}
                          >
                            <td style={{ padding: '8px 10px', color: '#38bdf8' }}>{c.id.slice(0, 10)}</td>
                            <td style={{ padding: '8px 10px', color: '#f1f5f9' }}>
                              <div style={{ fontWeight: 600 }}>{c.name}</div>
                              <div style={{ color: '#64748b', fontSize: 10 }}>{c.image}</div>
                            </td>
                            <td style={{ padding: '8px 10px' }}>
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  padding: '2px 6px',
                                  borderRadius: 4,
                                  fontSize: 10,
                                  fontWeight: 600,
                                  background: isRunning ? 'rgba(16, 185, 129, 0.15)' : 'rgba(148, 163, 184, 0.15)',
                                  color: isRunning ? '#34d399' : '#94a3b8',
                                }}
                              >
                                <span
                                  style={{
                                    width: 5,
                                    height: 5,
                                    borderRadius: '50%',
                                    backgroundColor: isRunning ? '#10b981' : '#64748b',
                                  }}
                                />
                                {c.state}
                              </span>
                            </td>
                            <td style={{ padding: '8px 10px', color: '#94a3b8', fontSize: 10 }}>
                              {c.ports.length > 0 ? c.ports.join(', ') : 'None'}
                            </td>
                            <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                              <div style={{ display: 'inline-flex', gap: 4 }}>
                                {isRunning ? (
                                  <button
                                    type="button"
                                    onClick={() => handleManageContainer(c.id, ContainerAction.Stop)}
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
                                    Stop
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleManageContainer(c.id, ContainerAction.Start)}
                                    style={{
                                      background: 'rgba(16, 185, 129, 0.15)',
                                      border: '1px solid rgba(16, 185, 129, 0.3)',
                                      borderRadius: 4,
                                      color: '#34d399',
                                      fontSize: 10,
                                      padding: '2px 6px',
                                      cursor: 'pointer',
                                    }}
                                  >
                                    Start
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleManageContainer(c.id, ContainerAction.Restart)}
                                  style={{
                                    background: 'rgba(255, 255, 255, 0.06)',
                                    border: '1px solid rgba(255, 255, 255, 0.15)',
                                    borderRadius: 4,
                                    color: '#cbd5e1',
                                    fontSize: 10,
                                    padding: '2px 6px',
                                    cursor: 'pointer',
                                  }}
                                >
                                  Restart
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleViewContainerLogs(c.id)}
                                  style={{
                                    background: 'rgba(99, 102, 241, 0.15)',
                                    border: '1px solid rgba(99, 102, 241, 0.3)',
                                    borderRadius: 4,
                                    color: '#a5b4fc',
                                    fontSize: 10,
                                    padding: '2px 6px',
                                    cursor: 'pointer',
                                  }}
                                >
                                  Logs
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Logs Drawer */}
              {containerLogs && (
                <div
                  style={{
                    marginTop: 12,
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: 6,
                    background: '#090d16',
                    padding: 12,
                    maxHeight: 180,
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, alignItems: 'center' }}>
                    <span style={{ fontWeight: 600, fontSize: 11, color: '#38bdf8' }}>
                      Logs: {containerLogs.id}
                    </span>
                    <button
                      type="button"
                      onClick={() => setContainerLogs(null)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#94a3b8',
                        cursor: 'pointer',
                        fontSize: 12,
                      }}
                    >
                      ✕ Close
                    </button>
                  </div>
                  <pre
                    style={{
                      flex: 1,
                      overflowY: 'auto',
                      fontSize: 10,
                      color: '#cbd5e1',
                      fontFamily: 'var(--font-mono)',
                      margin: 0,
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {containerLogs.logs || '(No recent log output)'}
                  </pre>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {activeTab === 'services' && (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          {!systemdAvailable ? (
            <div
              style={{
                padding: 24,
                textAlign: 'center',
                background: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                borderRadius: 8,
                color: '#fca5a5',
              }}
            >
              <div style={{ fontSize: 24, marginBottom: 8 }}>⚙️</div>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>Systemd Unavailable</div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>
                Systemd/systemctl service manager is not available on this host platform.
              </div>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
                <input
                  type="text"
                  placeholder="Filter system services (e.g. nginx, ssh, docker)..."
                  value={serviceSearch}
                  onChange={(e) => setServiceSearch(e.target.value)}
                  style={{
                    flex: 1,
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: 6,
                    padding: '6px 12px',
                    color: '#f8fafc',
                    fontSize: 12,
                    outline: 'none',
                  }}
                />
                <button
                  type="button"
                  onClick={fetchServices}
                  disabled={loadingServices}
                  style={{
                    background: 'rgba(255, 255, 255, 0.08)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: 6,
                    color: '#cbd5e1',
                    padding: '6px 12px',
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  {loadingServices ? 'Refreshing...' : '🔄 Refresh'}
                </button>
              </div>

              <div
                style={{
                  flex: 1,
                  overflowY: 'auto',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: 6,
                  background: 'rgba(0, 0, 0, 0.2)',
                }}
              >
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 11 }}>
                  <thead>
                    <tr
                      style={{
                        background: 'rgba(255, 255, 255, 0.04)',
                        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                        color: '#94a3b8',
                      }}
                    >
                      <th style={{ padding: '8px 10px', width: 180 }}>Unit Name</th>
                      <th style={{ padding: '8px 10px' }}>Description</th>
                      <th style={{ padding: '8px 10px', width: 80 }}>Active</th>
                      <th style={{ padding: '8px 10px', width: 80 }}>Sub State</th>
                      <th style={{ padding: '8px 10px', width: 140, textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredServices.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>
                          {loadingServices ? 'Loading system units...' : 'No matching services.'}
                        </td>
                      </tr>
                    ) : (
                      filteredServices.map((s) => {
                        const isActive = s.activeState.toLowerCase() === 'active';
                        return (
                          <tr
                            key={s.name}
                            style={{
                              borderBottom: '1px solid rgba(255,255,255,0.04)',
                              fontFamily: 'var(--font-mono)',
                            }}
                          >
                            <td style={{ padding: '8px 10px', color: '#f1f5f9', fontWeight: 600 }}>{s.name}</td>
                            <td style={{ padding: '8px 10px', color: '#94a3b8' }}>{s.description || '—'}</td>
                            <td style={{ padding: '8px 10px' }}>
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  padding: '2px 6px',
                                  borderRadius: 4,
                                  fontSize: 10,
                                  fontWeight: 600,
                                  background: isActive ? 'rgba(16, 185, 129, 0.15)' : 'rgba(148, 163, 184, 0.15)',
                                  color: isActive ? '#34d399' : '#94a3b8',
                                }}
                              >
                                <span
                                  style={{
                                    width: 5,
                                    height: 5,
                                    borderRadius: '50%',
                                    backgroundColor: isActive ? '#10b981' : '#64748b',
                                  }}
                                />
                                {s.activeState}
                              </span>
                            </td>
                            <td style={{ padding: '8px 10px', color: '#64748b', fontSize: 10 }}>{s.subState}</td>
                            <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                              <div style={{ display: 'inline-flex', gap: 4 }}>
                                {isActive ? (
                                  <button
                                    type="button"
                                    onClick={() => handleManageService(s.name, ServiceAction.Stop)}
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
                                    Stop
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleManageService(s.name, ServiceAction.Start)}
                                    style={{
                                      background: 'rgba(16, 185, 129, 0.15)',
                                      border: '1px solid rgba(16, 185, 129, 0.3)',
                                      borderRadius: 4,
                                      color: '#34d399',
                                      fontSize: 10,
                                      padding: '2px 6px',
                                      cursor: 'pointer',
                                    }}
                                  >
                                    Start
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleManageService(s.name, ServiceAction.Restart)}
                                  style={{
                                    background: 'rgba(255, 255, 255, 0.06)',
                                    border: '1px solid rgba(255, 255, 255, 0.15)',
                                    borderRadius: 4,
                                    color: '#cbd5e1',
                                    fontSize: 10,
                                    padding: '2px 6px',
                                    cursor: 'pointer',
                                  }}
                                >
                                  Restart
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
