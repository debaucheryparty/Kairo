"use client";

import type { ReactNode } from "react";
import { M3Button } from "@/src/components/m3/M3Button";

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

/**
 * Official Material 3 Dialog Component
 * Source: https://m3.material.io/components/dialogs/specs
 * - Shape: Extra Large (28dp radius)
 * - Container: surfaceContainerHigh
 * - Buttons: M3 Filled/Tonal/Text
 */
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
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 backdrop-blur-[4px] select-none animate-fade-in"
      onClick={onCancel}
    >
      <div
        className="w-[320px] rounded-[28px] p-6 shadow-[0_24px_60px_rgba(0,0,0,0.55)] border border-white/10 bg-[#2b2930] text-[#e6e0e9] animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-3">
          <span className="material-symbol text-[24px] text-[#cfbcff]">
            {confirmDestructive ? "warning" : "info"}
          </span>
          <h3 className="text-base font-bold tracking-tight text-white">
            {title}
          </h3>
        </div>

        <p className="text-xs text-white/70 mb-5 leading-relaxed">
          {message}
        </p>

        {children}

        {layout === "stacked" ? (
          <div className="flex flex-col gap-2.5">
            {onConfirm && (
              <M3Button
                variant="filled"
                onClick={onConfirm}
                className={confirmDestructive ? "!bg-rose-500 hover:!bg-rose-600 !text-white" : ""}
              >
                {confirmLabel}
              </M3Button>
            )}
            <M3Button
              variant="tonal"
              onClick={onCancel}
            >
              {cancelLabel}
            </M3Button>
          </div>
        ) : (
          <div className="flex items-center justify-end gap-2.5 pt-2">
            <M3Button
              variant="text"
              onClick={onCancel}
            >
              {cancelLabel}
            </M3Button>
            {onConfirm && (
              <M3Button
                variant="filled"
                onClick={onConfirm}
                className={confirmDestructive ? "!bg-rose-500 hover:!bg-rose-600 !text-white" : ""}
              >
                {confirmLabel}
              </M3Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

