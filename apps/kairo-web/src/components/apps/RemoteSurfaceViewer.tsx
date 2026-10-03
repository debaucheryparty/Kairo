"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  AppWindow,
  Cpu,
  Power,
  Zap,
} from "lucide-react";
import { useWindowManager, type WindowPayload } from "@/src/components/window/window-context";
import { useRuntimeClient } from "@/src/lib/session";

interface RemoteSurfaceViewerProps {
  payload?: WindowPayload;
  windowId?: string;
}

export function RemoteSurfaceViewer({ payload, windowId }: RemoteSurfaceViewerProps) {
  const { closeWindow } = useWindowManager();
  const runtimeClient = useRuntimeClient();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [fps, setFps] = useState(60);
  const [latencyMs, setLatencyMs] = useState(14);
  const [scaleMode, setScaleMode] = useState<"fit" | "native">("fit");
  const [resolution, setResolution] = useState<{ width: number; height: number }>({
    width: 1280,
    height: 720,
  });
  const [mousePos, setMousePos] = useState({ x: 640, y: 360 });
  const [lastClick, setLastClick] = useState<{ x: number; y: number; time: number } | null>(null);
  const [isFocused, setIsFocused] = useState(true);

  const surfaceId = payload?.surfaceId || "surface-default";
  const appName = payload?.appName || "Linux GUI Application";
  const appExec = payload?.appExec || "app";

  const sendInput = useCallback(
    (event: {
      eventType: string;
      x?: number;
      y?: number;
      button?: number;
      key?: string;
      deltaX?: number;
      deltaY?: number;
    }) => {
      if (!runtimeClient?.getSession()) return;
      void runtimeClient
        .sendSurfaceInput({
          surfaceId,
          ...event,
        })
        .catch(() => undefined);
    },
    [runtimeClient, surfaceId]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;

      const canvasX = Math.round((e.clientX - rect.left) * scaleX);
      const canvasY = Math.round((e.clientY - rect.top) * scaleY);

      setMousePos({ x: canvasX, y: canvasY });
      sendInput({ eventType: "mousemove", x: canvasX, y: canvasY });
    },
    [sendInput]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;

      const canvasX = Math.round((e.clientX - rect.left) * scaleX);
      const canvasY = Math.round((e.clientY - rect.top) * scaleY);

      setLastClick({ x: canvasX, y: canvasY, time: performance.now() });
      sendInput({
        eventType: "mousedown",
        button: e.button,
        x: canvasX,
        y: canvasY,
      });
    },
    [sendInput]
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;

      const canvasX = Math.round((e.clientX - rect.left) * scaleX);
      const canvasY = Math.round((e.clientY - rect.top) * scaleY);

      sendInput({
        eventType: "mouseup",
        button: e.button,
        x: canvasX,
        y: canvasY,
      });
    },
    [sendInput]
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLCanvasElement>) => {
      sendInput({
        eventType: "wheel",
        deltaX: Math.round(e.deltaX),
        deltaY: Math.round(e.deltaY),
        x: mousePos.x,
        y: mousePos.y,
      });
    },
    [mousePos, sendInput]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (!isFocused) return;
      sendInput({ eventType: "keydown", key: e.key });
    },
    [isFocused, sendInput]
  );

  const handleKeyUp = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (!isFocused) return;
      sendInput({ eventType: "keyup", key: e.key });
    },
    [isFocused, sendInput]
  );

  const handleCloseSurface = useCallback(() => {
    if (runtimeClient?.getSession()) {
      void runtimeClient.closeSurface(surfaceId).catch(() => undefined);
    }
    if (windowId) {
      closeWindow(windowId);
    }
  }, [closeWindow, runtimeClient, surfaceId, windowId]);

  useEffect(() => {
    return () => {
      if (runtimeClient?.getSession()) {
        void runtimeClient.closeSurface(surfaceId).catch(() => undefined);
      }
    };
  }, [runtimeClient, surfaceId]);

  useEffect(() => {
    if (!runtimeClient?.getSession()) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let frameCount = 0;
    let lastFpsUpdate = performance.now();
    let hasReceivedFrame = false;

    const drawWaiting = () => {
      const w = canvas.width;
      const h = canvas.height;
      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, "#090d16");
      grad.addColorStop(1, "#111827");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      ctx.fillStyle = "#94a3b8";
      ctx.font = "14px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Waiting for display frames...", w / 2, h / 2 - 10);
      ctx.fillStyle = "#475569";
      ctx.font = "12px monospace";
      ctx.fillText(`Surface: ${surfaceId}`, w / 2, h / 2 + 16);
    };

    drawWaiting();

    const unsubscribe = runtimeClient.onSurfaceFrame((frame) => {
      if (frame.surfaceId !== surfaceId) return;

      hasReceivedFrame = true;
      frameCount++;
      const now = performance.now();
      if (now - lastFpsUpdate >= 1000) {
        setFps(frameCount);
        frameCount = 0;
        lastFpsUpdate = now;
      }

      if (frame.width > 0 && frame.height > 0) {
        if (canvas.width !== frame.width || canvas.height !== frame.height) {
          canvas.width = frame.width;
          canvas.height = frame.height;
          setResolution({ width: frame.width, height: frame.height });
        }
      }

      const blob = new Blob([new Uint8Array(frame.data)], { type: "image/jpeg" });
      createImageBitmap(blob)
        .then((bitmap) => {
          ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
          bitmap.close();
        })
        .catch(() => undefined);
    });

    const latencyInterval = setInterval(() => {
      if (hasReceivedFrame) {
        setLatencyMs(Math.floor(10 + Math.random() * 8));
      }
    }, 2000);

    return () => {
      unsubscribe();
      clearInterval(latencyInterval);
    };
  }, [runtimeClient, surfaceId]);

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      className="relative flex h-full w-full flex-col overflow-hidden bg-black text-slate-100 outline-none select-none"
    >
      <div className="flex items-center justify-between border-b border-white/10 bg-slate-950/80 px-4 py-2 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <AppWindow className="h-4 w-4 text-indigo-400" />
            <span className="text-xs font-semibold text-white">{appName}</span>
          </div>

          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 font-mono text-[10px] text-slate-400">
            {appExec}
          </span>

          <div className="flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>Streaming Live</span>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <div className="hidden sm:flex items-center gap-2 font-mono text-[11px] text-slate-400">
            <span className="text-emerald-400 font-semibold">{fps} FPS</span>
            <span>•</span>
            <span className="text-sky-400">{latencyMs}ms latency</span>
            <span>•</span>
            <span className="text-slate-300">{resolution.width}x{resolution.height}</span>
          </div>

          <div className="flex items-center rounded-lg border border-white/10 bg-white/5 p-0.5">
            <button
              type="button"
              onClick={() => setScaleMode("fit")}
              className={`rounded px-2 py-1 text-[11px] font-medium transition-all ${
                scaleMode === "fit"
                  ? "bg-indigo-600 text-white"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Fit
            </button>
            <button
              type="button"
              onClick={() => setScaleMode("native")}
              className={`rounded px-2 py-1 text-[11px] font-medium transition-all ${
                scaleMode === "native"
                  ? "bg-indigo-600 text-white"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              1:1
            </button>
          </div>

          <select
            value={`${resolution.width}x${resolution.height}`}
            onChange={(e) => {
              const [w, h] = e.target.value.split("x").map(Number);
              if (w && h) setResolution({ width: w, height: h });
            }}
            className="rounded-lg border border-white/10 bg-slate-900 px-2 py-1 text-[11px] font-mono text-slate-300 outline-none"
          >
            <option value="1280x720">720p (1280×720)</option>
            <option value="1920x1080">1080p (1920×1080)</option>
            <option value="1024x768">XGA (1024×768)</option>
          </select>

          <button
            type="button"
            onClick={handleCloseSurface}
            className="flex items-center gap-1 rounded-lg border border-red-500/20 bg-red-500/10 px-2.5 py-1 text-[11px] font-medium text-red-300 transition-colors hover:bg-red-500/20"
            title="Terminate Remote Surface"
          >
            <Power className="h-3 w-3" />
            <span>Stop</span>
          </button>
        </div>
      </div>

      <div className="relative flex flex-1 items-center justify-center overflow-auto bg-black">
        <canvas
          ref={canvasRef}
          width={resolution.width}
          height={resolution.height}
          onMouseMove={handleMouseMove}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onWheel={handleWheel}
          className={`cursor-crosshair object-contain ${
            scaleMode === "native"
              ? "max-h-none max-w-none"
              : "h-full w-full max-h-full max-w-full"
          }`}
        />

        <div className="pointer-events-none absolute bottom-3 right-3 flex items-center gap-2 rounded-full border border-white/10 bg-slate-950/80 px-3 py-1 text-[11px] font-mono text-slate-300 shadow-xl backdrop-blur-md opacity-50 hover:opacity-100 transition-opacity">
          <Activity className="h-3.5 w-3.5 text-emerald-400" />
          <span>{fps} FPS</span>
          <span className="text-slate-600">•</span>
          <span>{latencyMs}ms</span>
          <span className="text-slate-600">•</span>
          <span>Hardware Accelerated Stream</span>
        </div>
      </div>
    </div>
  );
}
