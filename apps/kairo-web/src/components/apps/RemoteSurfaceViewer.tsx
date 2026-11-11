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
  const hasInitializedFramebufferRef = useRef<boolean>(false);

  const [isFocused, setIsFocused] = useState(true);
  const [activeSurfaceId, setActiveSurfaceId] = useState(payload?.surfaceId || "surface-default");
  const [surfaceSize, setSurfaceSize] = useState<{ width: number; height: number }>({ width: 958, height: 594 });

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
        const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
        const effectiveDpr = Math.min(Math.max(dpr, 1), 2);
        const targetW = Math.round(width * effectiveDpr);
        const targetH = Math.round(height * effectiveDpr);

        if (targetW < 64 || targetH < 64) continue;

        if (
          Math.abs(lastConfiguredSize.current.width - targetW) > 8 ||
          Math.abs(lastConfiguredSize.current.height - targetH) > 8
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
      runtimeClient.sendSurfaceInputFast({
        surfaceId: activeSurfaceId,
        ...event,
      });
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

      const target = e.currentTarget;
      try {
        target.setPointerCapture(e.pointerId);
      } catch {
        // Ignore
      }

      sendInput({
        eventType: "mousedown",
        button: e.button,
        x: coords.x,
        y: coords.y,
      });
    },
    [getCanvasCoords, sendInput]
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

  useEffect(() => {
    if (!runtimeClient?.getSession()) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    const drawWaiting = () => {
      if (hasInitializedFramebufferRef.current) return;
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
      ctx.fillText("Connecting to display...", w / 2, h / 2);
    };

    drawWaiting();

    const unsubLifecycle = runtimeClient.onSurfaceLifecycle((event) => {
      if (event.surfaceId !== activeSurfaceId) {
        return;
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
          hasInitializedFramebufferRef.current = false;
          setSurfaceSize({ width: event.width, height: event.height });
        }
      }
    });

    const unsubscribe = runtimeClient.onSurfaceFrame((frame) => {
      if (frame.surfaceId !== activeSurfaceId) {
        return;
      }

      if (frame.sequence && frame.sequence < lastSequenceRef.current) {
        return; // Drop out-of-order stale frame
      }
      if (frame.sequence) {
        lastSequenceRef.current = frame.sequence;
      }

      const isFull = Boolean(frame.isFullFrame) || (!hasInitializedFramebufferRef.current && frame.x === 0 && frame.y === 0);

      if (isFull) {
        if (canvas.width !== frame.width || canvas.height !== frame.height) {
          canvas.width = frame.width;
          canvas.height = frame.height;
          setSurfaceSize({ width: frame.width, height: frame.height });
        }
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        hasInitializedFramebufferRef.current = true;

        const totalPixels = frame.width * frame.height;
        const src = frame.data instanceof Uint8Array ? frame.data : new Uint8Array(frame.data);
        if (src.length >= totalPixels * 4) {
          const imgData = new ImageData(
            new Uint8ClampedArray(src.buffer as ArrayBuffer, src.byteOffset, totalPixels * 4),
            frame.width,
            frame.height
          );
          ctx.putImageData(imgData, 0, 0);
        }
      } else {
        // Incremental dirty rectangle update:
        // Must preserve existing framebuffer. Never reset canvas dimensions or clear.
        if (!hasInitializedFramebufferRef.current) {
          return; // Suppress partial dirty updates prior to full initial frame
        }

        const renderX = Math.max(0, frame.x || 0);
        const renderY = Math.max(0, frame.y || 0);

        if (renderX + frame.width > canvas.width || renderY + frame.height > canvas.height) {
          return; // Discard out-of-bounds dirty rectangle
        }

        const totalPixels = frame.width * frame.height;
        const src = frame.data instanceof Uint8Array ? frame.data : new Uint8Array(frame.data);
        if (src.length >= totalPixels * 4) {
          const imgData = new ImageData(
            new Uint8ClampedArray(src.buffer as ArrayBuffer, src.byteOffset, totalPixels * 4),
            frame.width,
            frame.height
          );
          ctx.putImageData(imgData, renderX, renderY);
        }
      }
    });

    return () => {
      unsubLifecycle();
      unsubscribe();
    };
  }, [runtimeClient, activeSurfaceId, windowId, closeWindow, updateWindowTitle]);

  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  const effectiveDpr = Math.min(Math.max(dpr, 1), 2);
  const displayW = Math.round(surfaceSize.width / effectiveDpr);
  const displayH = Math.round(surfaceSize.height / effectiveDpr);

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
        className="relative flex flex-1 items-center justify-center overflow-auto bg-[#0a0a0c]"
      >
        <canvas
          ref={canvasRef}
          width={surfaceSize.width}
          height={surfaceSize.height}
          style={{
            width: `${displayW}px`,
            height: `${displayH}px`,
            maxWidth: "100%",
            maxHeight: "100%",
            imageRendering: "auto",
          }}
          onPointerMove={handlePointerMove}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onContextMenu={(e) => e.preventDefault()}
          onWheel={handleWheel}
          className="cursor-default select-none block"
        />
      </div>
    </div>
  );
}
