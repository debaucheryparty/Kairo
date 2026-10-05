"use client";

import { useId, type ComponentType } from "react";
import type { DockAppId } from "@/src/data/apps";

export interface IconProps {
  className?: string;
}

export function FinderGlyph({ className }: IconProps) {
  const baseGrad = useId();
  const leftGrad = useId();
  const rightGrad = useId();
  const rimGrad = useId();
  const shadowFilter = useId();
  const clipId = useId();

  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <defs>
        <linearGradient id={baseGrad} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#62c2fd" />
          <stop offset="100%" stopColor="#1a7cf7" />
        </linearGradient>
        <linearGradient id={leftGrad} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#76d3ff" />
          <stop offset="100%" stopColor="#3094fa" />
        </linearGradient>
        <linearGradient id={rightGrad} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#1e84fa" />
          <stop offset="100%" stopColor="#0555c8" />
        </linearGradient>
        <linearGradient id={rimGrad} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0.1" />
        </linearGradient>
        <filter id={shadowFilter} x="-10%" y="-10%" width="120%" height="125%">
          <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#000000" floodOpacity="0.25" />
        </filter>
        <clipPath id={clipId}>
          <rect x="2" y="2" width="96" height="96" rx="22" />
        </clipPath>
      </defs>

      <rect
        x="2"
        y="2"
        width="96"
        height="96"
        rx="22"
        fill={`url(#${baseGrad})`}
        filter={`url(#${shadowFilter})`}
      />

      <g clipPath={`url(#${clipId})`}>
        <rect x="2" y="2" width="48" height="96" fill={`url(#${leftGrad})`} />
        <rect x="50" y="2" width="48" height="96" fill={`url(#${rightGrad})`} />

        <path
          d="M 50 14 V 54 C 50 62 44 67 36 67 H 32"
          fill="none"
          stroke="#0f172a"
          strokeWidth="3.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        <circle cx="34" cy="38" r="4.2" fill="#0f172a" />
        <circle cx="66" cy="38" r="4.2" fill="#0f172a" />
        <circle cx="35.2" cy="36.8" r="1.2" fill="#ffffff" />
        <circle cx="67.2" cy="36.8" r="1.2" fill="#ffffff" />

        <path
          d="M 28 66 C 36 78 64 78 72 66"
          fill="none"
          stroke="#0f172a"
          strokeWidth="3.8"
          strokeLinecap="round"
        />
      </g>

      <rect
        x="2.5"
        y="2.5"
        width="95"
        height="95"
        rx="21.5"
        fill="none"
        stroke={`url(#${rimGrad})`}
        strokeWidth="1.2"
      />
    </svg>
  );
}

export function LaunchpadGlyph({ className }: IconProps) {
  const bgGrad = useId();
  const rimGrad = useId();
  const shadowFilter = useId();

  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <defs>
        <linearGradient id={bgGrad} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2e3138" />
          <stop offset="100%" stopColor="#15171a" />
        </linearGradient>
        <linearGradient id={rimGrad} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0.08" />
        </linearGradient>
        <filter id={shadowFilter} x="-10%" y="-10%" width="120%" height="125%">
          <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#000000" floodOpacity="0.3" />
        </filter>
      </defs>

      <rect
        x="2"
        y="2"
        width="96"
        height="96"
        rx="22"
        fill={`url(#${bgGrad})`}
        filter={`url(#${shadowFilter})`}
      />
      <rect
        x="2.5"
        y="2.5"
        width="95"
        height="95"
        rx="21.5"
        fill="none"
        stroke={`url(#${rimGrad})`}
        strokeWidth="1.2"
      />

      <g transform="translate(18, 18)">
        <rect x="0" y="0" width="18" height="18" rx="4.5" fill="#ff3b30" />
        <rect x="23" y="0" width="18" height="18" rx="4.5" fill="#ff9500" />
        <rect x="46" y="0" width="18" height="18" rx="4.5" fill="#ffcc00" />

        <rect x="0" y="23" width="18" height="18" rx="4.5" fill="#34c759" />
        <rect x="23" y="23" width="18" height="18" rx="4.5" fill="#00c7be" />
        <rect x="46" y="23" width="18" height="18" rx="4.5" fill="#007aff" />

        <rect x="0" y="46" width="18" height="18" rx="4.5" fill="#5856d6" />
        <rect x="23" y="46" width="18" height="18" rx="4.5" fill="#af52de" />
        <rect x="46" y="46" width="18" height="18" rx="4.5" fill="#ff2d55" />
      </g>
    </svg>
  );
}

