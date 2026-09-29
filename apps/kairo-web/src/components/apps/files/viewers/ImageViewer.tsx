"use client";

import { useEffect, useRef, useState, type PointerEvent, type WheelEvent } from "react";
import {
  Download,
  Image as ImageIcon,
  Maximize2,
  RotateCcw,
  RotateCw,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { downloadUrl, mediaUrl } from "@/src/lib/api/files";
import { formatSize } from "@/src/lib/files/format";
import { useSelectedServer } from "@/src/lib/session";
import type { ViewerFile } from "@/src/components/apps/files/viewers/viewer-ui";

export function ImageViewer({ file, onClose }: { file: ViewerFile; onClose: () => void }) {
  const selectedServer = useSelectedServer();
  const serverId = selectedServer?.id || "";
  const initialSrc = mediaUrl(serverId, file.path);

  const [src, setSrc] = useState(initialSrc);
  const [error, setError] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);

  const panStartRef = useRef<{ startX: number; startY: number; initialPanX: number; initialPanY: number } | null>(null);

  useEffect(() => {
    setSrc(mediaUrl(serverId, file.path));
    setError(false);
    setZoom(1);
    setRotation(0);
    setPan({ x: 0, y: 0 });
    setDimensions(null);
  }, [file.path, serverId]);

  function handleImageError() {
    if (src !== "/wallpaper.jpg" && (file.name.toLowerCase().includes("wallpaper") || file.path.includes("wallpaper"))) {
      setSrc("/wallpaper.jpg");
      return;
    }
    setError(true);
  }

  function handleZoomIn() {
    setZoom((prev) => Math.min(5, Math.round((prev + 0.25) * 100) / 100));
  }

  function handleZoomOut() {
    setZoom((prev) => Math.max(0.25, Math.round((prev - 0.25) * 100) / 100));
  }

  function handleResetZoom() {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }

  function handleRotateCw() {
    setRotation((prev) => (prev + 90) % 360);
  }

  function handleRotateCcw() {
    setRotation((prev) => (prev - 90 + 360) % 360);
  }

  function handleWheel(event: WheelEvent<HTMLDivElement>) {
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      const delta = event.deltaY < 0 ? 0.15 : -0.15;
      setZoom((prev) => Math.min(5, Math.max(0.25, Math.round((prev + delta) * 100) / 100)));
    }
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (zoom <= 1) return;
    setIsPanning(true);
    panStartRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      initialPanX: pan.x,
      initialPanY: pan.y,
    };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!isPanning || !panStartRef.current) return;
    const dx = event.clientX - panStartRef.current.startX;
    const dy = event.clientY - panStartRef.current.startY;
    setPan({
      x: panStartRef.current.initialPanX + dx,
      y: panStartRef.current.initialPanY + dy,
    });
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    setIsPanning(false);
    panStartRef.current = null;
    try {
      (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
    } catch {}
  }

  if (error) {
    return (
      <div className="flex h-full w-full flex-col bg-white dark:bg-[#161619] text-neutral-900 dark:text-neutral-100 select-none">
        <header className="flex h-11 shrink-0 items-center justify-between border-b border-black/[0.08] dark:border-white/[0.08] px-4 bg-[#fafafa] dark:bg-[#1f1f23]">
          <span className="text-[13px] font-medium truncate">{file.name}</span>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-2.5 py-1 text-[12px] text-neutral-600 dark:text-neutral-300 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          >
            Close
          </button>
        </header>

        <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
          <div className="size-16 rounded-full bg-red-500/10 flex items-center justify-center mb-3">
            <ImageIcon className="size-8 text-red-500" />
          </div>
          <h3 className="text-[15px] font-semibold text-neutral-800 dark:text-neutral-200">
            Image cannot be loaded
          </h3>
          <p className="text-[12px] text-neutral-500 dark:text-neutral-400 mt-1 max-w-sm">
            {file.name} could not be previewed or the remote file is unavailable.
          </p>
          <div className="flex items-center gap-2 mt-4">
            <button
              type="button"
              onClick={() => {
                setError(false);
                setSrc(mediaUrl(serverId, file.path));
              }}
              className="rounded-lg border border-black/10 dark:border-white/10 bg-white/80 dark:bg-white/10 px-3 py-1.5 text-[12px] font-medium text-neutral-800 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-white/15 transition-colors shadow-sm"
            >
              Retry
            </button>
            <a
              href={downloadUrl(serverId, file.path)}
              className="rounded-lg border border-black/10 dark:border-white/10 bg-white/80 dark:bg-white/10 px-3 py-1.5 text-[12px] font-medium text-neutral-800 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-white/15 transition-colors shadow-sm"
            >
              Download
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col bg-white dark:bg-[#161619] text-neutral-900 dark:text-neutral-100 select-none">
      <header className="flex h-11 shrink-0 items-center justify-between border-b border-black/[0.08] dark:border-white/[0.08] px-3.5 bg-[#fafafa] dark:bg-[#1f1f23]">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[13px] font-medium truncate max-w-[200px]">{file.name}</span>
          {dimensions && (
            <span className="hidden sm:inline-flex rounded-full bg-black/[0.06] dark:bg-white/[0.08] px-2 py-0.5 text-[10px] font-mono text-neutral-500 dark:text-neutral-400">
              {dimensions.width} × {dimensions.height}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleZoomOut}
            className="rounded-lg p-1.5 text-neutral-600 dark:text-neutral-300 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
            title="Zoom Out"
          >
            <ZoomOut className="size-4" />
          </button>
          <button
            type="button"
            onClick={handleResetZoom}
            className="rounded px-1.5 py-0.5 text-[11px] font-mono tabular-nums text-neutral-600 dark:text-neutral-300 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
            title="Reset Zoom to 100%"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            onClick={handleZoomIn}
            className="rounded-lg p-1.5 text-neutral-600 dark:text-neutral-300 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
            title="Zoom In"
          >
            <ZoomIn className="size-4" />
          </button>
          <button
            type="button"
            onClick={handleResetZoom}
            className="rounded-lg p-1.5 text-neutral-600 dark:text-neutral-300 hover:bg-black/5 dark:hover:bg-white/10 transition-colors ml-1"
            title="Fit to Window"
          >
            <Maximize2 className="size-4" />
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleRotateCcw}
            className="rounded-lg p-1.5 text-neutral-600 dark:text-neutral-300 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
            title="Rotate Left"
          >
            <RotateCcw className="size-4" />
          </button>
          <button
            type="button"
            onClick={handleRotateCw}
            className="rounded-lg p-1.5 text-neutral-600 dark:text-neutral-300 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
            title="Rotate Right"
          >
            <RotateCw className="size-4" />
          </button>
          <a
            href={downloadUrl(serverId, file.path)}
            className="rounded-lg p-1.5 text-neutral-600 dark:text-neutral-300 hover:bg-black/5 dark:hover:bg-white/10 transition-colors ml-1"
            title="Download Image"
          >
            <Download className="size-4" />
          </a>
        </div>
      </header>

      <div
        className={`relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-[#f0f0f3] dark:bg-[#141416] p-6 ${
          zoom > 1 ? (isPanning ? "cursor-grabbing" : "cursor-grab") : "cursor-default"
        }`}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <img
          src={src}
          alt={file.name}
          className="max-h-full max-w-full object-contain rounded-[3px] shadow-[0_16px_50px_rgba(0,0,0,0.35)] dark:shadow-[0_20px_60px_rgba(0,0,0,0.7)] select-none pointer-events-none"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) rotate(${rotation}deg) scale(${zoom})`,
            transformOrigin: "center center",
            transition: isPanning ? "none" : "transform 0.15s ease-out",
          }}
          onLoad={(e) => {
            const img = e.currentTarget;
            setDimensions({ width: img.naturalWidth, height: img.naturalHeight });
          }}
          onError={handleImageError}
        />
      </div>

      <footer className="flex h-7 shrink-0 items-center justify-between border-t border-black/[0.08] dark:border-white/[0.08] px-4 text-[11px] text-neutral-500 dark:text-neutral-400 bg-[#fafafa] dark:bg-[#1f1f23]">
        <span className="truncate">{file.path}</span>
        <div className="flex items-center gap-3 shrink-0">
          {dimensions && <span>{dimensions.width} × {dimensions.height} px</span>}
          {file.size > 0 && <span>{formatSize(file.size)}</span>}
        </div>
      </footer>
    </div>
  );
}
