"use client";

import React, { type ReactNode } from "react";

export type M3CardVariant = "elevated" | "filled" | "outlined";

export type M3CardProps = {
  children: ReactNode;
  variant?: M3CardVariant;
  className?: string;
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
};

/**
 * Official Material 3 Card Component
 * Sources:
 * - https://m3.material.io/components/cards/specs
 * - Shape: 16dp radius
 * - Surface container mappings
 */
export function M3Card({
  children,
  variant = "filled",
  className = "",
  onClick,
}: M3CardProps) {
  const baseClasses =
    "rounded-[16px] p-4 transition-all duration-200 overflow-hidden font-google-sans";

  const variantClasses: Record<M3CardVariant, string> = {
    elevated:
      "bg-[var(--md-sys-color-surface-container-low)] text-[var(--md-sys-color-on-surface)] shadow-[var(--md-sys-elevation-level1)] hover:shadow-[var(--md-sys-elevation-level2)] border border-[var(--md-sys-color-outline-variant)]/20",
    filled:
      "bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-on-surface)] border border-[var(--md-sys-color-outline-variant)]/30",
    outlined:
      "bg-[var(--md-sys-color-surface)] text-[var(--md-sys-color-on-surface)] border border-[var(--md-sys-color-outline-variant)] hover:border-[var(--md-sys-color-outline)]",
  };

  const interactiveClasses = onClick
    ? "m3-state-layer m3-focus-ring cursor-pointer active:scale-[0.99]"
    : "";

  return (
    <div
      onClick={onClick}
      className={`${baseClasses} ${variantClasses[variant]} ${interactiveClasses} ${className}`}
    >
      {children}
    </div>
  );
}