export function TerminalGlyph({ className }: IconProps) {
  const bgGrad = useId();
  const rimGrad = useId();
  const shadowFilter = useId();

  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <defs>
        <linearGradient id={bgGrad} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#252830" />
          <stop offset="100%" stopColor="#111317" />
        </linearGradient>
        <linearGradient id={rimGrad} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0.08" />
        </linearGradient>
        <filter id={shadowFilter} x="-10%" y="-10%" width="120%" height="125%">
          <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#000000" floodOpacity="0.3" />
        </filter>
      </defs>

      <rect
        x="2"
        y="2"
        width="96"
        height="96"
        rx="22"
        fill={`url(#${bgGrad})`}
        filter={`url(#${shadowFilter})`}
      />
      <rect
        x="2.5"
        y="2.5"
        width="95"
        height="95"
        rx="21.5"
        fill="none"
        stroke={`url(#${rimGrad})`}
        strokeWidth="1.2"
      />

      <line x1="6" y1="21" x2="94" y2="21" stroke="#ffffff" strokeOpacity="0.1" strokeWidth="1" />
      <circle cx="16" cy="14" r="2.5" fill="#ff5f56" />
      <circle cx="23" cy="14" r="2.5" fill="#ffbd2e" />
      <circle cx="30" cy="14" r="2.5" fill="#27c93f" />

      <path
        d="M 22 40 L 37 52 L 22 64"
        fill="none"
        stroke="#38bdf8"
        strokeWidth="4.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="45" y="58" width="18" height="4" rx="1.5" fill="#34d399" />
    </svg>
  );
}

export function EditorGlyph({ className }: IconProps) {
  const bgGrad = useId();
  const rimGrad = useId();
  const shadowFilter = useId();
  const clipId = useId();

  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <defs>
        <linearGradient id={bgGrad} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#e8ecf2" />
        </linearGradient>
        <linearGradient id={rimGrad} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.1" />
        </linearGradient>
        <filter id={shadowFilter} x="-10%" y="-10%" width="120%" height="125%">
          <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#000000" floodOpacity="0.22" />
        </filter>
        <clipPath id={clipId}>
          <rect x="2" y="2" width="96" height="96" rx="22" />
        </clipPath>
      </defs>

      <rect
        x="2"
        y="2"
        width="96"
        height="96"
        rx="22"
        fill={`url(#${bgGrad})`}
        filter={`url(#${shadowFilter})`}
      />

      <g clipPath={`url(#${clipId})`}>
        <rect x="2" y="2" width="96" height="15" fill="#f59e0b" />
        <rect x="2" y="15" width="96" height="2" fill="#d97706" />

        <line x1="18" y1="30" x2="82" y2="30" stroke="#cbd5e1" strokeWidth="2.5" strokeLinecap="round" />
        <line x1="18" y1="42" x2="82" y2="42" stroke="#cbd5e1" strokeWidth="2.5" strokeLinecap="round" />
        <line x1="18" y1="54" x2="68" y2="54" stroke="#cbd5e1" strokeWidth="2.5" strokeLinecap="round" />
        <line x1="18" y1="66" x2="76" y2="66" stroke="#cbd5e1" strokeWidth="2.5" strokeLinecap="round" />
        <line x1="18" y1="78" x2="52" y2="78" stroke="#cbd5e1" strokeWidth="2.5" strokeLinecap="round" />

        <g transform="rotate(-36 58 60)">
          <path
            d="M 54 26 L 62 26 L 62 70 L 58 84 L 54 70 Z"
            fill="#1e293b"
            stroke="#0f172a"
            strokeWidth="1"
          />
          <path d="M 54 70 L 58 84 L 62 70 Z" fill="#fbbf24" />
          <circle cx="58" cy="74" r="1.2" fill="#0f172a" />
          <rect x="53.5" y="32" width="9" height="3" fill="#fbbf24" />
        </g>
      </g>

      <rect
        x="2.5"
        y="2.5"
        width="95"
        height="95"
        rx="21.5"
        fill="none"
        stroke={`url(#${rimGrad})`}
        strokeWidth="1.2"
      />
    </svg>
  );
}

