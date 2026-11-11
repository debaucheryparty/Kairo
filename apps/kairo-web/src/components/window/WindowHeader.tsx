"use client";

import { useState, useRef, type PointerEvent } from "react";
import { BrandMark } from "@/src/components/brand/BrandMark";
import { Minus, Square, Copy, X, LayoutGrid, Search, MoreVertical } from "lucide-react";
import type { WindowChrome } from "@/src/data/apps";

type WindowHeaderProps = {
  title: string;
  focused: boolean;
  chrome: WindowChrome;
  maximized: boolean;
  onPointerDown: (event: PointerEvent<HTMLElement>) => void;
  onDoubleClick: () => void;
  onMinimize: () => void;
  onMaximize: () => void;
  onSnap?: (side: "left" | "right") => void;
  onClose: () => void;
};

export function WindowHeader({
  title,
  focused,
  chrome,
  maximized,
  onPointerDown,
  onDoubleClick,
  onMinimize,
  onMaximize,
  onSnap,
  onClose,
}: WindowHeaderProps) {
  const light = chrome === "light";
  const [snapMenuOpen, setSnapMenuOpen] = useState(false);

  return (
    <header
      className={`relative flex h-11 shrink-0 cursor-grab items-center justify-between px-3.5 select-none active:cursor-grabbing border-b transition-colors border-[var(--md-sys-color-outline-variant)]/30 ${
        focused
          ? "bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)]"
          : "bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface-variant)] opacity-90"
      }`}
      style={{ fontFamily: "'Readex Pro', 'Plus Jakarta Sans', sans-serif" }}
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
    >
      {/* Left: Search button + Brand/Window Icon */}
      <div className="flex items-center gap-2 min-w-0 pr-4">
        <button
          type="button"
          className="flex size-7 items-center justify-center rounded-full hover:bg-[var(--md-sys-color-on-surface)]/10 text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] transition-colors"
          title="Search"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <Search className="size-3.5" />
        </button>

        <div className="flex items-center gap-1.5 min-w-0">
          <h2 className="text-[13px] font-semibold tracking-tight truncate max-w-[320px]">
            {title}
          </h2>
          <button
            type="button"
            className="flex size-6 items-center justify-center rounded-full hover:bg-[var(--md-sys-color-on-surface)]/10 text-[var(--md-sys-color-on-surface-variant)]/70 hover:text-[var(--md-sys-color-on-surface)] transition-colors"
            title="Options"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <MoreVertical className="size-3" />
          </button>
        </div>
      </div>

      {/* Right: Modern Wayland / Hyprland Window Controls */}
      <div
        className="flex items-center gap-1.5 shrink-0"
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Snapping / Tiling Button */}
        {onSnap && (
          <div className="relative">
            <button
              type="button"
              title="Snap Window"
              onClick={() => setSnapMenuOpen((prev) => !prev)}
              className="flex size-6 items-center justify-center rounded-full hover:bg-[var(--md-sys-color-on-surface)]/10 text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] transition-colors"
            >
              <LayoutGrid className="size-3" />
            </button>

            {snapMenuOpen && (
              <div
                className="absolute right-0 top-8 z-50 flex items-center gap-1.5 rounded-[18px] border border-[var(--md-sys-color-outline-variant)]/30 bg-[var(--md-sys-color-surface-container-high)] p-2 shadow-2xl backdrop-blur-2xl animate-hypr-pop text-[var(--md-sys-color-on-surface)]"
                onMouseLeave={() => setSnapMenuOpen(false)}
              >
                <button
                  type="button"
                  onClick={() => {
                    onSnap("left");
                    setSnapMenuOpen(false);
                  }}
                  className="flex flex-col items-center gap-1 p-2 rounded-xl hover:bg-[var(--md-sys-color-on-surface)]/10 text-[10px] text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] transition-colors"
                  title="Snap Left"
                >
                  <div className="h-5 w-8 rounded border border-[var(--md-sys-color-outline-variant)]/40 bg-[var(--md-sys-color-surface-container)] flex overflow-hidden">
                    <div className="w-1/2 bg-[var(--md-sys-color-primary)]/80" />
                  </div>
                  <span>Left</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onSnap("right");
                    setSnapMenuOpen(false);
                  }}
                  className="flex flex-col items-center gap-1 p-2 rounded-xl hover:bg-[var(--md-sys-color-on-surface)]/10 text-[10px] text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] transition-colors"
                  title="Snap Right"
                >
                  <div className="h-5 w-8 rounded border border-[var(--md-sys-color-outline-variant)]/40 bg-[var(--md-sys-color-surface-container)] flex overflow-hidden">
                    <div className="ml-auto w-1/2 bg-[var(--md-sys-color-primary)]/80" />
                  </div>
                  <span>Right</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Minimize Button */}
        <button
          type="button"
          aria-label="Minimize"
          title="Minimize"
          onClick={onMinimize}
          className="flex size-6 items-center justify-center rounded-full hover:bg-[var(--md-sys-color-on-surface)]/10 text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] transition-colors"
        >
          <Minus className="size-3" />
        </button>

        {/* Maximize / Restore Button */}
        <button
          type="button"
          aria-label={maximized ? "Restore" : "Maximize"}
          title={maximized ? "Restore" : "Maximize"}
          onClick={onMaximize}
          className="flex size-6 items-center justify-center rounded-full hover:bg-[var(--md-sys-color-on-surface)]/10 text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] transition-colors"
        >
          {maximized ? <Copy className="size-3" /> : <Square className="size-2.5" />}
        </button>

        {/* Close Button (Circle style matching Screenshot 1 & 2) */}
        <button
          type="button"
          aria-label="Close"
          title="Close"
          onClick={onClose}
          className="flex size-6 items-center justify-center rounded-full bg-[var(--md-sys-color-on-surface)]/10 hover:bg-[var(--md-sys-color-error-container)] hover:text-[var(--md-sys-color-on-error-container)] text-[var(--md-sys-color-on-surface-variant)] transition-colors"
        >
          <X className="size-3" />
        </button>
      </div>
    </header>
  );
}
