import {
  ConnectionState,
  ComputerManager,
  type ComputerProfile,
} from '@kairo/runtime';
import { useCallback, useEffect, useState } from 'react';
import { ActivityMonitor } from './apps/ActivityMonitor';
import { Finder } from './apps/Finder';
import { TerminalApp } from './apps/TerminalApp';
import { Spotlight } from './shell/Spotlight';
import type { AppId, WindowState } from './types/window';
import { WindowFrame } from './wm/WindowFrame';

const STORAGE_KEY_PROFILES = 'kairo_computer_profiles';
const STORAGE_KEY_ACTIVE = 'kairo_active_computer_id';

const COLOR_PRESETS = [
  '#6366f1',
  '#10b981',
  '#f59e0b',
  '#ec4899',
  '#06b6d4',
  '#8b5cf6',
  '#ef4444',
];

const DEFAULT_WINDOWS: Record<
  AppId,
  { title: string; width: number; height: number }
> = {
  finder: { title: 'Finder — Remote Filesystem', width: 680, height: 440 },
  terminal: { title: 'Terminal', width: 620, height: 380 },
  monitor: { title: 'Activity Monitor', width: 520, height: 400 },
  settings: { title: 'Settings', width: 480, height: 360 },
};

function loadInitialProfiles(): ComputerProfile[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PROFILES);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return [
    {
      id: 'primary',
      name: 'Primary Dev VPS',
      url: 'ws://127.0.0.1:9600',
      color: '#6366f1',
    },
  ];
}

function loadInitialActiveId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY_ACTIVE);
  } catch {
    return null;
  }
}

