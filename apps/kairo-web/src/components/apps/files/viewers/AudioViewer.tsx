"use client";

import { useState } from "react";
import { mediaUrl } from "@/src/lib/api/files";
import { useSelectedServer } from "@/src/lib/session";
import { ViewerMessage, type ViewerFile } from "@/src/components/apps/files/viewers/viewer-ui";

export function AudioViewer({ file, onClose }: { file: ViewerFile; onClose: () => void }) {
  const [error, setError] = useState(false);
  const src = mediaUrl(useSelectedServer()?.id || "", file.path);

  if (error) {
    return (
      <div className="flex h-full w-full flex-col bg-white dark:bg-[#161619] text-neutral-900 dark:text-neutral-100 select-none">
        <header className="flex h-11 shrink-0 items-center justify-between border-b border-black/[0.08] dark:border-white/[0.08] px-4 bg-[#fafafa] dark:bg-[#1f1f23]">
          <span className="text-[13px] font-medium truncate">{file.name}</span>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-2.5 py-1 text-[12px] text-neutral-600 dark:text-neutral-300 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          >
            Close
          </button>
        </header>

        <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
          <ViewerMessage
            tone="danger"
            title="Unable to play audio"
            detail="This audio file could not be decoded or loaded."
            onRetry={() => setError(false)}
            onClose={onClose}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col bg-white dark:bg-[#161619] text-neutral-900 dark:text-neutral-100 select-none">
      <header className="flex h-11 shrink-0 items-center justify-between border-b border-black/[0.08] dark:border-white/[0.08] px-4 bg-[#fafafa] dark:bg-[#1f1f23]">
        <span className="text-[13px] font-medium truncate max-w-[260px]">{file.name}</span>
        <button
          type="button"
          onClick={onClose}
          className="rounded px-2.5 py-1 text-[12px] text-neutral-600 dark:text-neutral-300 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
        >
          Close
        </button>
      </header>
      <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
        <div className="size-20 rounded-full bg-black/[0.04] dark:bg-white/[0.06] flex items-center justify-center text-3xl text-neutral-500 dark:text-neutral-400">
          ♪
        </div>
        <p className="max-w-md truncate text-[14px] font-medium text-neutral-800 dark:text-neutral-200">{file.name}</p>
        <audio
          className="w-full max-w-md"
          src={src}
          controls
          preload="metadata"
          onError={() => setError(true)}
        />
      </div>
    </div>
  );
}
