"use client";

import { useId, type ComponentType } from "react";
import type { DockAppId } from "@/src/data/apps";

type IconProps = { className?: string };

function useGid(prefix: string) {
  return `${prefix}${useId().replace(/:/g, "")}`;
}

export function DashboardGlyph({ className }: IconProps) {
  const fill = useGid("dashboard");
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <defs>
        <linearGradient id={fill} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7ec8ff" />
          <stop offset="100%" stopColor="#1e7dff" />
        </linearGradient>
      </defs>
      <rect width="100" height="100" rx="22" fill={`url(#${fill})`} />
      <rect x="18" y="18" width="28" height="28" rx="7" fill="#fff" />
      <rect x="54" y="18" width="28" height="28" rx="7" fill="#fff" />
      <rect x="18" y="54" width="28" height="28" rx="7" fill="#fff" />
      <rect x="54" y="54" width="28" height="28" rx="7" fill="#fff" />
    </svg>
  );
}

export function FilesGlyph({ className }: IconProps) {
  const tab = useGid("folder-tab");
  const body = useGid("folder-body");
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <defs>
        <linearGradient id={tab} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8fdfff" />
          <stop offset="100%" stopColor="#4bb8f0" />
        </linearGradient>
        <linearGradient id={body} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#5ec8f5" />
          <stop offset="100%" stopColor="#1f8fd4" />
        </linearGradient>
      </defs>
      <rect width="100" height="100" rx="22" fill="#e8f7ff" />
      <path fill={`url(#${tab})`} d="M18 32c0-4.4 3.6-8 8-8h18l8 8h22c4.4 0 8 3.6 8 8v6H18V32z" />
      <rect x="14" y="38" width="72" height="46" rx="10" fill={`url(#${body})`} />
    </svg>
  );
}

export function TerminalGlyph({ className }: IconProps) {
  const fill = useGid("terminal");
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <defs>
        <linearGradient id={fill} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#3a3a3a" />
          <stop offset="100%" stopColor="#111" />
        </linearGradient>
      </defs>
      <rect width="100" height="100" rx="22" fill={`url(#${fill})`} />
      <path
        d="M24 32l22 18-22 18"
        fill="none"
        stroke="#fff"
        strokeWidth="8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M52 68h24" fill="none" stroke="#fff" strokeWidth="8" strokeLinecap="round" />
    </svg>
  );
}

export function EditorGlyph({ className }: IconProps) {
  const fill = useGid("editor");
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <defs>
        <linearGradient id={fill} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#3ec6ff" />
          <stop offset="55%" stopColor="#0078d4" />
          <stop offset="100%" stopColor="#005a9e" />
        </linearGradient>
      </defs>
      <rect width="100" height="100" rx="22" fill={`url(#${fill})`} />
      <path d="M22 50L42 28v13L31 50l11 9v13L22 50z" fill="#fff" />
      <path d="M78 50L58 28v13l11 9-11 9v13L78 50z" fill="#fff" />
    </svg>
  );
}


export function DomainsGlyph({ className }: IconProps) {
  const fill = useGid("domains");
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <defs>
        <linearGradient id={fill} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7dd3fc" />
          <stop offset="100%" stopColor="#0284c7" />
        </linearGradient>
      </defs>
      <rect width="100" height="100" rx="22" fill={`url(#${fill})`} />
      <circle cx="50" cy="50" r="28" fill="none" stroke="#fff" strokeWidth="5" />
      <ellipse cx="50" cy="50" rx="12" ry="28" fill="none" stroke="#fff" strokeWidth="5" />
      <path
        d="M22 50h56M26 38h48M26 62h48"
        fill="none"
        stroke="#fff"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function DatabasesGlyph({ className }: IconProps) {
  const fill = useGid("db");
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <defs>
        <linearGradient id={fill} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#93c5fd" />
          <stop offset="100%" stopColor="#2563eb" />
        </linearGradient>
      </defs>
      <rect width="100" height="100" rx="22" fill={`url(#${fill})`} />
      <ellipse cx="50" cy="30" rx="24" ry="10" fill="#fff" />
      <path fill="#fff" d="M26 30v28c0 6 10.7 10 24 10s24-4 24-10V30H26z" />
      <ellipse cx="50" cy="58" rx="24" ry="10" fill="#dbeafe" />
      <ellipse cx="50" cy="44" rx="24" ry="10" fill="none" stroke="#fff" strokeWidth="4" />
    </svg>
  );
}