export function App() {
  const [manager] = useState(() => {
    const profiles = loadInitialProfiles();
    const mgr = new ComputerManager(profiles);
    const savedActive = loadInitialActiveId();
    if (savedActive && mgr.getInstance(savedActive)) {
      mgr.setActiveId(savedActive);
    }
    return mgr;
  });

  const [, setVersion] = useState(0);

  useEffect(() => {
    const unsubscribe = manager.subscribe(() => {
      try {
        localStorage.setItem(
          STORAGE_KEY_PROFILES,
          JSON.stringify(manager.getProfiles())
        );
        localStorage.setItem(STORAGE_KEY_ACTIVE, manager.getActiveId());
      } catch {}
      setVersion((v) => v + 1);
    });
    return () => unsubscribe();
  }, [manager]);

  const activeInstance = manager.getActiveInstance();
  const activeProfile = activeInstance.profile;
  const activeState = activeInstance.store.getState().state;
  const activeError = activeInstance.store.getState().error;
  const activeSession = activeInstance.session;
  const profiles = manager.getProfiles();

  const [windows, setWindows] = useState<WindowState[]>([]);
  const [activeWindowId, setActiveWindowId] = useState<string | null>(null);
  const [nextZIndex, setNextZIndex] = useState(10);
  const [isSpotlightOpen, setIsSpotlightOpen] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newComputerName, setNewComputerName] = useState('');
  const [newComputerUrl, setNewComputerUrl] = useState('ws://127.0.0.1:9600');
  const [newComputerColor, setNewComputerColor] = useState('#6366f1');

  useEffect(() => {
    const handleGlobalKeys = (e: KeyboardEvent) => {
      if (
        (e.metaKey || e.ctrlKey) &&
        (e.key === 'k' || e.key === ' ' || e.code === 'Space')
      ) {
        e.preventDefault();
        setIsSpotlightOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleGlobalKeys);
    return () => window.removeEventListener('keydown', handleGlobalKeys);
  }, []);

  const openApp = useCallback(
    (appId: AppId) => {
      setWindows((prev) => {
        const existing = prev.find(
          (w) => w.appId === appId && w.computerId === activeProfile.id
        );
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
          id: `${appId}-${activeProfile.id}-${Date.now()}`,
          appId,
          title: config.title,
          computerId: activeProfile.id,
          computerName: activeProfile.name,
          computerColor: activeProfile.color,
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
    [activeProfile, nextZIndex]
  );

  const handleConnect = async (profileId = activeProfile.id) => {
    try {
      await manager.connect(profileId);
      if (profileId === activeProfile.id) {
        openApp('finder');
      }
    } catch {}
  };

  const handleDisconnect = async (profileId = activeProfile.id) => {
    await manager.disconnect(profileId);
  };

  const handleCreateComputer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComputerName.trim() || !newComputerUrl.trim()) return;
    const id = `host-${Date.now().toString(36)}`;
    manager.addComputer({
      id,
      name: newComputerName.trim(),
      url: newComputerUrl.trim(),
      color: newComputerColor,
    });
    manager.setActiveId(id);
    setIsAddModalOpen(false);
    setNewComputerName('');
    setNewComputerUrl('ws://127.0.0.1:9600');
  };

  const handleRemoveComputer = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    manager.removeComputer(id);
    setWindows((prev) => prev.filter((w) => w.computerId !== id));
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
      prev.map((w) =>
        w.id === id ? { ...w, isMaximized: !w.isMaximized } : w
      )
    );
  };

  const moveWindow = (id: string, x: number, y: number) => {
    setWindows((prev) =>
      prev.map((w) => (w.id === id ? { ...w, x, y } : w))
    );
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

          <div className="computer-switcher-container">
            <button
              type="button"
              className="computer-switcher-btn"
              onClick={() => setIsDropdownOpen((prev) => !prev)}
            >
              <span
                className="computer-color-dot"
                style={{ backgroundColor: activeProfile.color }}
              />
              <span>{activeProfile.name}</span>
              <span className={`status-indicator status-${activeState}`} />
              <span style={{ fontSize: 9, opacity: 0.7 }}>▼</span>
            </button>

            {isDropdownOpen && (
              <div className="computer-dropdown">
                <div className="computer-dropdown-header">Computers</div>
                {profiles.map((p) => {
                  const inst = manager.getInstance(p.id);
                  const pState = inst
                    ? inst.store.getState().state
                    : ConnectionState.Disconnected;
                  const isCurrent = p.id === activeProfile.id;
                  return (
                    <div
                      key={p.id}
                      className={`computer-dropdown-item ${
                        isCurrent ? 'active' : ''
                      }`}
                      onClick={() => {
                        manager.setActiveId(p.id);
                        setIsDropdownOpen(false);
                      }}
                    >
                      <div className="computer-item-meta">
                        <div className="computer-item-name">
                          <span
                            className="computer-color-dot"
                            style={{ backgroundColor: p.color }}
                          />
                          <span>{p.name}</span>
                          <span
                            className={`status-indicator status-${pState}`}
                          />
                        </div>
                        <div className="computer-item-url">{p.url}</div>
                      </div>

                      <div className="computer-item-actions">
                        {pState === ConnectionState.Connected ? (
                          <button
                            type="button"
                            className="btn-secondary"
                            style={{ fontSize: 10, padding: '2px 6px' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDisconnect(p.id);
                            }}
                          >
                            Disconnect
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn-secondary"
                            style={{ fontSize: 10, padding: '2px 6px' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleConnect(p.id);
                            }}
                          >
                            Connect
                          </button>
                        )}
                        {profiles.length > 1 && (
                          <button
                            type="button"
                            className="traffic-light close"
                            style={{ width: 8, height: 8 }}
                            title="Remove profile"
                            onClick={(e) => handleRemoveComputer(e, p.id)}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}

                <div className="computer-dropdown-footer">
                  <button
                    type="button"
                    className="computer-add-btn"
                    onClick={() => {
                      setIsDropdownOpen(false);
                      setIsAddModalOpen(true);
                    }}
                  >
                    + Add New Computer
                  </button>
                </div>
              </div>
            )}
          </div>

          {activeSession && (
            <span className="topbar-host-badge">
              Host: {activeSession.computerId.slice(0, 8)}...
            </span>
          )}
        </div>

        <div className="topbar-right">
          <button
            type="button"
            className="topbar-search-btn"
            onClick={() => setIsSpotlightOpen(true)}
            title="Command Palette (Cmd/Ctrl+K or Space)"
          >
            <span>Search & Launch</span>
            <kbd>⌘K</kbd>
          </button>
          {activeState === ConnectionState.Connected ? (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => handleDisconnect()}
            >
              Disconnect
            </button>
          ) : (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => handleConnect()}
            >
              Connect
            </button>
          )}
        </div>
      </header>

      <main className="desktop">
        {activeState !== ConnectionState.Connected && windows.length === 0 ? (
          <div className="connection-card">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 8,
              }}
            >
              <span
                className="computer-color-dot"
                style={{
                  backgroundColor: activeProfile.color,
                  width: 12,
                  height: 12,
                }}
              />
              <h2>{activeProfile.name}</h2>
            </div>
            <p>
              Connect to your remote Linux agent at{' '}
              <code>{activeProfile.url}</code> to start a secure, isolated
              session.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleConnect();
              }}
            >
              <button
                type="submit"
                className="btn-primary"
                disabled={
                  activeState === ConnectionState.Connecting ||
                  activeState === ConnectionState.Authenticating
                }
              >
                {activeState === ConnectionState.Connecting
                  ? 'Connecting...'
                  : activeState === ConnectionState.Authenticating
                  ? 'Authenticating...'
                  : `Connect to ${activeProfile.name}`}
              </button>
            </form>

            {activeError && <div className="error-banner">{activeError}</div>}
          </div>
        ) : (
          windows.map((win) => {
            const inst =
              manager.getInstance(win.computerId) || activeInstance;
            return (
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
                {win.appId === 'finder' && <Finder client={inst.client} />}
                {win.appId === 'terminal' && (
                  <TerminalApp client={inst.client} session={inst.session} />
                )}
                {win.appId === 'monitor' && (
                  <ActivityMonitor
                    client={inst.client}
                    session={inst.session}
                  />
                )}
              </WindowFrame>
            );
          })
        )}
      </main>

      <footer className="dock">
        <button
          type="button"
          className="dock-item"
          title={`Finder (${activeProfile.name})`}
          onClick={() => openApp('finder')}
          disabled={activeState !== ConnectionState.Connected}
        >
          📁
        </button>
        <button
          type="button"
          className="dock-item"
          title={`Terminal (${activeProfile.name})`}
          onClick={() => openApp('terminal')}
          disabled={activeState !== ConnectionState.Connected}
        >
          💻
        </button>
        <button
          type="button"
          className="dock-item"
          title={`Activity Monitor (${activeProfile.name})`}
          onClick={() => openApp('monitor')}
          disabled={activeState !== ConnectionState.Connected}
        >
          📊
        </button>
      </footer>

      {isAddModalOpen && (
        <div
          className="modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsAddModalOpen(false);
          }}
        >
          <div className="connection-card" style={{ position: 'relative', top: 'auto', left: 'auto', transform: 'none' }}>
            <h2>Add Remote Computer</h2>
            <p>Configure a new Linux host or VPS profile to switch seamlessly.</p>

            <form onSubmit={handleCreateComputer}>
              <div className="form-group">
                <label htmlFor="computer-name">Computer / Host Name</label>
                <input
                  id="computer-name"
                  className="form-input"
                  type="text"
                  placeholder="e.g. Production VPS"
                  value={newComputerName}
                  onChange={(e) => setNewComputerName(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="computer-url">Agent WebSocket URL</label>
                <input
                  id="computer-url"
                  className="form-input"
                  type="text"
                  placeholder="ws://192.168.1.100:9600"
                  value={newComputerUrl}
                  onChange={(e) => setNewComputerUrl(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label>Profile Color</label>
                <div className="color-presets">
                  {COLOR_PRESETS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`color-preset-dot ${
                        newComputerColor === c ? 'selected' : ''
                      }`}
                      style={{ backgroundColor: c }}
                      onClick={() => setNewComputerColor(c)}
                    />
                  ))}
                </div>
              </div>

              <div className="modal-actions">
                <button type="submit" className="btn-primary">
                  Save Computer
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setIsAddModalOpen(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <Spotlight
        isOpen={isSpotlightOpen}
        onClose={() => setIsSpotlightOpen(false)}
        onOpenApp={openApp}
        onDisconnect={() => handleDisconnect()}
        onCloseAllWindows={() => setWindows([])}
      />
    </div>
  );
}
