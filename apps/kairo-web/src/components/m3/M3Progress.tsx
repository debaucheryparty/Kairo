"use client";

import React from "react";

export interface M3ProgressProps {
  variant?: "circular" | "linear";
  value?: number;
  indeterminate?: boolean;
  className?: string;
}

/**
 * Official Material 3 Progress Indicators
 * Powered by @material/web md-circular-progress and md-linear-progress.
 * Source: https://github.com/material-components/material-web/tree/main/progress
 */
export function M3Progress({
  variant = "circular",
  value,
  indeterminate = true,
  className = "",
}: M3ProgressProps) {
  if (variant === "linear") {
    return (
      <md-linear-progress
        value={value}
        indeterminate={indeterminate ? "" : undefined}
        class={`w-full ${className}`}
      />
    );
  }

  return (
    <md-circular-progress
      value={value}
      indeterminate={indeterminate ? "" : undefined}
      class={className}
    />
  );
}
