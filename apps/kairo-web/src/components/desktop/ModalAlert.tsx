"use client";

import type { ReactNode } from "react";

type ModalAlertProps = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  confirmDestructive?: boolean;
  cancelLabel?: string;
  onConfirm?: () => void;
  onCancel: () => void;
  layout?: "stacked" | "side-by-side";
  children?: ReactNode;
};

export function ModalAlert({
  open,
  title,
  message,
  confirmLabel = "OK",
  confirmDestructive = false,
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  layout = "stacked",
  children,
}: ModalAlertProps) {
  if (!open) return null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/25 backdrop-blur-[3px] select-none animate-fade-in"
      onClick={onCancel}
    >
      <div
        className="w-[280px] rounded-[20px] p-5 shadow-[0_24px_60px_rgba(0,0,0,0.35)] backdrop-blur-3xl border border-black/10 dark:border-white/15 bg-white/90 dark:bg-[#242428]/92 text-neutral-900 dark:text-neutral-100 animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-center text-[13px] font-semibold tracking-tight mb-1.5">
          {title}
        </h3>
        <p className="text-center text-[11px] opacity-70 mb-4 leading-relaxed">
          {message}
        </p>

        {children}

        {layout === "stacked" ? (
          <div className="flex flex-col gap-2">
            {onConfirm && (
              <button
                type="button"
                onClick={onConfirm}
                className={`w-full rounded-full py-1.5 text-[12px] font-medium transition-colors shadow-sm outline-none ${
                  confirmDestructive
                    ? "bg-rose-500/15 hover:bg-rose-500/25 text-rose-500 dark:text-rose-400"
                    : "bg-[#007aff] hover:bg-[#0071eb] text-white"
                }`}
              >
                {confirmLabel}
              </button>
            )}
            <button
              type="button"
              onClick={onCancel}
              className="w-full rounded-full bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/15 py-1.5 text-[12px] font-medium text-neutral-800 dark:text-neutral-200 transition-colors outline-none"
            >
              {cancelLabel}
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 rounded-full bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/15 py-1.5 text-[12px] font-medium text-neutral-800 dark:text-neutral-200 transition-colors outline-none"
            >
              {cancelLabel}
            </button>
            {onConfirm && (
              <button
                type="button"
                onClick={onConfirm}
                className={`flex-1 rounded-full py-1.5 text-[12px] font-medium transition-colors shadow-sm outline-none ${
                  confirmDestructive
                    ? "bg-rose-500/15 hover:bg-rose-500/25 text-rose-500 dark:text-rose-400"
                    : "bg-[#007aff] hover:bg-[#0071eb] text-white"
                }`}
              >
                {confirmLabel}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
