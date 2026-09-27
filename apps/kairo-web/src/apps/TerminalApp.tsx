import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import type { KairoClient, KairoSession } from '@kairo/runtime';

interface TerminalAppProps {
  client: KairoClient;
  session: KairoSession | null;
}

export function TerminalApp({ client }: TerminalAppProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [, setPtyId] = useState<string | null>(null);
  const [status, setStatus] = useState<'initializing' | 'connected' | 'error'>('initializing');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
      fontSize: 13,
      lineHeight: 1.25,
      theme: {
        background: '#0d1117',
        foreground: '#c9d1d9',
        cursor: '#58a6ff',
        selectionBackground: 'rgba(88, 166, 255, 0.3)',
        black: '#484f58',
        red: '#ff7b72',
        green: '#3fb950',
        yellow: '#d29922',
        blue: '#58a6ff',
        magenta: '#bc8cff',
        cyan: '#39c5cf',
        white: '#b1bac4',
        brightBlack: '#6e7681',
        brightRed: '#ffa198',
        brightGreen: '#56d364',
        brightYellow: '#e3b341',
        brightBlue: '#79c0ff',
        brightMagenta: '#d2a8ff',
        brightCyan: '#56d4dd',
        brightWhite: '#f0f6fc',
      },
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);
    fitAddon.fit();

    let activePtyId: string | null = null;
    let isDisposed = false;

    // Output listener from KairoClient
    const unsubscribeOutput = client.onTerminalOutput(({ ptyId: incomingPtyId, data }) => {
      if (activePtyId && incomingPtyId === activePtyId) {
        term.write(data);
      }
    });

    // Input listener to forward keystrokes to PTY
    const dataDisposable = term.onData((data) => {
      if (activePtyId) {
        client.writePty(activePtyId, data).catch((err) => {
          console.error('Failed to send terminal input:', err);
        });
      }
    });

    // Spawn PTY on Agent
    client
      .createPty('', term.cols, term.rows)
      .then((id) => {
        if (isDisposed) {
          client.closePty(id).catch(() => {});
          return;
        }
        activePtyId = id;
        setPtyId(id);
        setStatus('connected');
        term.focus();
      })
      .catch((err) => {
        if (!isDisposed) {
          setStatus('error');
          setErrorMessage(err instanceof Error ? err.message : String(err));
          term.writeln(`\r\n\x1b[31m[Kairo Terminal Error] Failed to create PTY: ${err}\x1b[0m\r\n`);
        }
      });

    // Resize observer
    const resizeObserver = new ResizeObserver(() => {
      if (isDisposed) return;
      try {
        fitAddon.fit();
        if (activePtyId) {
          client.resizePty(activePtyId, term.cols, term.rows).catch(() => {});
        }
      } catch {
        // Ignore resize calculation during quick animation
      }
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      isDisposed = true;
      resizeObserver.disconnect();
      dataDisposable.dispose();
      unsubscribeOutput();
      if (activePtyId) {
        client.closePty(activePtyId).catch(() => {});
      }
      term.dispose();
    };
  }, [client]);

  return (
    <div
      className="terminal-container"
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        background: '#0d1117',
        padding: '6px',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      {status === 'initializing' && (
        <div
          style={{
            position: 'absolute',
            top: 10,
            right: 12,
            padding: '4px 8px',
            borderRadius: 4,
            background: 'rgba(56, 189, 248, 0.1)',
            border: '1px solid rgba(56, 189, 248, 0.3)',
            color: '#38bdf8',
            fontSize: 11,
            zIndex: 10,
          }}
        >
          Spawning remote shell...
        </div>
      )}
      {status === 'error' && errorMessage && (
        <div
          style={{
            position: 'absolute',
            top: 10,
            right: 12,
            padding: '4px 8px',
            borderRadius: 4,
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            color: '#ef4444',
            fontSize: 11,
            zIndex: 10,
          }}
        >
          {errorMessage}
        </div>
      )}
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: '100%',
        }}
      />
    </div>
  );
}
