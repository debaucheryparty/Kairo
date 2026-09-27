import {
  ConnectionState,
  createConnectionStore,
  KairoClient,
  WebSocketTransportAdapter,
  type KairoSession,
} from '@kairo/runtime';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityMonitor } from './apps/ActivityMonitor';
import { Finder } from './apps/Finder';
import { TerminalApp } from './apps/TerminalApp';
import type { AppId, WindowState } from './types/window';
import { WindowFrame } from './wm/WindowFrame';

const DEFAULT_WINDOWS: Record<
  AppId,
  { title: string; width: number; height: number }
> = {
  finder: { title: 'Finder — Remote Filesystem', width: 680, height: 440 },
  terminal: { title: 'Terminal', width: 620, height: 380 },
  monitor: { title: 'Activity Monitor', width: 520, height: 400 },
  settings: { title: 'Settings', width: 480, height: 360 },
};

export function App() {
  const [store] = useState(() => createConnectionStore());
  const [state, setState] = useState(() => store.getState().state);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<KairoSession | null>(null);
  const [agentUrl, setAgentUrl] = useState('ws://127.0.0.1:9600');

  const [windows, setWindows] = useState<WindowState[]>([]);
  const [activeWindowId, setActiveWindowId] = useState<string | null>(null);
  const [nextZIndex, setNextZIndex] = useState(10);

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

  const openApp = useCallback(
    (appId: AppId) => {
      setWindows((prev) => {
        const existing = prev.find((w) => w.appId === appId);
        if (existing) {
          if (existing.isMinimized) {
            return prev.map((w) =>
              w.id === existing.id
                ? { ...w, isMinimized: false, zIndex: nextZIndex }
                : w
            );
          }
          return prev.map((w) =>
            w.id === existing.id ? { ...w, zIndex: nextZIndex } : w
          );
        }

        const config = DEFAULT_WINDOWS[appId];
        const offset = (prev.length * 28) % 180;
        const newWindow: WindowState = {
          id: `${appId}-${Date.now()}`,
          appId,
          title: config.title,
          x: 60 + offset,
          y: 40 + offset,
          width: config.width,
          height: config.height,
          minWidth: 320,
          minHeight: 240,
          isMinimized: false,
          isMaximized: false,
          zIndex: nextZIndex,
        };

        setActiveWindowId(newWindow.id);
        return [...prev, newWindow];
      });
      setNextZIndex((z) => z + 1);
    },
    [nextZIndex]
  );

  const handleConnect = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    try {
      setError(null);
      const activeSession = await client.connect(agentUrl);
      setSession(activeSession);
      openApp('finder');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDisconnect = async () => {
    await client.disconnect();
    setSession(null);
    setWindows([]);
  };

  const focusWindow = (id: string) => {
    setActiveWindowId(id);
    setWindows((prev) =>
      prev.map((w) => (w.id === id ? { ...w, zIndex: nextZIndex } : w))
    );
    setNextZIndex((z) => z + 1);
  };

  const closeWindow = (id: string) => {
    setWindows((prev) => prev.filter((w) => w.id !== id));
    if (activeWindowId === id) {
      setActiveWindowId(null);
    }
  };

  const minimizeWindow = (id: string) => {
    setWindows((prev) =>
      prev.map((w) => (w.id === id ? { ...w, isMinimized: true } : w))
    );
  };

  const maximizeWindow = (id: string) => {
    setWindows((prev) =>
      prev.map((w) => (w.id === id ? { ...w, isMaximized: !w.isMaximized } : w))
    );
  };

  const moveWindow = (id: string, x: number, y: number) => {
    setWindows((prev) => prev.map((w) => (w.id === id ? { ...w, x, y } : w)));
  };

  const resizeWindow = (id: string, width: number, height: number) => {
    setWindows((prev) =>
      prev.map((w) => (w.id === id ? { ...w, width, height } : w))
    );
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
          {session && (
            <span className="topbar-host-badge">
              Host: {session.computerId.slice(0, 8)}...
            </span>
          )}
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
                  disabled={
                    state === ConnectionState.Connecting ||
                    state === ConnectionState.Authenticating
                  }
                />
              </div>

              <button
                type="submit"
                className="btn-primary"
                disabled={
                  state === ConnectionState.Connecting ||
                  state === ConnectionState.Authenticating
                }
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
          windows.map((win) => (
            <WindowFrame
              key={win.id}
              window={win}
              isActive={activeWindowId === win.id}
              onFocus={() => focusWindow(win.id)}
              onClose={() => closeWindow(win.id)}
              onMinimize={() => minimizeWindow(win.id)}
              onMaximize={() => maximizeWindow(win.id)}
              onMove={(x, y) => moveWindow(win.id, x, y)}
              onResize={(w, h) => resizeWindow(win.id, w, h)}
            >
              {win.appId === 'finder' && <Finder client={client} />}
              {win.appId === 'terminal' && <TerminalApp client={client} session={session} />}
              {win.appId === 'monitor' && <ActivityMonitor session={session} />}
            </WindowFrame>
          ))
        )}
      </main>

      <footer className="dock">
        <button
          type="button"
          className="dock-item"
          title="Finder"
          onClick={() => openApp('finder')}
          disabled={state !== ConnectionState.Connected}
        >
          📁
        </button>
        <button
          type="button"
          className="dock-item"
          title="Terminal"
          onClick={() => openApp('terminal')}
          disabled={state !== ConnectionState.Connected}
        >
          💻
        </button>
        <button
          type="button"
          className="dock-item"
          title="Activity Monitor"
          onClick={() => openApp('monitor')}
          disabled={state !== ConnectionState.Connected}
        >
          📊
        </button>
      </footer>
    </div>
  );
}
