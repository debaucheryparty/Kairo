"use client";

import React from "react";

export interface MacFolderIconProps {
  name?: string;
  type?: "downloads" | "movies" | "music" | "pictures" | "public" | "documents" | "desktop" | "code" | "root" | "home" | "trash";
  className?: string;
}

/**
 * Material 3 Unified Folder & Directory Icon
 * Uses official Material Symbols Rounded and inherits clean M3 tonal/monochrome color
 * from the parent component or theme (text-current), avoiding noisy multi-color icons.
 */
export function MacFolderIcon({ name = "", type, className = "size-4.5" }: MacFolderIconProps) {
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
    } else if (lower === "root" || lower === "/") {
      emblem = "root";
    } else if (lower === "home" || lower === "~") {
      emblem = "home";
    } else if (lower === "trash" || lower === ".trash") {
      emblem = "trash";
    }
  }

  let iconName = "folder";

  switch (emblem) {
    case "desktop":
      iconName = "desktop_windows";
      break;
    case "documents":
      iconName = "description";
      break;
    case "downloads":
      iconName = "download";
      break;
    case "movies":
      iconName = "movie";
      break;
    case "music":
      iconName = "music_note";
      break;
    case "pictures":
      iconName = "image";
      break;
    case "public":
      iconName = "folder_shared";
      break;
    case "code":
      iconName = "code";
      break;
    case "root":
      iconName = "storage";
      break;
    case "home":
      iconName = "home";
      break;
    case "trash":
      iconName = "delete";
      break;
    default:
      iconName = "folder";
      break;
  }

  return (
    <span
      className={`material-symbol shrink-0 inline-flex items-center justify-center select-none text-current opacity-90 ${className}`}
      data-fill="1"
      aria-hidden="true"
    >
      {iconName}
    </span>
  );
}

// Export M3FolderIcon alias for modern components
export const M3FolderIcon = MacFolderIcon;
