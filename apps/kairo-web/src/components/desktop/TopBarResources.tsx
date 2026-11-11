"use client";

import React from "react";

type TopBarResourcesProps = {
  cpuPercent?: number;
  ramPercent?: number;
};

/**
 * Port of modules/ii/bar/Resources.qml
 * Displays CPU and Memory telemetry chips with authentic Material Symbol icons.
 */
export function TopBarResources({ cpuPercent, ramPercent }: TopBarResourcesProps) {
  return (
    <div className="flex items-center gap-1.5">
      {typeof cpuPercent === "number" && (
        <div
          className="flex items-center gap-1.5 px-2 h-6 rounded-full bg-[var(--m3-surface-container-high)]/60 border border-[var(--m3-outline-variant)]/30 text-[var(--m3-on-surface)]"
          title={`CPU Usage: ${cpuPercent}%`}
        >
          <span className="material-symbol text-[13px] text-[var(--m3-on-surface-variant)]">planner_review</span>
          <span
            className={`size-1.5 rounded-full ${
              cpuPercent > 80 ? "bg-[var(--m3-error)]" : cpuPercent > 50 ? "bg-amber-400" : "bg-emerald-400"
            }`}
          />
          <span className="m3-label-small font-mono text-[var(--m3-on-surface)]">{cpuPercent}%</span>
        </div>
      )}

      {typeof ramPercent === "number" && (
        <div
          className="flex items-center gap-1.5 px-2 h-6 rounded-full bg-[var(--m3-surface-container-high)]/60 border border-[var(--m3-outline-variant)]/30 text-[var(--m3-on-surface)]"
          title={`RAM Usage: ${ramPercent}%`}
        >
          <span className="material-symbol text-[13px] text-[var(--m3-on-surface-variant)]">memory</span>
          <span
            className={`size-1.5 rounded-full ${
              ramPercent > 85 ? "bg-[var(--m3-error)]" : ramPercent > 65 ? "bg-amber-400" : "bg-emerald-400"
            }`}
          />
          <span className="m3-label-small font-mono text-[var(--m3-on-surface)]">{ramPercent}%</span>
        </div>
      )}
    </div>
  );
}

