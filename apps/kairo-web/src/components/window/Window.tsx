"use client";

import { useState, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { APP_META } from "@/src/data/apps";
import { WINDOW_MIN_HEIGHT, WINDOW_MIN_WIDTH } from "@/src/lib/desktop";
import { WindowHeader } from "@/src/components/window/WindowHeader";
import { useServer } from "@/src/lib/api/server-context";
import { useSelectedServer } from "@/src/lib/session";
import { useTheme } from "@/src/lib/theme";
import {
  useWindowManager,
  type WindowState,
  snapRect,
  type SnapSide,
} from "@/src/components/window/window-context";

type ResizeEdge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

const EDGES: ResizeEdge[] = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];

export function Window({ window: win, children }: { window: WindowState; children: ReactNode }) {
  const {
    focusedId,
    focusWindow,
    closeWindow,
    minimizeWindow,
    maximizeWindow,
    restoreWindow,
    snapWindow,
    setSnapPreview,
    updateWindowPosition,
    updateWindowSize,
  } = useWindowManager();
  const { server } = useServer();
  const selected = useSelectedServer();
  const { theme } = useTheme();
  const [isDragging, setIsDragging] = useState(false);
  const drag = useRef<{
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const resize = useRef<{
    edge: ResizeEdge;
    startX: number;
    startY: number;
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);

  const focused = focusedId === win.id;
  const chrome = win.chrome ?? APP_META[win.app].chrome;
  const light = chrome === "light" && theme === "light";
  const title =
    win.app === "terminal"
      ? `Terminal — ${selected?.hostname || selected?.address || server?.hostname || server?.host || "server"}`
      : win.title;

  function onHeaderPointerDown(event: ReactPointerEvent<HTMLElement>) {
    if (event.button !== 0) return;
    focusWindow(win.id);

    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    setIsDragging(true);

    if (win.maximized || win.snapped) {
      const origBounds = win.restoreBounds || { width: 720, height: 520 };
      const restoreWidth = origBounds.width;
      const restoreHeight = origBounds.height;
      const newX = Math.round(event.clientX - restoreWidth / 2);
      const newY = Math.round(event.clientY - 16);
      restoreWindow(win.id);
      updateWindowSize(win.id, restoreWidth, restoreHeight, newX, newY);
      drag.current = {
        offsetX: restoreWidth / 2,
        offsetY: 16,
      };
    } else {
      drag.current = {
        offsetX: event.clientX - win.x,
        offsetY: event.clientY - win.y,
      };
    }

    function onMove(moveEvent: PointerEvent) {
      if (!drag.current) return;
      const newX = moveEvent.clientX - drag.current.offsetX;
      const newY = moveEvent.clientY - drag.current.offsetY;
      updateWindowPosition(win.id, newX, newY);

      if (moveEvent.clientX <= 28) {
        setSnapPreview({ side: "left", rect: snapRect("left") });
      } else if (moveEvent.clientX >= window.innerWidth - 28) {
        setSnapPreview({ side: "right", rect: snapRect("right") });
      } else if (moveEvent.clientY <= 36) {
        setSnapPreview({ side: "top", rect: snapRect("top") });
      } else {
        setSnapPreview(null);
      }
    }

    function onUp(upEvent: PointerEvent) {
      drag.current = null;
      setIsDragging(false);
      target.releasePointerCapture(event.pointerId);
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", onUp);

      if (upEvent.clientX <= 28) {
        snapWindow(win.id, "left");
      } else if (upEvent.clientX >= window.innerWidth - 28) {
        snapWindow(win.id, "right");
      } else if (upEvent.clientY <= 36) {
        maximizeWindow(win.id);
      }
      setSnapPreview(null);
    }

    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerup", onUp);
  }

  function onResizePointerDown(event: ReactPointerEvent<HTMLDivElement>, edge: ResizeEdge) {
    if (event.button !== 0 || win.maximized) return;
    event.stopPropagation();
    focusWindow(win.id);
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    resize.current = {
      edge,
      startX: event.clientX,
      startY: event.clientY,
      x: win.x,
      y: win.y,
      width: win.width,
      height: win.height,
    };

    function onMove(moveEvent: PointerEvent) {
      const current = resize.current;
      if (!current) return;
      const dx = moveEvent.clientX - current.startX;
      const dy = moveEvent.clientY - current.startY;
      let { x, y, width, height } = current;

      if (current.edge.includes("e")) width = current.width + dx;
      if (current.edge.includes("s")) height = current.height + dy;
      if (current.edge.includes("w")) {
        width = current.width - dx;
        x = current.x + dx;
        if (width < WINDOW_MIN_WIDTH) {
          x = current.x + current.width - WINDOW_MIN_WIDTH;
          width = WINDOW_MIN_WIDTH;
        }
      }
      if (current.edge.includes("n")) {
        height = current.height - dy;
        y = current.y + dy;
        if (height < WINDOW_MIN_HEIGHT) {
          y = current.y + current.height - WINDOW_MIN_HEIGHT;
          height = WINDOW_MIN_HEIGHT;
        }
      }

      updateWindowSize(win.id, width, height, x, y);
    }

    function onUp() {
      resize.current = null;
      target.releasePointerCapture(event.pointerId);
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", onUp);
    }

    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerup", onUp);
  }

  return (
    <article
      role="dialog"
      aria-label={title}
      aria-modal="false"
      className={`absolute flex flex-col overflow-hidden backdrop-blur-2xl ${
        win.maximized
          ? "inset-0 h-full w-full rounded-none border-0 shadow-none"
          : `rounded-[18px] animate-window-in ${
              isDragging ? "" : "transition-[left,top,width,height] duration-200 ease-out"
            } ${
              light
                ? "border border-black/[0.1] bg-[#ffffff] shadow-[0_22px_70px_rgba(0,0,0,0.2),0_0_0_1px_rgba(255,255,255,0.7)_inset]"
                : "border border-white/[0.12] bg-[#1a1a1d] shadow-[0_26px_80px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,255,255,0.08)_inset]"
            } ${focused ? "ring-1 ring-black/[0.08] dark:ring-white/[0.18]" : "opacity-95"}`
      } ${win.maximized ? (light ? "bg-[#ffffff]" : "bg-[#1a1a1d]") : ""}`}
      style={
        win.maximized
          ? { zIndex: win.zIndex }
          : {
              left: win.x,
              top: win.y,
              width: win.width,
              height: win.height,
              zIndex: win.zIndex,
            }
      }
      onPointerDown={() => focusWindow(win.id)}
    >
      <WindowHeader
        title={title}
        focused={focused}
        chrome={light ? "light" : "dark"}
        maximized={win.maximized || Boolean(win.snapped)}
        onPointerDown={onHeaderPointerDown}
        onDoubleClick={() =>
          win.maximized || win.snapped ? restoreWindow(win.id) : maximizeWindow(win.id)
        }
        onMinimize={() => minimizeWindow(win.id)}
        onMaximize={() =>
          win.maximized || win.snapped ? restoreWindow(win.id) : maximizeWindow(win.id)
        }
        onSnap={(side) => snapWindow(win.id, side)}
        onClose={() => closeWindow(win.id)}
      />
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
      {!win.maximized
        ? EDGES.map((edge) => (
            <div
              key={edge}
              role="separator"
              aria-label={`Resize ${title} ${edge}`}
              className={resizeHandleClass(edge)}
              onPointerDown={(event) => onResizePointerDown(event, edge)}
            >
              <span className="sr-only">{`Resize ${title} ${edge}`}</span>
            </div>
          ))
        : null}
    </article>
  );
}

function resizeHandleClass(edge: ResizeEdge) {
  const base = "absolute z-20";
  switch (edge) {
    case "n":
      return `${base} inset-x-3 top-0 h-1.5 cursor-n-resize`;
    case "s":
      return `${base} inset-x-3 bottom-0 h-1.5 cursor-s-resize`;
    case "e":
      return `${base} inset-y-3 right-0 w-1.5 cursor-e-resize`;
    case "w":
      return `${base} inset-y-3 left-0 w-1.5 cursor-w-resize`;
    case "ne":
      return `${base} right-0 top-0 size-3 cursor-ne-resize`;
    case "nw":
      return `${base} left-0 top-0 size-3 cursor-nw-resize`;
    case "se":
      return `${base} bottom-0 right-0 size-3 cursor-se-resize`;
    case "sw":
      return `${base} bottom-0 left-0 size-3 cursor-sw-resize`;
  }
}
