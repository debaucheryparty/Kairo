"use client";

import React from "react";

export interface M3DividerProps {
  inset?: boolean;
  insetStart?: boolean;
  insetEnd?: boolean;
  className?: string;
}

/**
 * Official Material 3 Divider
 * Wraps @material/web md-divider custom element with CSS token fallback.
 * Source: https://github.com/material-components/material-web/tree/main/divider
 */
export function M3Divider({
  inset = false,
  insetStart = false,
  insetEnd = false,
  className = "",
}: M3DividerProps) {
  return (
    <md-divider
      inset={inset ? "" : undefined}
      inset-start={insetStart ? "" : undefined}
      inset-end={insetEnd ? "" : undefined}
      class={`block w-full border-t border-[var(--md-sys-color-outline-variant)]/40 ${className}`}
    />
  );
}