export function ActivityMonitorGlyph({ className }: IconProps) {
  const bgGrad = useId();
  const rimGrad = useId();
  const shadowFilter = useId();
  const glowFilter = useId();

  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <defs>
        <linearGradient id={bgGrad} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1e222b" />
          <stop offset="100%" stopColor="#0d0f13" />
        </linearGradient>
        <linearGradient id={rimGrad} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0.08" />
        </linearGradient>
        <filter id={shadowFilter} x="-10%" y="-10%" width="120%" height="125%">
          <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#000000" floodOpacity="0.3" />
        </filter>
        <filter id={glowFilter} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <rect
        x="2"
        y="2"
        width="96"
        height="96"
        rx="22"
        fill={`url(#${bgGrad})`}
        filter={`url(#${shadowFilter})`}
      />
      <rect
        x="2.5"
        y="2.5"
        width="95"
        height="95"
        rx="21.5"
        fill="none"
        stroke={`url(#${rimGrad})`}
        strokeWidth="1.2"
      />

      <circle cx="50" cy="50" r="32" fill="none" stroke="#334155" strokeWidth="1" strokeDasharray="2 3" opacity="0.4" />
      <circle cx="50" cy="50" r="18" fill="none" stroke="#334155" strokeWidth="1" strokeDasharray="2 3" opacity="0.3" />
      <line x1="50" y1="18" x2="50" y2="82" stroke="#334155" strokeWidth="1" opacity="0.3" />
      <line x1="18" y1="50" x2="82" y2="50" stroke="#334155" strokeWidth="1" opacity="0.3" />

      <path
        d="M 12 50 H 28 L 34 32 L 44 68 L 54 38 L 62 58 L 68 50 H 88"
        fill="none"
        stroke="#30d158"
        strokeWidth="3.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        filter={`url(#${glowFilter})`}
      />
    </svg>
  );
}

export function DatabasesGlyph({ className }: IconProps) {
  const bgGrad = useId();
  const rimGrad = useId();
  const shadowFilter = useId();

  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <defs>
        <linearGradient id={bgGrad} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#1d4ed8" />
        </linearGradient>
        <linearGradient id={rimGrad} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0.1" />
        </linearGradient>
        <filter id={shadowFilter} x="-10%" y="-10%" width="120%" height="125%">
          <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#000000" floodOpacity="0.25" />
        </filter>
      </defs>

      <rect
        x="2"
        y="2"
        width="96"
        height="96"
        rx="22"
        fill={`url(#${bgGrad})`}
        filter={`url(#${shadowFilter})`}
      />
      <rect
        x="2.5"
        y="2.5"
        width="95"
        height="95"
        rx="21.5"
        fill="none"
        stroke={`url(#${rimGrad})`}
        strokeWidth="1.2"
      />

      <g transform="translate(23, 20)">
        <path d="M 0 10 C 0 4.5 12 0 27 0 C 42 0 54 4.5 54 10 V 22 C 54 27.5 42 32 27 32 C 12 32 0 27.5 0 22 Z" fill="#ffffff" fillOpacity="0.2" />
        <ellipse cx="27" cy="10" rx="27" ry="10" fill="#ffffff" />
        <ellipse cx="27" cy="10" rx="23" ry="8" fill="#dbeafe" />

        <path d="M 0 24 C 0 29.5 12 34 27 34 C 42 34 54 29.5 54 24 V 36 C 54 41.5 42 46 27 46 C 12 46 0 41.5 0 36 Z" fill="#ffffff" />
        <path d="M 0 24 C 0 29.5 12 34 27 34 C 42 34 54 29.5 54 24" fill="none" stroke="#bfdbfe" strokeWidth="2" />

        <path d="M 0 38 C 0 43.5 12 48 27 48 C 42 48 54 43.5 54 38 V 50 C 54 55.5 42 60 27 60 C 12 60 0 55.5 0 50 Z" fill="#ffffff" />
        <path d="M 0 38 C 0 43.5 12 48 27 48 C 42 48 54 43.5 54 38" fill="none" stroke="#bfdbfe" strokeWidth="2" />

        <circle cx="10" cy="22" r="2.5" fill="#3b82f6" />
        <circle cx="10" cy="36" r="2.5" fill="#3b82f6" />
        <circle cx="10" cy="50" r="2.5" fill="#3b82f6" />
      </g>
    </svg>
  );
}

