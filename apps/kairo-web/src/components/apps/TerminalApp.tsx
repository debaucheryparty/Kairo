"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import "@xterm/xterm/css/xterm.css";
import type { WindowPayload } from "@/src/components/window/window-context";
import { wsUrl } from "@/src/lib/api/origin";
import { getInjectedDesktopConfig, localAuthWSProtocols } from "@/src/lib/runtime/config";
import { useSession } from "@/src/lib/session";
import { useTheme } from "@/src/lib/theme";
import { Plus, X, Terminal as TerminalIcon, RefreshCw, Trash2, ShieldCheck, CheckCircle, AlertCircle } from "lucide-react";

function quotePath(value: string) {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

// Material 3 / Foot terminal palette from dots-hyprland
const HYPR_TERMINAL_THEME = {
  background: "#141318",
  foreground: "#e5e1e6",
  cursor: "#cfbcff",
  cursorAccent: "#141318",
  selectionBackground: "#48445980",
  selectionForeground: "#ffffff",
  black: "#141318",
  red: "#ffb4ab",
  green: "#b4c5ff",
  yellow: "#e4c163",
  blue: "#cfbcff",
  magenta: "#eab5d3",
  cyan: "#9cd1c8",
  white: "#e5e1e6",
  brightBlack: "#484459",
  brightRed: "#ff897d",
  brightGreen: "#79aaff",
  brightYellow: "#ffdc7e",
  brightBlue: "#d0bcff",
  brightMagenta: "#fba7cb",
  brightCyan: "#80d5c9",
  brightWhite: "#f5eff7",
};

interface TerminalTab {
  id: string;
  title: string;
  status: "connecting" | "connected" | "disconnected";
  error: string | null;
}

export function TerminalApp({ payload }: { payload?: WindowPayload }) {
  const { runtimeClient, runtimeConnected, selectedServer: selected } = useSession();
  const { theme: currentTheme, sourceColor, scheme } = useTheme();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const style = getComputedStyle(document.documentElement);
    const surface = style.getPropertyValue("--md-sys-color-surface").trim() || "#141318";
    const primary = style.getPropertyValue("--md-sys-color-primary").trim() || "#cfbcff";
    const onSurface = style.getPropertyValue("--md-sys-color-on-surface").trim() || "#e5e1e6";
    const updatedTheme = {
      ...HYPR_TERMINAL_THEME,
      background: surface,
      foreground: onSurface,
      cursor: primary,
      cursorAccent: surface,
      black: surface,
      white: onSurface,
    };
    terminalsRef.current.forEach((term) => {
      term.options.theme = updatedTheme;
    });
  }, [currentTheme, sourceColor, scheme]);
  const serverId = selected?.id || "";
  const serverName = selected?.name || "vps";
  const cwd = payload?.cwd;

  const [tabs, setTabs] = useState<TerminalTab[]>([
    {
      id: "term-1",
      title: "1: bash",
      status: "connecting",
      error: null,
    },
  ]);
  const [activeTabId, setActiveTabId] = useState("term-1");
  const [nonce, setNonce] = useState(0);

  // Tab container refs
  const hostsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const terminalsRef = useRef<Map<string, import("@xterm/xterm").Terminal>>(new Map());
  const fitAddonsRef = useRef<Map<string, import("@xterm/addon-fit").FitAddon>>(new Map());
  const socketsRef = useRef<Map<string, WebSocket>>(new Map());
  const ptysRef = useRef<Map<string, string>>(new Map());

  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];

  const handleNewTab = () => {
    const newIdx = tabs.length + 1;
    const newId = `term-${Date.now()}`;
    const newTab: TerminalTab = {
      id: newId,
      title: `${newIdx}: bash`,
      status: "connecting",
      error: null,
    };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newId);
  };

  const handleCloseTab = (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    if (tabs.length === 1) return; // Keep at least one tab

    // Cleanup resources for this tab
    const ptyId = ptysRef.current.get(tabId);
    if (ptyId && runtimeClient?.getSession()) {
      void runtimeClient.closePty(ptyId).catch(() => undefined);
      ptysRef.current.delete(tabId);
    }
    const sock = socketsRef.current.get(tabId);
    if (sock) {
      sock.close();
      socketsRef.current.delete(tabId);
    }
    const term = terminalsRef.current.get(tabId);
    if (term) {
      term.dispose();
      terminalsRef.current.delete(tabId);
    }
    fitAddonsRef.current.delete(tabId);
    hostsRef.current.delete(tabId);

    const idx = tabs.findIndex((t) => t.id === tabId);
    const nextTabs = tabs.filter((t) => t.id !== tabId);
    setTabs(nextTabs);
    if (activeTabId === tabId) {
      const nextActive = nextTabs[Math.max(0, idx - 1)];
      setActiveTabId(nextActive.id);
    }
  };

  const handleClear = () => {
    const term = terminalsRef.current.get(activeTabId);
    if (term) {
      term.clear();
      term.focus();
    }
  };

  const handleReconnect = () => {
    setTabs((prev) =>
      prev.map((t) => (t.id === activeTabId ? { ...t, status: "connecting", error: null } : t)),
    );
    setNonce((n) => n + 1);
  };

  // Mount terminal for a tab
  const setupTabTerminal = useCallback(
    async (tab: TerminalTab) => {
      const host = hostsRef.current.get(tab.id);
      if (!host) return;

      // If already initialized, just refit
      if (terminalsRef.current.has(tab.id)) {
        fitAddonsRef.current.get(tab.id)?.fit();
        return;
      }

      try {
        const [{ Terminal }, { FitAddon }] = await Promise.all([
          import("@xterm/xterm"),
          import("@xterm/addon-fit"),
        ]);

        const terminal = new Terminal({
          cursorBlink: true,
          cursorStyle: "bar",
          fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          fontSize: 13,
          letterSpacing: 0.5,
          lineHeight: 1.25,
          theme: (() => {
            const style = typeof window !== "undefined" ? getComputedStyle(document.documentElement) : null;
            const surface = style?.getPropertyValue("--md-sys-color-surface").trim() || "#141318";
            const primary = style?.getPropertyValue("--md-sys-color-primary").trim() || "#cfbcff";
            const onSurface = style?.getPropertyValue("--md-sys-color-on-surface").trim() || "#e5e1e6";
            return {
              ...HYPR_TERMINAL_THEME,
              background: surface,
              foreground: onSurface,
              cursor: primary,
              cursorAccent: surface,
              black: surface,
              white: onSurface,
            };
          })(),
        });

        const fitAddon = new FitAddon();
        terminal.loadAddon(fitAddon);
        terminal.open(host);
        fitAddon.fit();
        terminal.focus();

        terminalsRef.current.set(tab.id, terminal);
        fitAddonsRef.current.set(tab.id, fitAddon);

        // Connect via Kairo Runtime Client or fallback WebSocket
        if (runtimeConnected && runtimeClient?.getSession()) {
          try {
            const ptyId = await runtimeClient.createPty("", terminal.cols, terminal.rows, cwd || "");
            ptysRef.current.set(tab.id, ptyId);

            setTabs((prev) =>
              prev.map((t) => (t.id === tab.id ? { ...t, status: "connected", error: null } : t)),
            );

            const unsubscribe = runtimeClient.onTerminalOutput(({ ptyId: id, data }) => {
              if (id === ptyId && terminal) {
                terminal.write(data);
              }
            });

            terminal.onData((data) => {
              void runtimeClient.writePty(ptyId, data).catch((err) => {
                console.error("[TerminalApp] writePty error:", err);
              });
            });

            const ro = new ResizeObserver(() => {
              if (!terminal || !fitAddon) return;
              fitAddon.fit();
              void runtimeClient.resizePty(ptyId, terminal.cols, terminal.rows).catch(() => undefined);
            });
            ro.observe(host);
            return;
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : "Failed to spawn PTY";
            setTabs((prev) =>
              prev.map((t) => (t.id === tab.id ? { ...t, status: "disconnected", error: errMsg } : t)),
            );
            terminal.writeln(`\r\n\x1b[1;31m[Kairo] Failed to create terminal session: ${errMsg}\x1b[0m`);
            return;
          }
        }

        // Fallback local auth WebSocket
        const localToken = getInjectedDesktopConfig()?.localAuthToken;
        if (serverId && localToken) {
          const socket = new WebSocket(
            wsUrl(`/ws/terminal?serverId=${encodeURIComponent(serverId)}`),
            localAuthWSProtocols(localToken),
          );
          socket.binaryType = "arraybuffer";
          socketsRef.current.set(tab.id, socket);

          socket.onopen = () => {
            setTabs((prev) =>
              prev.map((t) => (t.id === tab.id ? { ...t, status: "connected", error: null } : t)),
            );
            fitAddon.fit();
            socket.send(
              JSON.stringify({
                type: "resize",
                cols: terminal.cols,
                rows: terminal.rows,
              }),
            );
          };

          socket.onmessage = (event) => {
            if (typeof event.data === "string") {
              terminal.write(event.data);
            } else {
              terminal.write(new Uint8Array(event.data as ArrayBuffer));
            }
          };

          socket.onerror = () => {
            setTabs((prev) =>
              prev.map((t) =>
                t.id === tab.id ? { ...t, status: "disconnected", error: "Socket error" } : t,
              ),
            );
          };

          terminal.onData((data) => {
            if (socket.readyState === WebSocket.OPEN) {
              socket.send(new TextEncoder().encode(data));
            }
          });
        } else {
          setTabs((prev) =>
            prev.map((t) =>
              t.id === tab.id ? { ...t, status: "disconnected", error: "Offline / Disconnected" } : t,
            ),
          );
          terminal.writeln("\r\n\x1b[1;33m[Kairo] Terminal idle. Connect to a host agent or VPS to spawn a shell.\x1b[0m\r\n");
        }
      } catch (e) {
        console.error("Terminal initialization failed", e);
      }
    },
    [runtimeClient, runtimeConnected, serverId, cwd],
  );

  useEffect(() => {
    void setupTabTerminal(activeTab);
  }, [activeTab, setupTabTerminal, nonce]);

  // Focus terminal when active tab changes
  useEffect(() => {
    const term = terminalsRef.current.get(activeTabId);
    if (term) {
      setTimeout(() => {
        term.focus();
        fitAddonsRef.current.get(activeTabId)?.fit();
      }, 50);
    }
  }, [activeTabId]);

  return (
    <div className="flex h-full w-full flex-col bg-[var(--md-sys-color-surface)] text-[var(--md-sys-color-on-surface)] select-none font-sans overflow-hidden">
      {/* Material 3 Top Tab Bar */}
      <div className="flex items-center gap-1.5 px-3 pt-2 bg-[var(--md-sys-color-surface-container-low)] border-b border-[var(--md-sys-color-outline-variant)]/25 overflow-x-auto no-scrollbar">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              onClick={() => setActiveTabId(tab.id)}
              className={`group relative flex items-center gap-2 h-9 px-3.5 rounded-t-xl text-[12px] font-medium transition-all duration-150 cursor-pointer max-w-[170px] min-w-[110px] ${
                isActive
                  ? "bg-[var(--md-sys-color-surface)] text-[var(--md-sys-color-primary)] font-semibold border-t-2 border-[var(--md-sys-color-primary)] shadow-sm"
                  : "bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)] hover:text-[var(--md-sys-color-on-surface)]"
              }`}
            >
              <span
                className={`size-2 rounded-full shrink-0 ${
                  tab.status === "connected"
                    ? "bg-[var(--md-sys-color-primary)] shadow-[0_0_8px_var(--md-sys-color-primary)]"
                    : tab.status === "connecting"
                      ? "bg-amber-400 animate-pulse"
                      : "bg-red-400"
                }`}
              />
              <span className="truncate flex-1">{tab.title}</span>
              {tabs.length > 1 && (
                <button
                  type="button"
                  onClick={(e) => handleCloseTab(e, tab.id)}
                  className="size-4.5 rounded-full flex items-center justify-center text-white/40 hover:bg-white/10 hover:text-white transition-colors"
                  title="Close Tab"
                >
                  <X className="size-3" />
                </button>
              )}
            </div>
          );
        })}

        <button
          type="button"
          onClick={handleNewTab}
          className="group relative overflow-hidden size-7 rounded-lg flex items-center justify-center text-white/60 hover:text-white transition-colors ml-1 m3-focus-ring"
          title="New Terminal Tab (Ctrl+Shift+T)"
        >
          <div className="m3-state-layer" />
          <Plus className="size-4 relative z-[1]" />
        </button>

        {/* Status Chip & Quick Actions on Right */}
        <div className="ml-auto flex items-center gap-2 pb-1.5 pr-1">
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.08] text-[11px] text-white/60">
            <TerminalIcon className="size-3 text-[var(--m3-primary)]" />
            <span>{serverName}</span>
          </div>

          <button
            type="button"
            onClick={handleClear}
            className="size-7 rounded-lg flex items-center justify-center text-white/60 hover:bg-white/10 hover:text-white transition-colors"
            title="Clear Terminal Buffer"
          >
            <Trash2 className="size-3.5" />
          </button>

          {activeTab.status !== "connected" && (
            <button
              type="button"
              onClick={handleReconnect}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-[var(--m3-primary)]/20 hover:bg-[var(--m3-primary)]/30 text-[var(--m3-primary)] text-[11px] font-medium transition-colors"
              title="Reconnect"
            >
              <RefreshCw className="size-3" />
              <span>Reconnect</span>
            </button>
          )}
        </div>
      </div>

      {/* Terminal Viewport */}
      <div className="relative flex-1 w-full bg-[#141318] p-2 overflow-hidden">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            ref={(el) => {
              if (el) hostsRef.current.set(tab.id, el);
              else hostsRef.current.delete(tab.id);
            }}
            tabIndex={0}
            className={`h-full w-full outline-none cursor-text ${
              tab.id === activeTabId ? "block" : "hidden"
            }`}
            onClick={() => terminalsRef.current.get(tab.id)?.focus()}
          />
        ))}
      </div>
    </div>
  );
}
