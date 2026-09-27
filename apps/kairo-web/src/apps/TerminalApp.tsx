import { useState } from 'react';
import type { KairoSession } from '@kairo/runtime';

interface TerminalAppProps {
  session: KairoSession | null;
}

export function TerminalApp({ session }: TerminalAppProps) {
  const [history] = useState<string[]>([
    'Kairo Terminal v0.1.0',
    `Connected to agent: ${session?.computerId ?? 'none'}`,
    'Session established with capabilities: [terminal.v1, filesystem.v1]',
    'Ready for PTY streaming.',
  ]);

  return (
    <div className="terminal-app">
      <div className="terminal-output">
        {history.map((line, idx) => (
          <div key={idx} className="terminal-line">
            {line}
          </div>
        ))}
        <div className="terminal-prompt-line">
          <span className="terminal-prompt">user@kairo:~$ </span>
          <span className="terminal-cursor">█</span>
        </div>
      </div>
    </div>
  );
}
