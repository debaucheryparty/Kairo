"use client";

import {
  ChevronDown,
  ChevronRight,
  File as FileIcon,
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileText,
  FileVideo,
} from "lucide-react";
import { useState, type MouseEvent } from "react";
import { MacFolderIcon } from "@/src/components/brand/MacFolderIcon";
import { getFileType, getFileKindLabel } from "@/src/lib/files/file-type";
import { formatModified, formatSize } from "@/src/lib/files/format";
import type { FileEntry } from "@/src/lib/api/files";

type SortField = "name" | "modified" | "size" | "kind";
type SortOrder = "asc" | "desc";

export function FileList({
  path,
  entries,
  selected,
  onSelect,
  onOpen,
  onParent,
  onContextMenu,
  expandedPaths,
  onToggleExpand,
}: {
  path: string;
  entries: FileEntry[];
  selected: string | null;
  onSelect: (path: string) => void;
  onOpen: (entry: FileEntry) => void;
  onParent: () => void;
  onContextMenu: (event: MouseEvent, entry: FileEntry | null) => void;
  expandedPaths?: Set<string>;
  onToggleExpand?: (path: string) => void;
}) {
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  }

  const sortedEntries = [...entries].sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === "dir" ? -1 : 1;
    }
    let cmp = 0;
    if (sortField === "name") {
      cmp = a.name.localeCompare(b.name);
    } else if (sortField === "modified") {
      cmp = new Date(a.modified).getTime() - new Date(b.modified).getTime();
    } else if (sortField === "size") {
      cmp = a.size - b.size;
    } else if (sortField === "kind") {
      cmp = getFileKindLabel(a.name, a.type).localeCompare(getFileKindLabel(b.name, b.type));
    }
    return sortOrder === "asc" ? cmp : -cmp;
  });

  return (
    <div
      className="min-h-0 flex-1 overflow-y-auto select-none"
      onContextMenu={(event) => {
        if (event.target === event.currentTarget) {
          onContextMenu(event, null);
        }
      }}
    >
      <div className="w-full min-w-[540px]">
        <div className="sticky top-0 z-10 grid grid-cols-12 gap-2 border-b border-black/[0.08] dark:border-white/[0.08] bg-[#f2f2f4] dark:bg-[#202024] px-4 py-1.5 text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
          <button
            type="button"
            onClick={() => handleSort("name")}
            className="col-span-5 flex items-center gap-1 text-left outline-none hover:text-neutral-800 dark:hover:text-white"
          >
            <span>Name</span>
            {sortField === "name" && (
              <ChevronDown className={`size-3 transition-transform ${sortOrder === "desc" ? "rotate-180" : ""}`} />
            )}
          </button>
          <button
            type="button"
            onClick={() => handleSort("modified")}
            className="col-span-3 flex items-center gap-1 text-left outline-none hover:text-neutral-800 dark:hover:text-white"
          >
            <span>Date Modified</span>
            {sortField === "modified" && (
              <ChevronDown className={`size-3 transition-transform ${sortOrder === "desc" ? "rotate-180" : ""}`} />
            )}
          </button>
          <button
            type="button"
            onClick={() => handleSort("size")}
            className="col-span-2 flex items-center gap-1 text-left outline-none hover:text-neutral-800 dark:hover:text-white"
          >
            <span>Size</span>
            {sortField === "size" && (
              <ChevronDown className={`size-3 transition-transform ${sortOrder === "desc" ? "rotate-180" : ""}`} />
            )}
          </button>
          <button
            type="button"
            onClick={() => handleSort("kind")}
            className="col-span-2 flex items-center gap-1 text-left outline-none hover:text-neutral-800 dark:hover:text-white"
          >
            <span>Kind</span>
            {sortField === "kind" && (
              <ChevronDown className={`size-3 transition-transform ${sortOrder === "desc" ? "rotate-180" : ""}`} />
            )}
          </button>
        </div>

        <div className="p-1 space-y-0.5">
          {path !== "/" && (
            <div
              className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-[12px] text-neutral-600 dark:text-neutral-300 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] cursor-pointer"
              onDoubleClick={onParent}
              onClick={onParent}
            >
              <MacFolderIcon name=".." className="size-4.5 shrink-0" />
              <span>..</span>
            </div>
          )}

          {sortedEntries.map((entry) => {
            const isSelected = selected === entry.path;
            const isDir = entry.type === "dir";
            const isExpanded = Boolean(expandedPaths?.has(entry.path));

            return (
              <div
                key={entry.path}
                onClick={() => onSelect(entry.path)}
                onDoubleClick={(e) => {
                  e.preventDefault();
                  onOpen(entry);
                }}
                onContextMenu={(event) => onContextMenu(event, entry)}
                className={`grid grid-cols-12 gap-2 items-center rounded-[8px] px-3 py-1.5 text-[12px] cursor-default transition-colors ${
                  isSelected
                    ? "bg-[#007aff] text-white shadow-sm font-medium"
                    : "text-neutral-800 dark:text-neutral-200 hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                }`}
              >
                <div className="col-span-5 flex items-center gap-1.5 min-w-0">
                  {isDir ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onToggleExpand) onToggleExpand(entry.path);
                        else onOpen(entry);
                      }}
                      className="rounded p-0.5 hover:bg-black/10 dark:hover:bg-white/10"
                    >
                      {isExpanded ? (
                        <ChevronDown className={`size-3.5 ${isSelected ? "text-white" : "opacity-60"}`} />
                      ) : (
                        <ChevronRight className={`size-3.5 ${isSelected ? "text-white" : "opacity-60"}`} />
                      )}
                    </button>
                  ) : (
                    <span className="w-4 shrink-0" />
                  )}
                  <EntryIcon entry={entry} isSelected={isSelected} />
                  <span className="truncate">{entry.name}</span>
                </div>

                <div
                  className={`col-span-3 truncate text-[11px] ${
                    isSelected ? "text-white/90" : "opacity-60"
                  }`}
                >
                  {formatModified(entry.modified)}
                </div>

                <div
                  className={`col-span-2 truncate text-[11px] ${
                    isSelected ? "text-white/90" : "opacity-60"
                  }`}
                >
                  {isDir ? "—" : formatSize(entry.size)}
                </div>

                <div
                  className={`col-span-2 truncate text-[11px] ${
                    isSelected ? "text-white/90" : "opacity-60"
                  }`}
                >
                  {getFileKindLabel(entry.name, entry.type)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function EntryIcon({ entry, isSelected }: { entry: FileEntry; isSelected: boolean }) {
  if (entry.type === "dir") {
    return <MacFolderIcon name={entry.name} className="size-4.5 shrink-0" />;
  }

  const kind = getFileType({ name: entry.name, mime: entry.mime });
  const className = `size-4 shrink-0 ${isSelected ? "text-white" : "text-neutral-500 dark:text-neutral-400"}`;

  switch (kind) {
    case "image":
      return <FileImage aria-hidden className={className} />;
    case "video":
      return <FileVideo aria-hidden className={className} />;
    case "audio":
      return <FileAudio aria-hidden className={className} />;
    case "pdf":
    case "text":
      return <FileText aria-hidden className={className} />;
    case "code":
      return <FileCode aria-hidden className={className} />;
    case "archive":
      return <FileArchive aria-hidden className={className} />;
    default:
      return <FileIcon aria-hidden className={className} />;
  }
}
