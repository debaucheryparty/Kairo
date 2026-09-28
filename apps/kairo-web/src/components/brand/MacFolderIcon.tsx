"use client";

import { useId } from "react";

interface MacFolderIconProps {
  name?: string;
  className?: string;
}

export function MacFolderIcon({ name = "", className = "size-4" }: MacFolderIconProps) {
  const backGrad = useId();
  const frontGrad = useId();
  const rimGrad = useId();
  const shadowFilter = useId();

  const lower = name.toLowerCase().trim();

  let emblem: "downloads" | "movies" | "music" | "pictures" | "public" | "documents" | "desktop" | "code" | null = null;

  if (lower === "downloads" || lower === "download") {
    emblem = "downloads";
  } else if (lower === "movies" || lower === "videos" || lower === "video" || lower === "movie") {
    emblem = "movies";
  } else if (lower === "music" || lower === "audio" || lower === "songs") {
    emblem = "music";
  } else if (lower === "pictures" || lower === "images" || lower === "photos" || lower === "pics") {
    emblem = "pictures";
  } else if (lower === "public") {
    emblem = "public";
  } else if (lower === "documents" || lower === "docs") {
    emblem = "documents";
  } else if (lower === "desktop") {
    emblem = "desktop";
  } else if (lower === "developer" || lower === "code" || lower === "dev" || lower === "projects" || lower === "src") {
    emblem = "code";
  }

  return (
    <svg viewBox="0 0 100 84" className={className} aria-hidden>
      <defs>
        <linearGradient id={backGrad} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1e82e8" />
          <stop offset="100%" stopColor="#0b58bc" />
        </linearGradient>
        <linearGradient id={frontGrad} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#53c2fa" />
          <stop offset="45%" stopColor="#2593f2" />
          <stop offset="100%" stopColor="#0069dc" />
        </linearGradient>
        <linearGradient id={rimGrad} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0.1" />
        </linearGradient>
        <filter id={shadowFilter} x="-10%" y="-10%" width="120%" height="130%">
          <feDropShadow dx="0" dy="2.5" stdDeviation="2.5" floodColor="#000000" floodOpacity="0.25" />
        </filter>
      </defs>

      <path
        d="M 6 12 C 6 6 10 3 16 3 H 38 C 42 3 45 6 47 10 L 51 16 H 88 C 93 16 96 19 96 25 V 68 C 96 74 92 78 86 78 H 14 C 8 78 4 74 4 68 Z"
        fill={`url(#${backGrad})`}
      />

      <rect x="10" y="10" width="80" height="20" rx="3" fill="#ffffff" fillOpacity="0.25" />

      <path
        d="M 4 24 C 4 18 7 15 13 15 H 87 C 93 15 96 18 96 24 V 71 C 96 77 92 81 86 81 H 14 C 8 81 4 77 4 71 Z"
        fill={`url(#${frontGrad})`}
        filter={`url(#${shadowFilter})`}
      />

      <path
        d="M 5 24 C 5 19 8 16 13 16 H 87 C 92 16 95 19 95 24"
        fill="none"
        stroke={`url(#${rimGrad})`}
        strokeWidth="1.2"
        strokeLinecap="round"
      />

      {emblem === "downloads" && (
        <g transform="translate(50, 48)">
          <circle cx="0" cy="0" r="16" fill="none" stroke="#ffffff" strokeWidth="2.4" opacity="0.4" />
          <path d="M 0 -8 V 6 M -5 1 L 0 6 L 5 1" fill="none" stroke="#ffffff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" opacity="0.45" />
        </g>
      )}

      {emblem === "movies" && (
        <g transform="translate(34, 34)" opacity="0.45">
          <rect x="0" y="0" width="32" height="26" rx="3" fill="none" stroke="#ffffff" strokeWidth="2.2" />
          <line x1="0" y1="6" x2="32" y2="6" stroke="#ffffff" strokeWidth="1.8" />
          <line x1="0" y1="20" x2="32" y2="20" stroke="#ffffff" strokeWidth="1.8" />
          <line x1="8" y1="0" x2="8" y2="6" stroke="#ffffff" strokeWidth="1.8" />
          <line x1="16" y1="0" x2="16" y2="6" stroke="#ffffff" strokeWidth="1.8" />
          <line x1="24" y1="0" x2="24" y2="6" stroke="#ffffff" strokeWidth="1.8" />
          <line x1="8" y1="20" x2="8" y2="26" stroke="#ffffff" strokeWidth="1.8" />
          <line x1="16" y1="20" x2="16" y2="26" stroke="#ffffff" strokeWidth="1.8" />
          <line x1="24" y1="20" x2="24" y2="26" stroke="#ffffff" strokeWidth="1.8" />
        </g>
      )}

      {emblem === "music" && (
        <g transform="translate(50, 48)" opacity="0.45">
          <path
            d="M -5 6 C -5 4 -7 2 -10 2 C -13 2 -15 4 -15 6 C -15 8 -13 10 -10 10 C -7 10 -5 8 -5 6 V -10 L 10 -14 V 2 C 10 0 8 -2 5 -2 C 2 -2 0 0 0 2 C 0 4 2 6 5 6 C 8 6 10 4 10 2 V -8 L -5 -4 Z"
            fill="#ffffff"
          />
        </g>
      )}

      {emblem === "pictures" && (
        <g transform="translate(34, 34)" opacity="0.45">
          <rect x="0" y="0" width="32" height="26" rx="3" fill="none" stroke="#ffffff" strokeWidth="2.2" />
          <circle cx="9" cy="8" r="3" fill="#ffffff" />
          <path d="M 3 22 L 13 11 L 22 20 L 25 17 L 29 22 Z" fill="#ffffff" />
        </g>
      )}

      {emblem === "public" && (
        <g transform="translate(50, 48)" opacity="0.45">
          <rect x="-14" y="-14" width="28" height="28" rx="4" fill="none" stroke="#ffffff" strokeWidth="2.2" transform="rotate(45)" />
          <circle cx="0" cy="-6" r="2.5" fill="#ffffff" />
          <path d="M 0 -2 V 5 L 3 10 M 0 5 L -3 10 M -4 0 L 0 -1 L 4 0" fill="none" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}

      {emblem === "documents" && (
        <g transform="translate(36, 33)" opacity="0.45">
          <path d="M 2 0 H 20 L 26 6 V 26 H 2 Z" fill="none" stroke="#ffffff" strokeWidth="2.2" strokeLinejoin="round" />
          <path d="M 20 0 V 6 H 26" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinejoin="round" />
          <line x1="7" y1="12" x2="21" y2="12" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
          <line x1="7" y1="17" x2="21" y2="17" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
          <line x1="7" y1="21" x2="16" y2="21" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
        </g>
      )}

      {emblem === "desktop" && (
        <g transform="translate(34, 34)" opacity="0.45">
          <rect x="0" y="0" width="32" height="20" rx="2.5" fill="none" stroke="#ffffff" strokeWidth="2.2" />
          <path d="M 12 25 H 20 M 16 20 V 25" fill="none" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" />
        </g>
      )}

      {emblem === "code" && (
        <g transform="translate(50, 48)" opacity="0.45">
          <path d="M -8 -6 L -14 0 L -8 6" fill="none" stroke="#ffffff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M 8 -6 L 14 0 L 8 6" fill="none" stroke="#ffffff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          <line x1="3" y1="-8" x2="-3" y2="8" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" />
        </g>
      )}
    </svg>
  );
}
