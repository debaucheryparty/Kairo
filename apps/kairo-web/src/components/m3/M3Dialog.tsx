"use client";

import React, { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { M3Button } from "./M3Button";

export type M3DialogProps = {
  open: boolean;
  onClose: () => void;
  icon?: string;
  headline: string;
  supportingText?: string;
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void;
  className?: string;
  scoped?: boolean; // When true (default), stays inside the app window instead of dimming the whole desktop!
};

/**
 * Official Material 3 Dialog Component
 *
 * Scoped mode (default) keeps the dialog contained inside the app window
 * (like native macOS/GNOME modal sheets), so the desktop remains visible and active.
 *
 * Source: https://github.com/material-components/material-web/tree/main/dialog
 */
export function M3Dialog({
  open,
  onClose,
  icon,
  headline,
  supportingText,
  children,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  className = "",
  scoped = true,
}: M3DialogProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) {
        onClose();
      }
    };
    if (open) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const dialogElement = (
    <div
      className={`${
        scoped ? "absolute inset-0" : "fixed inset-0"
      } z-[999] flex items-center justify-center p-4 select-none`}
    >
      {/* M3 Scrim: Dims only the app window when scoped */}
      <div
        className={`absolute inset-0 bg-black/60 backdrop-blur-[2px] transition-opacity duration-200 animate-in fade-in ${
          scoped ? "rounded-[inherit]" : ""
        }`}
        onClick={onClose}
      />

      {/* Official M3 Dialog Card (28dp corner radius, Surface Container High) */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="m3-dialog-headline"
        className={`relative z-10 w-full max-w-[390px] rounded-[28px] bg-[var(--md-sys-color-surface-container-high,#2b2a2a)] p-6 shadow-2xl border border-[var(--md-sys-color-outline-variant,#49464a)]/30 animate-in fade-in zoom-in-95 duration-200 font-google-sans text-[var(--md-sys-color-on-surface,#e6e1e1)] ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* M3 Icon slot */}
        {icon && (
          <div className="mb-4 flex size-10 items-center justify-center rounded-[12px] bg-[var(--md-sys-color-secondary-container,#4d4b4d)] text-[var(--md-sys-color-on-secondary-container,#ece6e9)]">
            <span className="material-symbol text-[24px]" data-fill="1">
              {icon}
            </span>
          </div>
        )}

        {/* M3 Headline Small */}
        <h2
          id="m3-dialog-headline"
          className="text-2xl font-normal leading-8 text-[var(--md-sys-color-on-surface,#e6e1e1)] mb-1.5"
        >
          {headline}
        </h2>

        {/* Supporting text */}
        {supportingText && (
          <p className="text-sm text-[var(--md-sys-color-on-surface-variant,#cac5c8)] leading-5 mb-5">
            {supportingText}
          </p>
        )}

        {/* Content */}
        <div className="mb-6">{children}</div>

        {/* M3 Action Buttons Footer */}
        <div className="flex items-center justify-end gap-3 pt-1">
          {cancelLabel && (
            <M3Button variant="text" onClick={onClose}>
              {cancelLabel}
            </M3Button>
          )}
          {confirmLabel && (
            <M3Button
              variant="filled"
              onClick={() => {
                onConfirm?.();
              }}
            >
              {confirmLabel}
            </M3Button>
          )}
        </div>
      </div>
    </div>
  );

  if (scoped || typeof document === "undefined") {
    return dialogElement;
  }

  return createPortal(dialogElement, document.body);
}