export function DomainsGlyph({ className }: IconProps) {
  const bgGrad = useId();
  const rimGrad = useId();
  const shadowFilter = useId();

  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <defs>
        <linearGradient id={bgGrad} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0ea5e9" />
          <stop offset="100%" stopColor="#0284c7" />
        </linearGradient>
        <linearGradient id={rimGrad} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0.1" />
        </linearGradient>
        <filter id={shadowFilter} x="-10%" y="-10%" width="120%" height="125%">
          <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#000000" floodOpacity="0.25" />
        </filter>
      </defs>

      <rect
        x="2"
        y="2"
        width="96"
        height="96"
        rx="22"
        fill={`url(#${bgGrad})`}
        filter={`url(#${shadowFilter})`}
      />
      <rect
        x="2.5"
        y="2.5"
        width="95"
        height="95"
        rx="21.5"
        fill="none"
        stroke={`url(#${rimGrad})`}
        strokeWidth="1.2"
      />

      <circle cx="50" cy="50" r="32" fill="#ffffff" fillOpacity="0.15" stroke="#ffffff" strokeWidth="2.5" strokeOpacity="0.8" />
      <ellipse cx="50" cy="50" rx="15" ry="32" fill="none" stroke="#ffffff" strokeWidth="1.5" strokeOpacity="0.5" />
      <line x1="18" y1="50" x2="82" y2="50" stroke="#ffffff" strokeWidth="1.5" strokeOpacity="0.5" />
      <line x1="24" y1="34" x2="76" y2="34" stroke="#ffffff" strokeWidth="1.2" strokeOpacity="0.4" />
      <line x1="24" y1="66" x2="76" y2="66" stroke="#ffffff" strokeWidth="1.2" strokeOpacity="0.4" />

      <g transform="rotate(45 50 50)">
        <polygon points="50,18 45,50 50,46" fill="#ef4444" />
        <polygon points="50,18 55,50 50,46" fill="#dc2626" />
        <polygon points="50,82 45,50 50,54" fill="#ffffff" />
        <polygon points="50,82 55,50 50,54" fill="#e2e8f0" />
        <circle cx="50" cy="50" r="4.5" fill="#facc15" stroke="#ca8a04" strokeWidth="1" />
      </g>
    </svg>
  );
}

export function SettingsGlyph({ className }: IconProps) {
  const bgGrad = useId();
  const rimGrad = useId();
  const gearGrad = useId();
  const shadowFilter = useId();

  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <defs>
        <linearGradient id={bgGrad} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f8fafc" />
          <stop offset="100%" stopColor="#cbd5e1" />
        </linearGradient>
        <linearGradient id={rimGrad} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.7" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.1" />
        </linearGradient>
        <linearGradient id={gearGrad} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#64748b" />
          <stop offset="100%" stopColor="#334155" />
        </linearGradient>
        <filter id={shadowFilter} x="-10%" y="-10%" width="120%" height="125%">
          <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#000000" floodOpacity="0.2" />
        </filter>
      </defs>

      <rect
        x="2"
        y="2"
        width="96"
        height="96"
        rx="22"
        fill={`url(#${bgGrad})`}
        filter={`url(#${shadowFilter})`}
      />
      <rect
        x="2.5"
        y="2.5"
        width="95"
        height="95"
        rx="21.5"
        fill="none"
        stroke={`url(#${rimGrad})`}
        strokeWidth="1.2"
      />

      <g transform="translate(50, 50)">
        <circle cx="0" cy="0" r="28" fill={`url(#${gearGrad})`} />
        {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((angle) => (
          <rect
            key={angle}
            x="-4.5"
            y="-34"
            width="9"
            height="9"
            rx="2"
            fill={`url(#${gearGrad})`}
            transform={`rotate(${angle})`}
          />
        ))}
        <circle cx="0" cy="0" r="14" fill="#f8fafc" stroke="#94a3b8" strokeWidth="1.5" />
        <circle cx="0" cy="0" r="8" fill="#475569" />
      </g>
    </svg>
  );
}

