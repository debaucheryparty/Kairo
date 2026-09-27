import {
  ConnectionState,
  createConnectionStore,
  KairoClient,
  WebSocketTransportAdapter,
  type KairoSession,
} from '@kairo/runtime';
import { useEffect, useMemo, useState } from 'react';

export function App() {
  const [store] = useState(() => createConnectionStore());
  const [state, setState] = useState(() => store.getState().state);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<KairoSession | null>(null);
  const [agentUrl, setAgentUrl] = useState('ws://127.0.0.1:9600');

  const client = useMemo(() => {
    const transport = new WebSocketTransportAdapter();
    return new KairoClient({
      transport,
      connectionStore: store,
      clientId: 'kairo-web-shell',
    });
  }, [store]);

  useEffect(() => {
    const unsubscribe = store.subscribe((curr) => {
      setState(curr.state);
      setError(curr.error);
    });
    return () => unsubscribe();
  }, [store]);

  const handleConnect = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    try {
      setError(null);
      const activeSession = await client.connect(agentUrl);
      setSession(activeSession);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDisconnect = async () => {
    await client.disconnect();
    setSession(null);
  };

  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar-left">
          <span className="topbar-brand">Kairo</span>
          <div className="topbar-status">
            <span className={`status-indicator status-${state}`} />
            <span>{state.charAt(0).toUpperCase() + state.slice(1)}</span>
          </div>
        </div>

        <div className="topbar-right">
          {state === ConnectionState.Connected && (
            <button
              type="button"
              className="btn-secondary"
              onClick={handleDisconnect}
            >
              Disconnect
            </button>
          )}
        </div>
      </header>

      <main className="desktop">
        {state !== ConnectionState.Connected ? (
          <div className="connection-card">
            <h2>Connect to Linux Computer</h2>
            <p>
              Enter the endpoint of your running Kairo Agent to authenticate and
              start a remote session.
            </p>

            <form onSubmit={handleConnect}>
              <div className="form-group">
                <label htmlFor="agent-url">Agent WebSocket URL</label>
                <input
                  id="agent-url"
                  className="form-input"
                  type="text"
                  value={agentUrl}
                  onChange={(e) => setAgentUrl(e.target.value)}
                  placeholder="ws://127.0.0.1:9600"
                  disabled={state === ConnectionState.Connecting || state === ConnectionState.Authenticating}
                />
              </div>

              <button
                type="submit"
                className="btn-primary"
                disabled={state === ConnectionState.Connecting || state === ConnectionState.Authenticating}
              >
                {state === ConnectionState.Connecting
                  ? 'Connecting...'
                  : state === ConnectionState.Authenticating
                  ? 'Authenticating...'
                  : 'Connect'}
              </button>
            </form>

            {error && <div className="error-banner">{error}</div>}
          </div>
        ) : (
          <div className="session-badge">
            <div className="session-header">
              <span className="session-title">Connected Session</span>
              <span className="status-indicator status-connected" />
            </div>

            <div className="form-group">
              <label>Agent Identifier</label>
              <div style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--color-text)' }}>
                {session?.computerId}
              </div>
            </div>

            <div className="form-group">
              <label>Session ID</label>
              <div style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--color-text)' }}>
                {session?.sessionId}
              </div>
            </div>

            <div className="form-group">
              <label>Negotiated Capabilities</label>
              <div className="capabilities-list">
                {session?.capabilities.map((cap) => (
                  <span key={cap} className="capability-chip">
                    {cap}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="dock">
        <div className="dock-item" title="Finder">📁</div>
        <div className="dock-item" title="Terminal">💻</div>
        <div className="dock-item" title="Activity Monitor">📊</div>
        <div className="dock-item" title="Settings">⚙️</div>
      </footer>
    </div>
  );
}
