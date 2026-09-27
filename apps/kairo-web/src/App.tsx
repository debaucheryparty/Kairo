import { ConnectionState } from '@kairo/runtime';
import { useState } from 'react';

export function App() {
  const [connectionState] = useState(ConnectionState.Disconnected);

  return (
    <div className="shell">
      <header className="topbar">
        <span className="topbar-title">Kairo</span>
        <span className={`status-indicator status-${connectionState}`} />
      </header>
      <main className="desktop" />
      <footer className="dock" />
    </div>
  );
}
