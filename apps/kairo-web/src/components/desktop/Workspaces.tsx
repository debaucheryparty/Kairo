"use client";

import React from "react";

type WorkspacesProps = {
  activeWorkspace: number;
  occupiedWorkspaces: Set<number>;
  setWorkspace: (ws: number) => void;
  toggleOverview?: () => void;
};

/**
 * Port of modules/ii/bar/Workspaces.qml
 * Renders workspace buttons 1..5 with active pill, occupied indicators, wheel cycling, and right-click overview toggle.
 */
export function Workspaces({
  activeWorkspace,
  occupiedWorkspaces,
  setWorkspace,
  toggleOverview,
}: WorkspacesProps) {
  const handleWheel = (e: React.WheelEvent) => {
    if (e.deltaY > 0) {
      setWorkspace(Math.min(5, activeWorkspace + 1));
    } else if (e.deltaY < 0) {
      setWorkspace(Math.max(1, activeWorkspace - 1));
    }
  };

  return (
    <div
      className="flex items-center gap-1 p-0.5 rounded-full bg-[var(--m3-surface-container-high)]/60 border border-[var(--m3-outline-variant)]/30 backdrop-blur-md"
      onWheel={handleWheel}
      onContextMenu={(e) => {
        e.preventDefault();
        toggleOverview?.();
      }}
      title="Workspaces 1-5 (Scroll to cycle, right-click for Overview)"
    >
      {[1, 2, 3, 4, 5].map((ws) => {
        const isActive = ws === activeWorkspace;
        const isOccupied = occupiedWorkspaces.has(ws);
        return (
          <button
            key={ws}
            type="button"
            onClick={() => setWorkspace(ws)}
            className={`relative flex items-center justify-center outline-none pill-morph transition-all ${
              isActive
                ? "h-6 px-3 rounded-full bg-[var(--m3-primary)] text-[var(--m3-on-primary)] font-roboto font-bold m3-label-small shadow-sm"
                : "size-6 rounded-full text-[var(--m3-on-surface-variant)] hover:text-[var(--m3-on-surface)] hover:bg-[var(--m3-on-surface)]/10 font-roboto m3-label-small"
            }`}
            aria-label={`Workspace ${ws}`}
          >
            <span>{ws}</span>
            {!isActive && isOccupied && (
              <span className="absolute bottom-0.5 size-1 rounded-full bg-[var(--m3-primary)]" />
            )}
          </button>
        );
      })}
    </div>
  );
}

