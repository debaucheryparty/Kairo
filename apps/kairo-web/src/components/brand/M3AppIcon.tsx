"use client";

import React from "react";

export interface M3AppIconProps {
  id?: string;
  icon?: string;
  name?: string;
  className?: string;
  size?: number;
  interactive?: boolean;
}

interface M3AppIconConfig {
  symbol: string;
}

const M3_APP_CONFIGS: Record<string, M3AppIconConfig> = {
  files: { symbol: "folder" },
  finder: { symbol: "folder" },
  terminal: { symbol: "terminal" },
  bash: { symbol: "terminal" },
  sh: { symbol: "terminal" },
  zsh: { symbol: "terminal" },
  browser: { symbol: "travel_explore" },
  chrome: { symbol: "travel_explore" },
  safari: { symbol: "travel_explore" },
  dashboard: { symbol: "speed" },
  monitor: { symbol: "monitoring" },
  activity: { symbol: "monitoring" },
  settings: { symbol: "settings" },
  preferences: { symbol: "settings" },
  trash: { symbol: "delete" },
  editor: { symbol: "edit_note" },
  textedit: { symbol: "edit_note" },
  code: { symbol: "code" },
  vscode: { symbol: "code" },
  docker: { symbol: "deployed_code" },
  apps: { symbol: "apps" },
  launchpad: { symbol: "apps" },
  applications: { symbol: "apps" },
  domains: { symbol: "travel_explore" },
  databases: { symbol: "database" },
};

function getIconConfig(icon?: string, name?: string): M3AppIconConfig {
  const key = (icon || name || "").toLowerCase();
  for (const [k, c] of Object.entries(M3_APP_CONFIGS)) {
    if (key.includes(k)) return c;
  }
  return { symbol: "apps" };
}

/**
 * Official Material 3 App Icon Component
 *
 * Implements pure Material 3 flat container principles:
 * - Completely flat (NO drop shadows, purely tonal surface hierarchy)
 * - Shape Scale: Medium-Large baseline (14dp radius square tile)
 * - Shape-Morphing: Dynamic morph from 14dp to 20dp on hover, 10dp on press
 * - Material Surface Container High elevation role
 * - Google Material Symbols Rounded
 *
 * References:
 * - https://material-web.dev/theming/shape/
 * - https://m3.material.io/styles/shape/shape-morph
 * - https://m3.material.io/styles/shape/corner-radius-scale
 * - https://m3.material.io/styles/elevation/overview
 */
export function M3AppIcon({
  id,
  icon,
  name,
  className = "size-11",
  interactive = true,
}: M3AppIconProps) {
  const config = getIconConfig(id || icon, name);

  return (
    <div
      className={`group relative flex items-center justify-center select-none overflow-hidden
        rounded-[14px] bg-[var(--md-sys-color-surface-container-high)]
        transition-all duration-300 ease-[cubic-bezier(0.2,0,0,1)]
        ${interactive ? "hover:rounded-[20px] hover:bg-[var(--md-sys-color-surface-container-highest)] active:rounded-[10px] active:scale-95" : ""}
        ${className}`}
      title={name}
    >
      {/* M3 State layer */}
      <div className="m3-state-layer pointer-events-none" />

      {/* Google Material Symbol */}
      <span
        className="material-symbol text-[24px] relative z-[1] select-none text-[var(--md-sys-color-primary)] transition-transform duration-200 group-hover:scale-105"
        data-fill="1"
        aria-hidden="true"
      >
        {config.symbol}
      </span>
    </div>
  );
}