export function TrashGlyph({ className, hasItems = false }: IconProps & { hasItems?: boolean }) {
  const bgGrad = useId();
  const rimGrad = useId();
  const shadowFilter = useId();

  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <defs>
        <linearGradient id={bgGrad} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f8fafc" />
          <stop offset="100%" stopColor="#e2e8f0" />
        </linearGradient>
        <linearGradient id={rimGrad} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.7" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.1" />
        </linearGradient>
        <filter id={shadowFilter} x="-10%" y="-10%" width="120%" height="125%">
          <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#000000" floodOpacity="0.18" />
        </filter>
      </defs>

      <rect
        x="2"
        y="2"
        width="96"
        height="96"
        rx="22"
        fill={`url(#${bgGrad})`}
        filter={`url(#${shadowFilter})`}
      />
      <rect
        x="2.5"
        y="2.5"
        width="95"
        height="95"
        rx="21.5"
        fill="none"
        stroke={`url(#${rimGrad})`}
        strokeWidth="1.2"
      />

      <g transform="translate(24, 20)">
        {hasItems && (
          <g>
            <polygon points="12,14 18,3 28,7 24,15" fill="#ffffff" stroke="#94a3b8" strokeWidth="1" />
            <polygon points="26,14 34,4 42,9 38,15" fill="#f1f5f9" stroke="#94a3b8" strokeWidth="1" />
            <polygon points="18,16 26,8 34,16" fill="#e2e8f0" />
          </g>
        )}
        <rect x="2" y="10" width="48" height="6" rx="3" fill="#94a3b8" />
        <rect x="18" y="6" width="16" height="5" rx="2.5" fill="#64748b" />
        <path
          d="M 6 16 L 10 52 C 10.5 55 13 57 16 57 H 36 C 39 57 41.5 55 42 52 L 46 16 Z"
          fill="#cbd5e1"
          fillOpacity={hasItems ? "0.85" : "0.5"}
          stroke="#94a3b8"
          strokeWidth="1.5"
        />
        <line x1="18" y1="22" x2="19" y2="48" stroke="#64748b" strokeWidth="2.5" strokeLinecap="round" />
        <line x1="26" y1="22" x2="26" y2="48" stroke="#64748b" strokeWidth="2.5" strokeLinecap="round" />
        <line x1="34" y1="22" x2="33" y2="48" stroke="#64748b" strokeWidth="2.5" strokeLinecap="round" />
      </g>
    </svg>
  );
}

export function DashboardGlyph(props: IconProps) {
  return <ActivityMonitorGlyph {...props} />;
}

export function FilesGlyph(props: IconProps) {
  return <FinderGlyph {...props} />;
}

