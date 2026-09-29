"use client";

import { useId } from "react";

interface MacFolderIconProps {
  name?: string;
  type?: "downloads" | "movies" | "music" | "pictures" | "public" | "documents" | "desktop" | "code";
  className?: string;
}

export function MacFolderIcon({ name = "", type, className = "size-4" }: MacFolderIconProps) {
  const backGrad = useId();
  const frontGrad = useId();
  const rimGrad = useId();
  const shadowFilter = useId();

  const clean = (name || "").replace(/\/+$/, "").split("/").pop() || "";
  const lower = clean.toLowerCase().trim();

  let emblem = type || null;

  if (!emblem) {
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
    } else if (lower === "documents" || lower === "docs" || lower === "document") {
      emblem = "documents";
    } else if (lower === "desktop") {
      emblem = "desktop";
    } else if (lower === "code" || lower === "developer" || lower === "dev" || lower === "projects" || lower === "src") {
      emblem = "code";
    }
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
        <g opacity="0.85">
          <circle cx="50" cy="50" r="14.5" fill="none" stroke="#ffffff" strokeWidth="2.8" />
          <path d="M 50 41 V 58 M 44 52 L 50 58 L 56 52" fill="none" stroke="#ffffff" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}

      {emblem === "movies" && (
        <g opacity="0.85">
          <rect x="34" y="38" width="32" height="24" rx="3" fill="none" stroke="#ffffff" strokeWidth="2.6" />
          <line x1="34" y1="44" x2="66" y2="44" stroke="#ffffff" strokeWidth="2" />
          <line x1="34" y1="56" x2="66" y2="56" stroke="#ffffff" strokeWidth="2" />
          <line x1="42" y1="38" x2="42" y2="44" stroke="#ffffff" strokeWidth="2" />
          <line x1="50" y1="38" x2="50" y2="44" stroke="#ffffff" strokeWidth="2" />
          <line x1="58" y1="38" x2="58" y2="44" stroke="#ffffff" strokeWidth="2" />
          <line x1="42" y1="56" x2="42" y2="62" stroke="#ffffff" strokeWidth="2" />
          <line x1="50" y1="56" x2="50" y2="62" stroke="#ffffff" strokeWidth="2" />
          <line x1="58" y1="56" x2="58" y2="62" stroke="#ffffff" strokeWidth="2" />
        </g>
      )}

      {emblem === "music" && (
        <g opacity="0.85">
          <ellipse cx="42" cy="57" rx="5" ry="3.8" transform="rotate(-25 42 57)" fill="#ffffff" />
          <ellipse cx="56" cy="53" rx="5" ry="3.8" transform="rotate(-25 56 53)" fill="#ffffff" />
          <line x1="46" y1="56" x2="46" y2="39" stroke="#ffffff" strokeWidth="2.6" />
          <line x1="60" y1="52" x2="60" y2="35" stroke="#ffffff" strokeWidth="2.6" />
          <path d="M 45 42 L 61 38 V 43 L 45 47 Z" fill="#ffffff" />
        </g>
      )}

      {emblem === "pictures" && (
        <g opacity="0.85">
          <rect x="34" y="38" width="32" height="24" rx="3.5" fill="none" stroke="#ffffff" strokeWidth="2.6" />
          <circle cx="43" cy="45" r="3" fill="#ffffff" />
          <path d="M 36 58 L 46 48 L 53 55 L 56 52 L 62 58 Z" fill="#ffffff" />
        </g>
      )}

      {emblem === "public" && (
        <g opacity="0.85">
          <rect x="37" y="37" width="26" height="26" rx="4" fill="none" stroke="#ffffff" strokeWidth="2.6" transform="rotate(45 50 50)" />
          <circle cx="50" cy="43" r="2.8" fill="#ffffff" />
          <path d="M 50 46 V 53 L 46 60 M 50 53 L 54 60 M 46 49 L 54 51" fill="none" stroke="#ffffff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}

      {emblem === "documents" && (
        <g opacity="0.85">
          <path d="M 38 36 H 54 L 62 44 V 64 H 38 Z" fill="none" stroke="#ffffff" strokeWidth="2.6" strokeLinejoin="round" />
          <path d="M 54 36 V 44 H 62" fill="none" stroke="#ffffff" strokeWidth="2.4" strokeLinejoin="round" />
          <line x1="43" y1="49" x2="57" y2="49" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" />
          <line x1="43" y1="54" x2="57" y2="54" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" />
          <line x1="43" y1="59" x2="52" y2="59" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" />
        </g>
      )}

      {emblem === "desktop" && (
        <g opacity="0.85">
          <rect x="34" y="37" width="32" height="21" rx="2.5" fill="none" stroke="#ffffff" strokeWidth="2.6" />
          <path d="M 46 58 V 63 M 42 63 H 58" fill="none" stroke="#ffffff" strokeWidth="2.6" strokeLinecap="round" />
        </g>
      )}

      {emblem === "code" && (
        <g opacity="0.85">
          <path d="M 43 43 L 37 49 L 43 55" fill="none" stroke="#ffffff" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M 57 43 L 63 49 L 57 55" fill="none" stroke="#ffffff" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
          <line x1="52" y1="41" x2="48" y2="57" stroke="#ffffff" strokeWidth="2.4" strokeLinecap="round" />
        </g>
      )}
    </svg>
  );
}
