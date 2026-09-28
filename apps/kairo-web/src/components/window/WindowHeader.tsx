"use client";

import { useState, useRef, type PointerEvent, type ReactNode } from "react";
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
  const snapTimerRef = useRef<number | null>(null);

  const handleGreenMouseEnter = () => {
    snapTimerRef.current = window.setTimeout(() => {
      setSnapMenuOpen(true);
    }, 350);
  };

  const handleGreenMouseLeave = () => {
    if (snapTimerRef.current) {
      window.clearTimeout(snapTimerRef.current);
    }
  };

  return (
    <header
      className={`relative flex h-10 shrink-0 cursor-grab items-center px-3.5 select-none active:cursor-grabbing border-b ${
        light
          ? focused
            ? "border-black/[0.06] bg-[var(--window-header)]/85 backdrop-blur-xl"
            : "border-black/[0.04] bg-[var(--window-header-inactive)]/85 backdrop-blur-xl"
          : focused
            ? "border-white/[0.08] bg-[#222226]/90 backdrop-blur-xl"
            : "border-white/[0.05] bg-[#1c1c20]/90 backdrop-blur-xl"
      }`}
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
    >
      <div className="group/traffic z-10 flex items-center gap-[7px]">
        <TrafficLight
          label="Close"
          className={
            focused
              ? "bg-[#ff5f57] text-[#4d0000]"
              : "bg-[#8e8e93] text-[#4d0000] group-hover/traffic:bg-[#ff5f57]"
          }
          onClick={onClose}
        >
          <CloseGlyph />
        </TrafficLight>
        <TrafficLight
          label="Minimize"
          className={
            focused
              ? "bg-[#febc2e] text-[#9a5f00]"
              : "bg-[#8e8e93] text-[#9a5f00] group-hover/traffic:bg-[#febc2e]"
          }
          onClick={onMinimize}
        >
          <MinimizeGlyph />
        </TrafficLight>
        <div
          className="relative inline-flex items-center"
          onMouseEnter={handleGreenMouseEnter}
          onMouseLeave={handleGreenMouseLeave}
        >
          <TrafficLight
            label={maximized ? "Restore" : "Maximize"}
            className={
              focused
                ? "bg-[#28c840] text-[#0b5a12]"
                : "bg-[#8e8e93] text-[#0b5a12] group-hover/traffic:bg-[#28c840]"
            }
            onClick={onMaximize}
          >
            <ZoomGlyph restore={maximized} />
          </TrafficLight>

          {snapMenuOpen && onSnap && (
            <div
              className="absolute left-0 top-7 z-50 flex items-center gap-1.5 rounded-2xl border border-white/15 bg-[#1b1c20]/95 p-2 shadow-2xl backdrop-blur-2xl animate-menu-in ring-1 ring-black/20"
              onMouseEnter={() => {
                if (snapTimerRef.current) window.clearTimeout(snapTimerRef.current);
              }}
              onMouseLeave={() => setSnapMenuOpen(false)}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSnap("left");
                  setSnapMenuOpen(false);
                }}
                className="flex flex-col items-center gap-1.5 rounded-xl p-2 hover:bg-white/10 text-[10px] text-slate-300 hover:text-white transition-colors"
                title="Snap Left (50%)"
              >
                <div className="flex h-6 w-9 overflow-hidden rounded-md border border-white/25 bg-white/5">
                  <div className="w-1/2 bg-sky-500/80" />
                </div>
                <span>Left</span>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSnap("right");
                  setSnapMenuOpen(false);
                }}
                className="flex flex-col items-center gap-1.5 rounded-xl p-2 hover:bg-white/10 text-[10px] text-slate-300 hover:text-white transition-colors"
                title="Snap Right (50%)"
              >
                <div className="flex h-6 w-9 overflow-hidden rounded-md border border-white/25 bg-white/5">
                  <div className="ml-auto w-1/2 bg-sky-500/80" />
                </div>
                <span>Right</span>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onMaximize();
                  setSnapMenuOpen(false);
                }}
                className="flex flex-col items-center gap-1.5 rounded-xl p-2 hover:bg-white/10 text-[10px] text-slate-300 hover:text-white transition-colors"
                title="Fullscreen"
              >
                <div className="h-6 w-9 rounded-md border border-white/25 bg-sky-500/80" />
                <span>Full</span>
              </button>
            </div>
          )}
        </div>
      </div>
      <h2
        className={`pointer-events-none absolute inset-x-16 truncate text-center text-[13px] font-medium tracking-tight ${
          light ? "text-neutral-700" : "text-neutral-200"
        }`}
      >
        {title}
      </h2>
    </header>
  );
}

function TrafficLight({
  label,
  className,
  onClick,
  children,
}: {
  label: string;
  className: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`flex size-3 items-center justify-center rounded-full ring-1 ring-black/10 dark:ring-white/10 outline-none transition-colors duration-150 ${className}`}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      <span className="flex opacity-0 transition-opacity duration-75 group-hover/traffic:opacity-100 group-focus-within/traffic:opacity-100">
        {children}
      </span>
    </button>
  );
}

function CloseGlyph() {
  return (
    <svg viewBox="0 0 12 12" aria-hidden className="size-[7px]">
      <path
        d="M3 3l6 6M9 3l-6 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MinimizeGlyph() {
  return (
    <svg viewBox="0 0 12 12" aria-hidden className="size-[7px]">
      <path
        d="M2.5 6.1h7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ZoomGlyph({ restore }: { restore: boolean }) {
  if (restore) {
    return (
      <svg viewBox="0 0 12 12" aria-hidden className="size-[8px]">
        <path fill="currentColor" d="M1.6 6.6h3.8V2.8L1.6 6.6Z" />
        <path fill="currentColor" d="M10.4 5.4H6.6v3.8l3.8-3.8Z" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 12 12" aria-hidden className="size-[8px]">
      <path fill="currentColor" d="M6.4 1.4h4.2v4.2L6.4 1.4Z" />
      <path fill="currentColor" d="M5.6 10.6H1.4V6.4l4.2 4.2Z" />
    </svg>
  );
}
