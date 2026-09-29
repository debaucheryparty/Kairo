"use client";

import { File as FileIcon } from "lucide-react";
import { downloadUrl } from "@/src/lib/api/files";
import { useSelectedServer } from "@/src/lib/session";
import { formatModified, formatSize } from "@/src/lib/files/format";
import { viewerButtonClass, type ViewerFile } from "@/src/components/apps/files/viewers/viewer-ui";

export function UnsupportedViewer({
  file,
  kind,
  onClose,
}: {
  file: ViewerFile;
  kind: string;
  onClose: () => void;
}) {
  const serverId = useSelectedServer()?.id || "";
  const label =
    kind === "archive"
      ? "Archive"
      : kind === "document"
        ? "Document"
        : kind === "folder"
          ? "Folder"
          : "Unknown file";

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 bg-white dark:bg-[#161619] text-neutral-900 dark:text-neutral-100 px-8 text-center select-none">
      <div className="size-16 rounded-full bg-black/[0.04] dark:bg-white/[0.06] flex items-center justify-center mb-1">
        <FileIcon aria-hidden className="size-8 text-neutral-400 dark:text-neutral-500" />
      </div>
      <p className="max-w-full truncate text-[15px] font-semibold text-neutral-800 dark:text-neutral-200">{file.name}</p>
      <p className="text-[12px] text-neutral-500 dark:text-neutral-400">
        {kind === "folder" ? "Folder information" : "Preview unavailable"}
      </p>
      <dl className="text-[12px] text-neutral-500 dark:text-neutral-400 space-y-0.5">
        <div>Type: {label}</div>
        {kind === "folder" ? null : <div>Size: {formatSize(file.size)}</div>}
        {file.modified ? <div>Modified: {formatModified(file.modified)}</div> : null}
        <div className="mt-1 font-mono text-[11px] break-all opacity-70">{file.path}</div>
      </dl>
      <div className="mt-3 flex items-center gap-2">
        {kind === "folder" ? null : (
          <a
            href={downloadUrl(serverId, file.path)}
            className="rounded-lg border border-black/10 dark:border-white/10 bg-white/80 dark:bg-white/10 px-3 py-1.5 text-[12px] font-medium text-neutral-800 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-white/15 transition-colors shadow-sm"
          >
            Download
          </a>
        )}
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-black/10 dark:border-white/10 bg-white/80 dark:bg-white/10 px-3 py-1.5 text-[12px] font-medium text-neutral-800 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-white/15 transition-colors shadow-sm"
        >
          Close
        </button>
      </div>
    </div>
  );
}
