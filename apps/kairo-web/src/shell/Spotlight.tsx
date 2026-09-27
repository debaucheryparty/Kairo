import { useEffect, useRef, useState } from 'react';
import type { LinuxApp } from '@kairo/runtime';
import type { AppId } from '../types/window';

export interface SpotlightAction {
  id: string;
  title: string;
  subtitle: string;
  category: 'Applications' | 'System' | 'Shortcuts';
  shortcut?: string;
  onSelect: () => void;
}

interface SpotlightProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenApp: (appId: AppId) => void;
  onLaunchRemoteApp?: (app: LinuxApp) => void;
  installedApps?: LinuxApp[];
  onDisconnect?: () => void;
  onCloseAllWindows?: () => void;
}

export function Spotlight({
  isOpen,
  onClose,
  onOpenApp,
  onLaunchRemoteApp,
  installedApps = [],
  onDisconnect,
  onCloseAllWindows,
}: SpotlightProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const actions: SpotlightAction[] = [
    {
      id: 'app-finder',
      title: 'Finder',
      subtitle: 'Browse, preview, and edit files on remote Linux computer',
      category: 'Applications',
      shortcut: '⌥F',
      onSelect: () => {
        onOpenApp('finder');
        onClose();
      },
    },
    {
      id: 'app-terminal',
      title: 'Terminal',
      subtitle: 'Spawn responsive interactive PTY shell',
      category: 'Applications',
      shortcut: '⌥T',
      onSelect: () => {
        onOpenApp('terminal');
        onClose();
      },
    },
    {
      id: 'app-monitor',
      title: 'Activity Monitor',
      subtitle: 'Inspect real-time CPU, RAM, disk, load averages & telemetry',
      category: 'Applications',
      shortcut: '⌥M',
      onSelect: () => {
        onOpenApp('monitor');
        onClose();
      },
    },
    {
      id: 'sys-close-all',
      title: 'Close All Windows',
      subtitle: 'Minimize distraction and clear desktop workspace',
      category: 'System',
      shortcut: '⌥W',
      onSelect: () => {
        if (onCloseAllWindows) onCloseAllWindows();
        onClose();
      },
    },
    {
      id: 'sys-disconnect',
      title: 'Disconnect Remote Computer',
      subtitle: 'Terminate current active Kairo session',
      category: 'System',
      shortcut: '⌥D',
      onSelect: () => {
        if (onDisconnect) onDisconnect();
        onClose();
      },
    },
    ...installedApps.map(
      (app): SpotlightAction => ({
        id: `remote-${app.appId}`,
        title: app.name,
        subtitle:
          app.comment || app.genericName || `Launch ${app.exec} as Remote Surface`,
        category: 'Applications',
        onSelect: () => {
          if (onLaunchRemoteApp) onLaunchRemoteApp(app);
          onClose();
        },
      })
    ),
  ];

  const filtered = actions.filter(
    (a) =>
      a.title.toLowerCase().includes(query.toLowerCase()) ||
      a.subtitle.toLowerCase().includes(query.toLowerCase()) ||
      a.category.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (filtered.length > 0 ? (prev + 1) % filtered.length : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (filtered.length > 0 ? (prev - 1 + filtered.length) % filtered.length : 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filtered[selectedIndex]) {
          filtered[selectedIndex].onSelect();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filtered, selectedIndex, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="spotlight-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(12px)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '14vh',
      }}
    >
      <div
        className="spotlight-dialog"
        style={{
          width: 580,
          maxWidth: '90vw',
          background: 'rgba(20, 22, 34, 0.95)',
          border: '1px solid rgba(99, 102, 241, 0.35)',
          borderRadius: 14,
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.8), 0 0 1px 1px rgba(255, 255, 255, 0.1)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          animation: 'spotlightPop 0.15s ease-out',
        }}
      >
        <div
          className="spotlight-header"
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '14px 18px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            gap: 12,
          }}
        >
          <span style={{ fontSize: 18, color: '#818cf8' }}>🔍</span>
          <input
            ref={inputRef}
            type="text"
            className="spotlight-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command or search apps..."
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#f8fafc',
              fontSize: 16,
              fontFamily: 'inherit',
            }}
          />
          <kbd
            style={{
              padding: '2px 6px',
              fontSize: 11,
              fontFamily: 'monospace',
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: 4,
              color: '#94a3b8',
            }}
          >
            ESC
          </kbd>
        </div>

        <div
          className="spotlight-results"
          style={{
            maxHeight: 340,
            overflowY: 'auto',
            padding: '8px',
          }}
        >
          {filtered.length === 0 ? (
            <div
              style={{
                padding: '24px 16px',
                textAlign: 'center',
                color: '#64748b',
                fontSize: 13,
              }}
            >
              No commands or applications found for "{query}"
            </div>
          ) : (
            filtered.map((action, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={action.id}
                  onClick={() => action.onSelect()}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    borderRadius: 8,
                    cursor: 'pointer',
                    background: isSelected
                      ? 'linear-gradient(90deg, rgba(99, 102, 241, 0.25) 0%, rgba(99, 102, 241, 0.1) 100%)'
                      : 'transparent',
                    borderLeft: isSelected ? '3px solid #818cf8' : '3px solid transparent',
                    transition: 'all 0.1s ease',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          color: isSelected ? '#ffffff' : '#e2e8f0',
                        }}
                      >
                        {action.title}
                      </span>
                      <span
                        style={{
                          fontSize: 10,
                          padding: '1px 5px',
                          borderRadius: 4,
                          background: 'rgba(255, 255, 255, 0.06)',
                          color: '#94a3b8',
                          textTransform: 'uppercase',
                        }}
                      >
                        {action.category}
                      </span>
                    </div>
                    <span
                      style={{
                        fontSize: 12,
                        color: isSelected ? '#cbd5e1' : '#64748b',
                      }}
                    >
                      {action.subtitle}
                    </span>
                  </div>

                  {action.shortcut && (
                    <kbd
                      style={{
                        fontSize: 11,
                        padding: '2px 6px',
                        borderRadius: 4,
                        background: 'rgba(0, 0, 0, 0.3)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        color: '#94a3b8',
                        fontFamily: 'monospace',
                      }}
                    >
                      {action.shortcut}
                    </kbd>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div
          className="spotlight-footer"
          style={{
            padding: '8px 18px',
            borderTop: '1px solid rgba(255, 255, 255, 0.06)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 11,
            color: '#64748b',
            background: 'rgba(0, 0, 0, 0.2)',
          }}
        >
          <div style={{ display: 'flex', gap: 12 }}>
            <span>
              <kbd style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 4px', borderRadius: 3 }}>↑</kbd>{' '}
              <kbd style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 4px', borderRadius: 3 }}>↓</kbd> to navigate
            </span>
            <span>
              <kbd style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 4px', borderRadius: 3 }}>↵</kbd> to select
            </span>
          </div>
          <span>Kairo Local Shell</span>
        </div>
      </div>
    </div>
  );
}
