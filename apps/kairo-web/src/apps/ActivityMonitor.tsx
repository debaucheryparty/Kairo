import type { KairoSession } from '@kairo/runtime';

interface ActivityMonitorProps {
  session: KairoSession | null;
}

export function ActivityMonitor({ session }: ActivityMonitorProps) {
  if (!session) {
    return (
      <div className="monitor-app empty">
        <p>No active agent session.</p>
      </div>
    );
  }

  return (
    <div className="monitor-app">
      <div className="monitor-section">
        <h3>System & Host Telemetry</h3>
        <div className="telemetry-grid">
          <div className="telemetry-card">
            <span className="telemetry-label">Status</span>
            <span className="telemetry-val text-success">Online</span>
          </div>
          <div className="telemetry-card">
            <span className="telemetry-label">Protocol</span>
            <span className="telemetry-val">v{session.protocolVersion}</span>
          </div>
          <div className="telemetry-card">
            <span className="telemetry-label">Transport</span>
            <span className="telemetry-val">WebSocket Binary</span>
          </div>
          <div className="telemetry-card">
            <span className="telemetry-label">Encoding</span>
            <span className="telemetry-val">Protobuf (v1)</span>
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
