"use client";

import { useEffect, useRef, useState } from "react";
import "@xterm/xterm/css/xterm.css";
import type { WindowPayload } from "@/src/components/window/window-context";
import { wsUrl } from "@/src/lib/api/origin";
import { getInjectedDesktopConfig, localAuthWSProtocols } from "@/src/lib/runtime/config";
import { useSession } from "@/src/lib/session";

function quotePath(value: string) {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

export function TerminalApp({ payload }: { payload?: WindowPayload }) {
  const host = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<import("@xterm/xterm").Terminal | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const { runtimeClient, runtimeConnected, selectedServer: selected } = useSession();
  const serverId = selected?.id || "";
  const serverName = selected?.name || "server";
  const [status, setStatus] = useState<"connecting" | "connected" | "disconnected">("connecting");
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const cwd = payload?.cwd;

  useEffect(() => {
    const container = host.current;
    if (!container) return;

    let disposed = false;
    let cleanupPty: (() => void) | undefined;
    let socket: WebSocket | null = null;
    let terminal: import("@xterm/xterm").Terminal | null = null;
    let fitAddon: import("@xterm/addon-fit").FitAddon | null = null;
    let observer: ResizeObserver | null = null;

    async function connect() {
      try {
        const [{ Terminal }, { FitAddon }] = await Promise.all([
          import("@xterm/xterm"),
          import("@xterm/addon-fit"),
        ]);
        if (disposed || !host.current) return;

        terminal = new Terminal({
          cursorBlink: true,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          fontSize: 13,
          theme: {
            background: "#111111",
            foreground: "#d7ffd9",
            cursor: "#5fff6a",
          },
        });
        terminalRef.current = terminal;
        fitAddon = new FitAddon();
        terminal.loadAddon(fitAddon);
        terminal.open(host.current);
        fitAddon.fit();
        terminal.focus();

        if (runtimeConnected && runtimeClient?.getSession()) {
          try {
            const ptyId = await runtimeClient.createPty("", terminal.cols, terminal.rows, cwd || "");
            if (disposed) {
              void runtimeClient.closePty(ptyId).catch(() => undefined);
              return;
            }
            setStatus("connected");
            setError(null);
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

            terminal.focus();
            setTimeout(() => {
              terminal?.focus();
            }, 50);

            observer = new ResizeObserver(() => {
              if (!terminal || !fitAddon) return;
              fitAddon.fit();
              void runtimeClient.resizePty(ptyId, terminal.cols, terminal.rows).catch(() => undefined);
            });
            observer.observe(host.current);

            cleanupPty = () => {
              unsubscribe();
              void runtimeClient.closePty(ptyId).catch(() => undefined);
            };
            return;
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : "Failed to spawn PTY";
            setStatus("disconnected");
            setError(errMsg);
            terminal.writeln(`\r\n\x1b[1;31m[Kairo] Failed to create terminal session: ${errMsg}\x1b[0m`);
            return;
          }
        }

        if (!runtimeConnected) {
          if (selected?.status === "authentication_failed") {
            setError("Authentication failed: invalid pairing token.");
            setStatus("disconnected");
            terminal.writeln("\x1b[1;31m[Kairo] Authentication failed: invalid or missing pairing token.\x1b[0m");
            terminal.writeln("\x1b[33mEdit this server and enter the correct pairing token, then reconnect.\x1b[0m\r\n");
            return;
          }
          if (selected?.status === "error") {
            setError("Connection failed. Host agent unreachable.");
            setStatus("disconnected");
            terminal.writeln("\x1b[1;31m[Kairo] Unable to connect to host agent at port 9600.\x1b[0m");
            terminal.writeln("\x1b[33mEnsure kairo-agent is running on the host.\x1b[0m\r\n");
            return;
          }
          setStatus("connecting");
          terminal.writeln("\x1b[36m[Kairo] Connecting to host agent…\x1b[0m");
          return;
        }

        if (!serverId) {
          setError("No server selected");
          setStatus("disconnected");
          terminal.writeln("\x1b[1;31m[Kairo] No server selected.\x1b[0m\r\n");
          return;
        }

        const localToken = getInjectedDesktopConfig()?.localAuthToken;
        if (!localToken) {
          setError("Host agent is not connected.");
          setStatus("disconnected");
          terminal.writeln("\x1b[1;31m[Kairo] Host agent is disconnected or authentication failed.\x1b[0m");
          terminal.writeln("\x1b[33mVerify your server connection and pairing token, then reconnect.\x1b[0m\r\n");
          return;
        }

        socket = new WebSocket(
          wsUrl(`/ws/terminal?serverId=${encodeURIComponent(serverId)}`),
          localAuthWSProtocols(localToken),
        );
        socket.binaryType = "arraybuffer";
        socketRef.current = socket;

        const timeout = window.setTimeout(() => {
          if (disposed || socket?.readyState === WebSocket.OPEN) return;
          setError(
            "Kairo could not open a terminal session. Check the server connection and retry.",
          );
          setStatus("disconnected");
          socket?.close();
        }, 12000);

        socket.onopen = () => {
          window.clearTimeout(timeout);
          if (!terminal || !fitAddon) return;
          setStatus("connected");
          setError(null);
          fitAddon.fit();
          socket?.send(
            JSON.stringify({
              type: "resize",
              cols: terminal.cols,
              rows: terminal.rows,
            }),
          );
        };

        socket.onmessage = (event) => {
          if (!terminal) return;
          if (typeof event.data === "string") {
            try {
              const message = JSON.parse(event.data) as {
                type?: string;
                message?: string;
                status?: string;
              };
              if (message.type === "error") {
                setError(
                  message.message
                    ? "Terminal session ended. Reconnect to continue."
                    : "Terminal disconnected",
                );
                setStatus("disconnected");
                return;
              }
            } catch {
              terminal.write(event.data);
            }
            return;
          }
          terminal.write(new Uint8Array(event.data as ArrayBuffer));
        };

        socket.onerror = () => {
          window.clearTimeout(timeout);
          if (disposed) return;
          setStatus("disconnected");
          setError("Terminal connection failed.");
          terminal?.writeln("\r\n\x1b[1;31m[Kairo] Connection error: unable to establish terminal socket.\x1b[0m");
        };

        socket.onclose = () => {
          window.clearTimeout(timeout);
          if (disposed) return;
          setStatus("disconnected");
          terminal?.writeln("\r\n\x1b[1;33m[Kairo] Terminal session closed.\x1b[0m");
        };

        terminal.onData((data) => {
          if (socket?.readyState === WebSocket.OPEN) {
            socket.send(new TextEncoder().encode(data));
          }
        });

        observer = new ResizeObserver(() => {
          if (!terminal || !fitAddon || socket?.readyState !== WebSocket.OPEN) return;
          fitAddon.fit();
          socket.send(
            JSON.stringify({
              type: "resize",
              cols: terminal.cols,
              rows: terminal.rows,
            }),
          );
        });
        observer.observe(host.current);
      } catch {
        if (!disposed) {
          setError("Unable to start the terminal. Retry or reopen the window.");
          setStatus("disconnected");
        }
      }
    }

    void connect();

    return () => {
      disposed = true;
      cleanupPty?.();
      observer?.disconnect();
      socket?.close();
      socketRef.current = null;
      terminalRef.current = null;
      terminal?.dispose();
    };
  }, [nonce, serverId, runtimeClient, runtimeConnected, selected?.status]);

  useEffect(() => {
    if (status !== "connected" || !cwd || !socketRef.current) return;
    socketRef.current.send(new TextEncoder().encode(`cd ${quotePath(cwd)}\n`));
  }, [cwd, status]);

  const focusTerminal = () => {
    terminalRef.current?.focus();
  };

  return (
    <div
      className="flex h-full flex-col bg-[#111111] text-[#5fff6a]"
      onPointerDown={focusTerminal}
      onClick={focusTerminal}
    >
      <div className="flex items-center justify-between gap-3 px-3 py-2 text-[11px] text-white/70 select-none">
        <span>
          {status === "connecting"
            ? `Connecting to ${serverName}…`
            : status === "connected"
              ? `Connected to ${serverName}`
              : error || "Terminal disconnected"}
        </span>
        {status !== "connected" ? (
          <button
            type="button"
            className="rounded-md bg-white/10 px-2 py-1 text-white outline-none hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-emerald-400"
            onClick={() => {
              setStatus("connecting");
              setError(null);
              setNonce((value) => value + 1);
            }}
          >
            Reconnect
          </button>
        ) : null}
      </div>
      <div
        ref={host}
        tabIndex={0}
        className="min-h-0 flex-1 px-2 pb-2 outline-none cursor-text"
        onFocus={focusTerminal}
        onPointerDown={focusTerminal}
        onClick={focusTerminal}
      />
    </div>
  );
}
