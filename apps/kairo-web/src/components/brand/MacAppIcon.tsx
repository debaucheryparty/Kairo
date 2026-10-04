"use client";

import { useId, type ComponentType } from "react";
import {
  ActivityMonitorGlyph,
  DatabasesGlyph,
  DomainsGlyph,
  EditorGlyph,
  FinderGlyph,
  LaunchpadGlyph,
  RemoteAppsGlyph,
  SettingsGlyph,
  TerminalGlyph,
  TrashGlyph,
  type IconProps,
} from "@/src/components/desktop/dock-icons";
import {
  Code,
  Terminal,
  Cpu,
  Layers,
  Globe,
  Database,
  FileCode,
  Server,
  Package,
  Activity,
  Box,
  Compass,
} from "lucide-react";

interface MacAppIconProps {
  icon?: string;
  name?: string;
  className?: string;
}

const BUILTIN_ICONS: Record<string, ComponentType<IconProps>> = {
  finder: FinderGlyph,
  files: FinderGlyph,
  terminal: TerminalGlyph,
  bash: TerminalGlyph,
  sh: TerminalGlyph,
  zsh: TerminalGlyph,
  launchpad: LaunchpadGlyph,
  "remote-apps": RemoteAppsGlyph,
  apps: RemoteAppsGlyph,
  applications: RemoteAppsGlyph,
  editor: EditorGlyph,
  textedit: EditorGlyph,
  code: EditorGlyph,
  vscode: EditorGlyph,
  "com.microsoft.vscode": EditorGlyph,
  dashboard: ActivityMonitorGlyph,
  monitor: ActivityMonitorGlyph,
  activity: ActivityMonitorGlyph,
  databases: DatabasesGlyph,
  database: DatabasesGlyph,
  db: DatabasesGlyph,
  domains: DomainsGlyph,
  safari: DomainsGlyph,
  network: DomainsGlyph,
  settings: SettingsGlyph,
  preferences: SettingsGlyph,
  trash: TrashGlyph,
};

interface Palette {
  gradient: [string, string];
  symbolColor: string;
}

const BRAND_PALETTES: Record<string, Palette> = {
  docker: { gradient: ["#0284c7", "#0369a1"], symbolColor: "#ffffff" },
  python: { gradient: ["#1e3a8a", "#0284c7"], symbolColor: "#facc15" },
  node: { gradient: ["#15803d", "#166534"], symbolColor: "#86efac" },
  git: { gradient: ["#ea580c", "#c2410c"], symbolColor: "#ffffff" },
  nginx: { gradient: ["#047857", "#064e3b"], symbolColor: "#a7f3d0" },
  redis: { gradient: ["#dc2626", "#991b1b"], symbolColor: "#ffffff" },
  postgres: { gradient: ["#0284c7", "#1d4ed8"], symbolColor: "#ffffff" },
  mysql: { gradient: ["#0369a1", "#0f172a"], symbolColor: "#f59e0b" },
  htop: { gradient: ["#0f172a", "#1e293b"], symbolColor: "#22c55e" },
  top: { gradient: ["#0f172a", "#1e293b"], symbolColor: "#38bdf8" },
  curl: { gradient: ["#0891b2", "#0e7490"], symbolColor: "#ffffff" },
  system: { gradient: ["#475569", "#334155"], symbolColor: "#f8fafc" },
};

function getPalette(key: string): Palette {
  const lower = key.toLowerCase();
  for (const [k, p] of Object.entries(BRAND_PALETTES)) {
    if (lower.includes(k)) return p;
  }
  let hash = 0;
  for (let i = 0; i < lower.length; i++) {
    hash = (hash << 5) - hash + lower.charCodeAt(i);
    hash |= 0;
  }
  const hue1 = Math.abs(hash) % 360;
  const hue2 = (hue1 + 25) % 360;
  return {
    gradient: [`hsl(${hue1}, 75%, 52%)`, `hsl(${hue2}, 85%, 40%)`],
    symbolColor: "#ffffff",
  };
}

function getAppSymbol(key: string): ComponentType<{ className?: string; style?: React.CSSProperties }> {
  const lower = key.toLowerCase();
  if (lower.includes("code") || lower.includes("vim") || lower.includes("nano")) return FileCode;
  if (lower.includes("docker") || lower.includes("container")) return Box;
  if (lower.includes("db") || lower.includes("sql") || lower.includes("mongo") || lower.includes("redis")) return Database;
  if (lower.includes("net") || lower.includes("web") || lower.includes("http") || lower.includes("browser")) return Globe;
  if (lower.includes("cpu") || lower.includes("proc") || lower.includes("sys")) return Cpu;
  if (lower.includes("mon") || lower.includes("top") || lower.includes("stat")) return Activity;
  if (lower.includes("pkg") || lower.includes("apt") || lower.includes("npm")) return Package;
  if (lower.includes("serv") || lower.includes("daemon")) return Server;
  if (lower.includes("sh") || lower.includes("bash") || lower.includes("cli")) return Terminal;
  return Layers;
}

export function MacAppIcon({ icon = "", name = "", className = "size-full" }: MacAppIconProps) {
  const gradId = useId();
  const rimId = useId();
  const lookupKey = (icon || name).toLowerCase();

  if (lookupKey in BUILTIN_ICONS) {
    const Glyph = BUILTIN_ICONS[lookupKey];
    return <Glyph className={className} />;
  }

  for (const [k, Glyph] of Object.entries(BUILTIN_ICONS)) {
    if (lookupKey.includes(k)) {
      return <Glyph className={className} />;
    }
  }

  const palette = getPalette(lookupKey);
  const SymbolIcon = getAppSymbol(lookupKey);

  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={palette.gradient[0]} />
          <stop offset="100%" stopColor={palette.gradient[1]} />
        </linearGradient>
        <linearGradient id={rimId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0.08" />
        </linearGradient>
        <filter id={`${gradId}-shadow`} x="-10%" y="-10%" width="120%" height="125%">
          <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#000000" floodOpacity="0.25" />
        </filter>
      </defs>

      <rect
        x="2"
        y="2"
        width="96"
        height="96"
        rx="22"
        fill={`url(#${gradId})`}
        filter={`url(#${gradId}-shadow)`}
      />
      <rect
        x="2.5"
        y="2.5"
        width="95"
        height="95"
        rx="21.5"
        fill="none"
        stroke={`url(#${rimId})`}
        strokeWidth="1.2"
      />

      <foreignObject x="22" y="22" width="56" height="56">
        <div className="flex size-full items-center justify-center">
          <SymbolIcon className="size-9 drop-shadow-[0_2px_4px_rgba(0,0,0,0.35)]" style={{ color: palette.symbolColor }} />
        </div>
      </foreignObject>
    </svg>
  );
}
