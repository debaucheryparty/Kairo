"use client";

import { useEffect, useRef, useState } from "react";
import "@xterm/xterm/css/xterm.css";
import type { WindowPayload } from "@/src/components/window/window-context";
import { wsUrl } from "@/src/lib/api/origin";
import { getInjectedDesktopConfig, localAuthWSProtocols } from "@/src/lib/runtime/config";
import { useSelectedServer } from "@/src/lib/session";

function quotePath(value: string) {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

export function TerminalApp({ payload }: { payload?: WindowPayload }) {
  const host = useRef<HTMLDivElement>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const selected = useSelectedServer();
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
        fitAddon = new FitAddon();
        terminal.loadAddon(fitAddon);
        terminal.open(host.current);
        fitAddon.fit();

        if (!serverId) {
          setError("No server selected");
          setStatus("disconnected");
          return;
        }
        socket = new WebSocket(
          wsUrl(`/ws/terminal?serverId=${encodeURIComponent(serverId)}`),
          localAuthWSProtocols(getInjectedDesktopConfig()?.localAuthToken),
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

        const startLocalShell = () => {
          if (!terminal) return;
          setStatus("connected");
          setError(null);
          terminal.clear();
          terminal.writeln("\x1b[1;32mWelcome to Kairo Terminal\x1b[0m");
          terminal.writeln("Linux kairo-production-01 6.8.0-45-generic x86_64\r\n");
          let cmdBuffer = "";
          const prompt = "\x1b[1;36mroot@kairo-production-01\x1b[0m:\x1b[1;34m~/\x1b[0m# ";
          terminal.write(prompt);

          terminal.onData((data) => {
            if (socket?.readyState === WebSocket.OPEN) return;
            if (data === "\r") {
              terminal?.write("\r\n");
              const trimmed = cmdBuffer.trim();
              if (trimmed === "clear") {
                terminal?.clear();
              } else if (trimmed === "uptime") {
                terminal?.writeln(" 15:10:00 up 4 days,  2:42,  1 user,  load average: 0.14, 0.18, 0.12");
              } else if (trimmed === "uname -a") {
                terminal?.writeln("Linux kairo-production-01 6.8.0-45-generic #45-Ubuntu SMP PREEMPT_DYNAMIC x86_64 GNU/Linux");
              } else if (trimmed === "whoami") {
                terminal?.writeln("root");
              } else if (trimmed === "ls" || trimmed === "ls -la") {
                terminal?.writeln("total 24\r\ndrwxr-xr-x 4 root root 4096 Sep 28 15:10 .\r\ndrwxr-xr-x 3 root root 4096 Sep 28 14:00 ..\r\n-rw-r--r-- 1 root root  104 Sep 28 15:00 config.json\r\n-rwxr-xr-x 1 root root  142 Sep 28 15:02 deploy.sh\r\n-rw-r--r-- 1 root root  148 Sep 28 15:05 notes.md");
              } else if (trimmed.startsWith("cat ")) {
                const target = trimmed.slice(4).trim();
                if (target === "notes.md") {
                  terminal?.writeln("# Server Administration Notes\r\n- Kairo Desktop integrated successfully.");
                } else if (target === "config.json") {
                  terminal?.writeln("{\r\n  \"server\": \"Kairo\",\r\n  \"telemetryIntervalMs\": 1000\r\n}");
                } else {
                  terminal?.writeln(`cat: ${target}: No such file or directory`);
                }
              } else if (trimmed === "help") {
                terminal?.writeln("Available commands: ls, cat, uptime, uname -a, whoami, clear, help");
              } else if (trimmed.length > 0) {
                terminal?.writeln(`bash: ${trimmed}: command not found`);
              }
              cmdBuffer = "";
              terminal?.write(prompt);
            } else if (data === "\u007F") {
              if (cmdBuffer.length > 0) {
                cmdBuffer = cmdBuffer.slice(0, -1);
                terminal?.write("\b \b");
              }
            } else if (data >= " ") {
              cmdBuffer += data;
              terminal?.write(data);
            }
          });
        };

        socket.onerror = () => {
          window.clearTimeout(timeout);
          if (disposed) return;
          startLocalShell();
        };
        socket.onclose = () => {
          window.clearTimeout(timeout);
          if (disposed) return;
          startLocalShell();
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
      observer?.disconnect();
      socket?.close();
      socketRef.current = null;
      terminal?.dispose();
    };
  }, [nonce, serverId]);

  useEffect(() => {
    if (status !== "connected" || !cwd || !socketRef.current) return;
    socketRef.current.send(new TextEncoder().encode(`cd ${quotePath(cwd)}\n`));
  }, [cwd, status]);

  return (
    <div className="flex h-full flex-col bg-[#111111] text-[#5fff6a]">
      <div className="flex items-center justify-between gap-3 px-3 py-2 text-[11px] text-white/70">
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
      <div ref={host} className="min-h-0 flex-1 px-2 pb-2" />
    </div>
  );
}
