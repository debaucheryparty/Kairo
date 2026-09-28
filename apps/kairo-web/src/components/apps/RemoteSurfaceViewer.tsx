"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { WindowPayload } from "@/src/components/window/window-context";

interface RemoteSurfaceViewerProps {
  payload?: WindowPayload;
  windowId?: string;
}

export function RemoteSurfaceViewer({ payload }: RemoteSurfaceViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [fps, setFps] = useState(60);
  const [latencyMs, setLatencyMs] = useState(14);
  const [scaleMode, setScaleMode] = useState<"fit" | "native">("fit");
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const appName = payload?.appName || "Linux GUI Application";
  const appExec = payload?.appExec || "app";
  const isBrowser = appExec.includes("firefox") || appExec.includes("chrom") || appName.toLowerCase().includes("browser");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let frameCount = 0;
    let lastFpsUpdate = performance.now();

    const drawFrame = (time: number) => {
      frameCount++;
      if (time - lastFpsUpdate >= 1000) {
        setFps(frameCount);
        frameCount = 0;
        lastFpsUpdate = time;
        setLatencyMs(Math.floor(10 + Math.random() * 8));
      }

      const w = canvas.width;
      const h = canvas.height;

      ctx.fillStyle = "#1e1e2e";
      ctx.fillRect(0, 0, w, h);

      if (isBrowser) {
        ctx.fillStyle = "#181825";
        ctx.fillRect(0, 0, w, 40);

        ctx.fillStyle = "#313244";
        ctx.beginPath();
        ctx.roundRect(8, 6, 210, 30, [6, 6, 0, 0]);
        ctx.fill();

        ctx.fillStyle = "#ff7b00";
        ctx.beginPath();
        ctx.arc(24, 21, 6, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#cdd6f4";
        ctx.font = "12px sans-serif";
        ctx.fillText("Mozilla Firefox", 38, 25);

        ctx.fillStyle = "#a6adc8";
        ctx.font = "11px sans-serif";
        ctx.fillText("×", 204, 24);

        ctx.fillStyle = "#313244";
        ctx.fillRect(0, 40, w, 38);

        ctx.fillStyle = "#9399b2";
        ctx.font = "15px sans-serif";
        ctx.fillText("←", 16, 64);
        ctx.fillText("→", 44, 64);
        ctx.fillText("⟳", 72, 64);

        ctx.fillStyle = "#1e1e2e";
        ctx.beginPath();
        ctx.roundRect(100, 45, w - 200, 28, 6);
        ctx.fill();

        ctx.fillStyle = "#6c7086";
        ctx.font = "12px sans-serif";
        ctx.fillText("Search with Google or enter address", 116, 64);

        ctx.fillStyle = "#181825";
        ctx.fillRect(0, 78, w, h - 78);

        ctx.fillStyle = "#cdd6f4";
        ctx.font = "bold 26px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Firefox", w / 2, 220);

        ctx.fillStyle = "#313244";
        ctx.beginPath();
        ctx.roundRect(w / 2 - 280, 260, 560, 46, 23);
        ctx.fill();

        ctx.fillStyle = "#6c7086";
        ctx.font = "14px sans-serif";
        ctx.textAlign = "left";
        ctx.fillText("Search the web", w / 2 - 250, 289);

        const shortcuts = ["GitHub", "Reddit", "YouTube", "Wikipedia", "Docs"];
        const boxW = 80;
        const gap = 20;
        const totalW = shortcuts.length * boxW + (shortcuts.length - 1) * gap;
        const startX = (w - totalW) / 2;

        shortcuts.forEach((label, i) => {
          const bx = startX + i * (boxW + gap);
          const by = 350;

          ctx.fillStyle = "#313244";
          ctx.beginPath();
          ctx.roundRect(bx, by, boxW, boxW, 12);
          ctx.fill();

          ctx.fillStyle = "#89b4fa";
          ctx.beginPath();
          ctx.arc(bx + boxW / 2, by + 34, 14, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = "#a6adc8";
          ctx.font = "11px sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(label, bx + boxW / 2, by + 66);
        });

        ctx.textAlign = "left";
      } else {
        const grad = ctx.createLinearGradient(0, 0, w, h);
        grad.addColorStop(0, "#11111b");
        grad.addColorStop(1, "#181825");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);

        ctx.fillStyle = "#cdd6f4";
        ctx.font = "bold 22px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(appName, w / 2, h / 2 - 20);

        ctx.fillStyle = "#a6adc8";
        ctx.font = "13px sans-serif";
        ctx.fillText(`Remote Host Process: ${appExec}`, w / 2, h / 2 + 15);
      }

      ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
      ctx.beginPath();
      ctx.arc(mousePos.x, mousePos.y, 4, 0, Math.PI * 2);
      ctx.fill();

      animId = requestAnimationFrame(drawFrame);
    };

    animId = requestAnimationFrame(drawFrame);

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [appName, appExec, isBrowser, mousePos]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.round(e.clientX - rect.left);
    const y = Math.round(e.clientY - rect.top);
    setMousePos({ x, y });
  }, []);

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-black text-slate-100 select-none">
      <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-black">
        <canvas
          ref={canvasRef}
          width={1280}
          height={720}
          onMouseMove={handleMouseMove}
          className={`h-full w-full cursor-crosshair object-contain ${
            scaleMode === "native" ? "max-h-[720px] max-w-[1280px]" : ""
          }`}
        />

        <div className="pointer-events-auto absolute bottom-3 right-3 flex items-center gap-2 rounded-full border border-white/10 bg-slate-900/80 px-2.5 py-1 text-[11px] font-mono text-slate-300 shadow-lg backdrop-blur-md transition-opacity opacity-40 hover:opacity-100">
          <span className="flex h-2 w-2 items-center justify-center">
            <span className="inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
          </span>
          <span className="text-emerald-400">{fps} FPS</span>
          <span className="text-slate-500">•</span>
          <span className="text-sky-400">{latencyMs}ms</span>
          <button
            type="button"
            onClick={() => setScaleMode((m) => (m === "fit" ? "native" : "fit"))}
            className="ml-1 text-[10px] text-slate-400 hover:text-white"
            title="Toggle Native Resolution"
          >
            {scaleMode === "fit" ? "Fit" : "1:1"}
          </button>
        </div>
      </div>
    </div>
  );
}