export function SettingsGlyph({ className }: IconProps) {
  const fill = useGid("settings");
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <defs>
        <linearGradient id={fill} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e5e7eb" />
          <stop offset="100%" stopColor="#9ca3af" />
        </linearGradient>
      </defs>
      <rect width="100" height="100" rx="22" fill={`url(#${fill})`} />
      <path
        fill="#4b5563"
        d="M50 22l6.2 4.2 7.2-2.2 3.4 6.6 7.4.8.8 7.4 6.6 3.4-2.2 7.2L83 50l-4.2 6.2 2.2 7.2-6.6 3.4-.8 7.4-7.4.8-3.4 6.6-7.2-2.2L50 78l-6.2 4.2-7.2 2.2-3.4-6.6-7.4-.8-.8-7.4-6.6-3.4 2.2-7.2L17 50l4.2-6.2-2.2-7.2 6.6-3.4.8-7.4 7.4-.8 3.4-6.6 7.2 2.2L50 22z"
      />
      <circle cx="50" cy="50" r="12" fill="#e5e7eb" />
      <circle cx="50" cy="50" r="7" fill="#6b7280" />
    </svg>
  );
}

export function TrashGlyph({ className }: IconProps) {
  const fill = useGid("trash");
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <defs>
        <linearGradient id={fill} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff" />
          <stop offset="100%" stopColor="#d1d5db" />
        </linearGradient>
      </defs>
      <rect width="100" height="100" rx="22" fill="#f3f4f6" />
      <rect x="22" y="18" width="56" height="10" rx="5" fill="#fff" />
      <rect x="40" y="12" width="20" height="10" rx="4" fill="#e5e7eb" />
      <path fill={`url(#${fill})`} d="M26 32h48l-4 50H30L26 32z" />
      <path fill="#9ca3af" opacity=".35" d="M40 40h4v34h-4zm16 0h4v34h-4z" />
    </svg>
  );
}

export function LaunchpadGlyph({ className }: IconProps) {
  const bg = useGid("launchpad-bg");
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <defs>
        <linearGradient id={bg} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#2c2d30" />
          <stop offset="100%" stopColor="#1a1a1c" />
        </linearGradient>
      </defs>
      <rect width="100" height="100" rx="22" fill={`url(#${bg})`} />
      <rect x="18" y="18" width="18" height="18" rx="5" fill="#ff5f57" />
      <rect x="41" y="18" width="18" height="18" rx="5" fill="#ffbd2e" />
      <rect x="64" y="18" width="18" height="18" rx="5" fill="#28c840" />
      <rect x="18" y="41" width="18" height="18" rx="5" fill="#007aff" />
      <rect x="41" y="41" width="18" height="18" rx="5" fill="#af52de" />
      <rect x="64" y="41" width="18" height="18" rx="5" fill="#ff2d55" />
      <rect x="18" y="64" width="18" height="18" rx="5" fill="#5856d6" />
      <rect x="41" y="64" width="18" height="18" rx="5" fill="#30b0c7" />
      <rect x="64" y="64" width="18" height="18" rx="5" fill="#34c759" />
    </svg>
  );
}

export function FinderGlyph({ className }: IconProps) {
  const bg = useGid("finder-bg");
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <defs>
        <linearGradient id={bg} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#76d0ff" />
          <stop offset="100%" stopColor="#1f7fe8" />
        </linearGradient>
      </defs>
      <rect width="100" height="100" rx="22" fill={`url(#${bg})`} />
      <path
        d="M20 20 H50 V80 H20 Z"
        fill="#aee5ff"
        opacity="0.8"
      />
      <circle cx="35" cy="40" r="4.5" fill="#1d1d1f" />
      <circle cx="65" cy="40" r="4.5" fill="#1d1d1f" />
      <path
        d="M50 34 v24 c0 4 -4 7 -8 7 h-4"
        fill="none"
        stroke="#1d1d1f"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M30 63 c6 9 34 9 40 0"
        fill="none"
        stroke="#1d1d1f"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ActivityMonitorGlyph({ className }: IconProps) {
  const bg = useGid("monitor-bg");
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <defs>
        <linearGradient id={bg} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#252528" />
          <stop offset="100%" stopColor="#121214" />
        </linearGradient>
      </defs>
      <rect width="100" height="100" rx="22" fill={`url(#${bg})`} />
      <path
        d="M14 50 h18 l6 -20 l12 40 l10 -30 l8 16 l6 -6 h12"
        fill="none"
        stroke="#30d158"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M14 50 h18 l6 -20 l12 40 l10 -30 l8 16 l6 -6 h12"
        fill="none"
        stroke="#64d2ff"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export const DOCK_GLYPHS: Record<DockAppId | "trash" | "launchpad" | "finder" | "monitor", ComponentType<IconProps>> = {
  dashboard: ActivityMonitorGlyph,
  monitor: ActivityMonitorGlyph,
  files: FinderGlyph,
  finder: FinderGlyph,
  terminal: TerminalGlyph,
  editor: EditorGlyph,
  domains: DomainsGlyph,
  databases: DatabasesGlyph,
  settings: SettingsGlyph,
  trash: TrashGlyph,
  launchpad: LaunchpadGlyph,
};
