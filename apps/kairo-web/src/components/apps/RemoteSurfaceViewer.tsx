"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useWindowManager, type WindowPayload } from "@/src/components/window/window-context";
import { useRuntimeClient } from "@/src/lib/session";

interface RemoteSurfaceViewerProps {
  payload?: WindowPayload;
  windowId?: string;
}

export function RemoteSurfaceViewer({ payload, windowId }: RemoteSurfaceViewerProps) {
  const { closeWindow, updateWindowTitle } = useWindowManager();
  const runtimeClient = useRuntimeClient();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const lastSequenceRef = useRef<number>(0);
  const lastConfiguredSize = useRef<{ width: number; height: number }>({ width: 0, height: 0 });
  const mousePosRef = useRef<{ x: number; y: number }>({ x: 640, y: 360 });

  const [isFocused, setIsFocused] = useState(true);
  const [activeSurfaceId, setActiveSurfaceId] = useState(payload?.surfaceId || "surface-default");

  useEffect(() => {
    if (payload?.surfaceId) {
      setActiveSurfaceId(payload.surfaceId);
    }
  }, [payload?.surfaceId]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    let resizeTimer: ReturnType<typeof setTimeout> | undefined;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        const targetW = Math.round(width);
        const targetH = Math.round(height);

        if (targetW < 64 || targetH < 64) continue;

        if (
          Math.abs(lastConfiguredSize.current.width - targetW) > 4 ||
          Math.abs(lastConfiguredSize.current.height - targetH) > 4
        ) {
          clearTimeout(resizeTimer);
          resizeTimer = setTimeout(() => {
            if (!runtimeClient?.getSession()) return;
            lastConfiguredSize.current = { width: targetW, height: targetH };
            void runtimeClient
              .configureSurface(activeSurfaceId, 0, 0, targetW, targetH)
              .catch(() => undefined);
          }, 150);
        }
      }
    });

    observer.observe(viewport);

    return () => {
      clearTimeout(resizeTimer);
      observer.disconnect();
    };
  }, [activeSurfaceId, runtimeClient]);

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
          surfaceId: activeSurfaceId,
          ...event,
        })
        .catch(() => undefined);
    },
    [runtimeClient, activeSurfaceId]
  );

  const getCanvasCoords = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement> | React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;

      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;

      const rawX = Math.round((e.clientX - rect.left) * scaleX);
      const rawY = Math.round((e.clientY - rect.top) * scaleY);

      const x = Math.max(0, Math.min(canvas.width - 1, rawX));
      const y = Math.max(0, Math.min(canvas.height - 1, rawY));

      return { x, y };
    },
    []
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const coords = getCanvasCoords(e);
      if (!coords) return;

      mousePosRef.current = { x: coords.x, y: coords.y };
      sendInput({ eventType: "mousemove", x: coords.x, y: coords.y });
    },
    [getCanvasCoords, sendInput]
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const coords = getCanvasCoords(e);
      if (!coords) return;

      const t0 = performance.now();
      console.log(`[CLIENT INPUT] type=mousedown button=${e.button} x=${coords.x} y=${coords.y} timestamp=${t0.toFixed(2)}ms`);

      const target = e.currentTarget;
      try {
        target.setPointerCapture(e.pointerId);
      } catch {
        // Ignore
      }

      if (runtimeClient?.getSession()) {
        void runtimeClient.focusSurface(activeSurfaceId).catch(() => undefined);
      }

      sendInput({
        eventType: "mousedown",
        button: e.button,
        x: coords.x,
        y: coords.y,
      });

      const t1 = performance.now();
      console.log(`[CLIENT WS] sent input mousedown timestamp=${t1.toFixed(2)}ms (prep: ${(t1 - t0).toFixed(2)}ms)`);
    },
    [activeSurfaceId, getCanvasCoords, runtimeClient, sendInput]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const coords = getCanvasCoords(e);
      if (!coords) return;

      const target = e.currentTarget;
      try {
        if (target.hasPointerCapture(e.pointerId)) {
          target.releasePointerCapture(e.pointerId);
        }
      } catch {
        // Ignore
      }

      sendInput({
        eventType: "mouseup",
        button: e.button,
        x: coords.x,
        y: coords.y,
      });
    },
    [getCanvasCoords, sendInput]
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLCanvasElement>) => {
      sendInput({
        eventType: "wheel",
        deltaX: Math.round(e.deltaX),
        deltaY: Math.round(e.deltaY),
        x: mousePosRef.current.x,
        y: mousePosRef.current.y,
      });
    },
    [sendInput]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (!isFocused) return;
      const t0 = performance.now();
      console.log(`[CLIENT INPUT] type=keydown key=${e.key} timestamp=${t0.toFixed(2)}ms`);
      sendInput({ eventType: "keydown", key: e.key });
      const t1 = performance.now();
      console.log(`[CLIENT WS] sent input keydown key=${e.key} timestamp=${t1.toFixed(2)}ms (prep: ${(t1 - t0).toFixed(2)}ms)`);
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

  useEffect(() => {
    if (!runtimeClient?.getSession()) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

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
      ctx.fillText(`Surface: ${activeSurfaceId}`, w / 2, h / 2 + 16);
    };

    drawWaiting();

    const unsubLifecycle = runtimeClient.onSurfaceLifecycle((event) => {
      if (event.surfaceId === activeSurfaceId || (activeSurfaceId.startsWith("app-") && !hasReceivedFrame)) {
        if (activeSurfaceId !== event.surfaceId) {
          setActiveSurfaceId(event.surfaceId);
        }
        if (event.title && windowId) {
          updateWindowTitle(windowId, event.title);
        }
        if (event.state === "destroyed" && windowId) {
          closeWindow(windowId);
          return;
        }
        if (event.width > 0 && event.height > 0) {
          if (canvas.width !== event.width || canvas.height !== event.height) {
            canvas.width = event.width;
            canvas.height = event.height;
          }
        }
      }
    });

    const unsubscribe = runtimeClient.onSurfaceFrame((frame) => {
      if (frame.surfaceId !== activeSurfaceId) {
        if (activeSurfaceId.startsWith("app-") && !hasReceivedFrame) {
          setActiveSurfaceId(frame.surfaceId);
        } else {
          return;
        }
      }

      if (frame.sequence && frame.sequence < lastSequenceRef.current) {
        return; // Drop out-of-order stale frame
      }
      if (frame.sequence) {
        lastSequenceRef.current = frame.sequence;
      }

      hasReceivedFrame = true;

      const renderX = Math.max(0, frame.x || 0);
      const renderY = Math.max(0, frame.y || 0);

      const targetW = Math.max(canvas.width, renderX + frame.width);
      const targetH = Math.max(canvas.height, renderY + frame.height);
      if (canvas.width !== targetW || canvas.height !== targetH) {
        const prev = ctx.getImageData(0, 0, canvas.width, canvas.height);
        canvas.width = targetW;
        canvas.height = targetH;
        ctx.putImageData(prev, 0, 0);
      }

      const t_recv = performance.now();
      console.log(`[CLIENT FRAME] received surfaceId=${frame.surfaceId} seq=${frame.sequence} w=${frame.width} h=${frame.height} codec=${frame.codec} size=${frame.data.byteLength} timestamp=${t_recv.toFixed(2)}ms`);

      if (frame.codec === "raw_rgba") {
        const totalPixels = frame.width * frame.height;
        const src = frame.data instanceof Uint8Array ? frame.data : new Uint8Array(frame.data);
        if (src.length < totalPixels * 4) {
          return;
        }
        const clamped = new Uint8ClampedArray(src.buffer, src.byteOffset, totalPixels * 4);
        const imgData = new ImageData(clamped, frame.width, frame.height);
        ctx.putImageData(imgData, renderX, renderY);
        const t_paint = performance.now();
        console.log(`[CLIENT CANVAS] painted seq=${frame.sequence} timestamp=${t_paint.toFixed(2)}ms (render: ${(t_paint - t_recv).toFixed(2)}ms)`);
      } else if (frame.codec === "raw_bgra") {
        const totalPixels = frame.width * frame.height;
        const src = frame.data instanceof Uint8Array ? frame.data : new Uint8Array(frame.data);
        if (src.length < totalPixels * 4) {
          return; // Drop truncated / malformed frame
        }

        const imgData = ctx.createImageData(frame.width, frame.height);
        const dst = imgData.data;
        for (let i = 0; i < totalPixels; i++) {
          const s = i * 4;
          const d = i * 4;
          dst[d] = src[s + 2];     // Red
          dst[d + 1] = src[s + 1]; // Green
          dst[d + 2] = src[s];     // Blue
          dst[d + 3] = 255;        // Alpha
        }
        ctx.putImageData(imgData, renderX, renderY);
        const t_paint = performance.now();
        console.log(`[CLIENT CANVAS] painted seq=${frame.sequence} timestamp=${t_paint.toFixed(2)}ms (render: ${(t_paint - t_recv).toFixed(2)}ms)`);
      } else {
        const blob = new Blob([new Uint8Array(frame.data)], {
          type: frame.codec === "png" ? "image/png" : "image/jpeg",
        });
        createImageBitmap(blob)
          .then((bitmap) => {
            ctx.drawImage(bitmap, renderX, renderY, frame.width, frame.height);
            bitmap.close();
            const t_paint = performance.now();
            console.log(`[CLIENT CANVAS] painted seq=${frame.sequence} timestamp=${t_paint.toFixed(2)}ms (render: ${(t_paint - t_recv).toFixed(2)}ms)`);
          })
          .catch(() => undefined);
      }
    });

    return () => {
      unsubLifecycle();
      unsubscribe();
    };
  }, [runtimeClient, activeSurfaceId, windowId, closeWindow, updateWindowTitle]);

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
      <div
        ref={viewportRef}
        className="relative flex flex-1 items-center justify-center overflow-hidden bg-black"
      >
        <canvas
          ref={canvasRef}
          width={1280}
          height={720}
          onPointerMove={handlePointerMove}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onContextMenu={(e) => e.preventDefault()}
          onWheel={handleWheel}
          className="cursor-default object-contain h-full w-full max-h-full max-w-full"
        />
      </div>
    </div>
  );
}