export function RemoteAppsGlyph({ className }: IconProps) {
  const bgGrad = useId();
  const rimGrad = useId();
  const shadowFilter = useId();
  const clipId = useId();

  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <defs>
        <linearGradient id={bgGrad} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4f46e5" />
          <stop offset="50%" stopColor="#3730a3" />
          <stop offset="100%" stopColor="#1e1b4b" />
        </linearGradient>
        <linearGradient id={rimGrad} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.25" />
        </linearGradient>
        <filter id={shadowFilter} x="-10%" y="-10%" width="120%" height="125%">
          <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#000000" floodOpacity="0.28" />
        </filter>
        <clipPath id={clipId}>
          <rect x="2" y="2" width="96" height="96" rx="22" />
        </clipPath>
      </defs>

      <rect
        x="2"
        y="2"
        width="96"
        height="96"
        rx="22"
        fill={`url(#${bgGrad})`}
        filter={`url(#${shadowFilter})`}
      />

      <g clipPath={`url(#${clipId})`}>
        <line x1="20" y1="2" x2="20" y2="98" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
        <line x1="50" y1="2" x2="50" y2="98" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
        <line x1="80" y1="2" x2="80" y2="98" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
        <line x1="2" y1="32" x2="98" y2="32" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
        <line x1="2" y1="50" x2="98" y2="50" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
        <line x1="2" y1="68" x2="98" y2="68" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />

        <rect x="18" y="18" width="28" height="26" rx="6" fill="#0284c7" />
        <rect x="18" y="18" width="28" height="7" rx="3" fill="#0369a1" />
        <circle cx="22" cy="21.5" r="1.2" fill="#f87171" />
        <circle cx="26" cy="21.5" r="1.2" fill="#fbbf24" />
        <circle cx="30" cy="21.5" r="1.2" fill="#34d399" />
        <rect x="22" y="28" width="20" height="3" rx="1.5" fill="#bae6fd" />
        <rect x="22" y="34" width="14" height="2.5" rx="1.2" fill="#7dd3fc" />

        <rect x="54" y="18" width="28" height="26" rx="6" fill="#0f172a" />
        <rect x="54" y="18" width="28" height="7" rx="3" fill="#1e293b" />
        <circle cx="58" cy="21.5" r="1.2" fill="#f87171" />
        <circle cx="62" cy="21.5" r="1.2" fill="#fbbf24" />
        <circle cx="66" cy="21.5" r="1.2" fill="#34d399" />
        <path d="M 59 29 L 63 32 L 59 35" stroke="#38bdf8" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        <line x1="66" y1="35" x2="74" y2="35" stroke="#34d399" strokeWidth="1.5" strokeLinecap="round" />

        <rect x="18" y="54" width="28" height="26" rx="6" fill="#7c3aed" />
        <rect x="18" y="54" width="28" height="7" rx="3" fill="#6d28d9" />
        <circle cx="22" cy="57.5" r="1.2" fill="#f87171" />
        <circle cx="26" cy="57.5" r="1.2" fill="#fbbf24" />
        <circle cx="30" cy="57.5" r="1.2" fill="#34d399" />
        <circle cx="27" cy="67" r="4" fill="#f43f5e" />
        <circle cx="37" cy="69" r="5" fill="#f59e0b" opacity="0.9" />

        <rect x="54" y="54" width="28" height="26" rx="6" fill="#059669" />
        <rect x="54" y="54" width="28" height="7" rx="3" fill="#047857" />
        <circle cx="58" cy="57.5" r="1.2" fill="#f87171" />
        <circle cx="62" cy="57.5" r="1.2" fill="#fbbf24" />
        <circle cx="66" cy="57.5" r="1.2" fill="#34d399" />
        <polygon points="65,64 65,72 73,68" fill="#ecfdf5" />

        <rect
          x="2"
          y="2"
          width="96"
          height="96"
          rx="22"
          fill="none"
          stroke={`url(#${rimGrad})`}
          strokeWidth="1.5"
        />
      </g>
    </svg>
  );
}

export const DOCK_GLYPHS: Record<
  DockAppId | "trash" | "finder" | "monitor" | "files" | "launchpad" | "editor" | "databases" | "domains",
  ComponentType<IconProps>
> = {
  dashboard: ActivityMonitorGlyph,
  monitor: ActivityMonitorGlyph,
  files: FinderGlyph,
  finder: FinderGlyph,
  terminal: TerminalGlyph,
  editor: EditorGlyph,
  databases: DatabasesGlyph,
  domains: DomainsGlyph,
  settings: SettingsGlyph,
  launchpad: LaunchpadGlyph,
  trash: TrashGlyph,
};
