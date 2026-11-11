"use client";

import React, { type ReactNode } from "react";

export type M3ButtonVariant = "filled" | "tonal" | "elevated" | "outlined" | "text";

export type M3ButtonProps = {
  children?: ReactNode;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  variant?: M3ButtonVariant;
  icon?: string;
  trailingIcon?: string;
  disabled?: boolean;
  className?: string;
  type?: "button" | "submit" | "reset";
  title?: string;
};

/**
 * Official Material 3 Button Component
 * Sources:
 * - https://material-web.dev/components/button/
 * - https://m3.material.io/components/buttons/specs
 * Features:
 * - 40dp height, 20dp pill shape
 * - M3 state layers (8% hover, 12% pressed)
 * - M3 animated focus ring
 * - Robust label padding & shrink protection (never squished)
 */
export function M3Button({
  children,
  onClick,
  variant = "filled",
  icon,
  trailingIcon,
  disabled = false,
  className = "",
  type = "button",
  title,
}: M3ButtonProps) {
  const baseClasses =
    "m3-state-layer m3-focus-ring relative inline-flex items-center justify-center gap-2 h-10 px-5 min-w-[72px] rounded-full text-sm font-semibold tracking-wide transition-all duration-200 outline-none select-none font-google-sans shrink-0";

  const variantClasses: Record<M3ButtonVariant, string> = {
    filled:
      "bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] shadow-[var(--md-sys-elevation-level1)] hover:shadow-[var(--md-sys-elevation-level2)] active:scale-[0.98]",
    tonal:
      "bg-[var(--md-sys-color-secondary-container)] text-[var(--md-sys-color-on-secondary-container)] hover:shadow-[var(--md-sys-elevation-level1)] active:scale-[0.98]",
    elevated:
      "bg-[var(--md-sys-color-surface-container-low)] text-[var(--md-sys-color-primary)] shadow-[var(--md-sys-elevation-level1)] hover:shadow-[var(--md-sys-elevation-level2)] border border-[var(--md-sys-color-outline-variant)]/20 active:scale-[0.98]",
    outlined:
      "bg-transparent text-[var(--md-sys-color-primary)] border border-[var(--md-sys-color-outline)]/40 hover:border-[var(--md-sys-color-outline)] active:scale-[0.98]",
    text:
      "bg-transparent text-[var(--md-sys-color-primary)] hover:bg-[var(--md-sys-color-primary)]/8 px-4 active:scale-[0.98]",
  };

  const disabledClass = disabled
    ? "opacity-38 cursor-not-allowed pointer-events-none"
    : "cursor-pointer";

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`${baseClasses} ${variantClasses[variant]} ${disabledClass} ${className}`}
    >
      {icon && <span className="material-symbol text-[18px]">{icon}</span>}
      <span className="whitespace-nowrap px-0.5">{children}</span>
      {trailingIcon && <span className="material-symbol text-[18px]">{trailingIcon}</span>}
    </button>
  );
}

export type M3IconButtonVariant = "standard" | "filled" | "tonal" | "outlined";

export type M3IconButtonProps = {
  icon: string;
  selectedIcon?: string;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  variant?: M3IconButtonVariant;
  disabled?: boolean;
  className?: string;
  title?: string;
  selected?: boolean;
  toggle?: boolean;
};

/**
 * Official Material 3 Icon Button Component
 *
 * Implements specifications from:
 * - https://material-web.dev/components/icon-button/
 * - https://m3.material.io/components/icon-buttons/specs
 *
 * Variants:
 * - standard: Borderless, transparent container
 * - filled: Solid high-emphasis container
 * - tonal: Secondary container background
 * - outlined: Transparent with 1px outline border
 *
 * Supports toggle behavior with `selected` and `selectedIcon`.
 */
export function M3IconButton({
  icon,
  selectedIcon,
  onClick,
  variant = "standard",
  disabled = false,
  className = "",
  title,
  selected = false,
  toggle = false,
}: M3IconButtonProps) {
  const baseClasses =
    "m3-state-layer m3-focus-ring relative inline-flex items-center justify-center size-10 rounded-full transition-all duration-150 outline-none select-none shrink-0";

  const variantClasses: Record<M3IconButtonVariant, string> = {
    standard: selected
      ? "text-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-primary-container)]/30"
      : "text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-on-surface)]/8",
    filled: selected
      ? "bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)]"
      : "bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-primary)] hover:bg-[var(--md-sys-color-surface-container-highest)]/80",
    tonal: selected
      ? "bg-[var(--md-sys-color-secondary-container)] text-[var(--md-sys-color-on-secondary-container)]"
      : "bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container-highest)]",
    outlined: selected
      ? "bg-[var(--md-sys-color-inverse-surface)] text-[var(--md-sys-color-inverse-on-surface)] border-transparent"
      : "border border-[var(--md-sys-color-outline)] text-[var(--md-sys-color-on-surface-variant)] hover:border-[var(--md-sys-color-outline)] hover:bg-[var(--md-sys-color-on-surface)]/8 hover:text-[var(--md-sys-color-on-surface)]",
  };

  const disabledClass = disabled
    ? "opacity-38 cursor-not-allowed pointer-events-none"
    : "cursor-pointer active:scale-[0.95]";

  const currentIcon = (selected || toggle) && selected && selectedIcon ? selectedIcon : icon;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-pressed={toggle ? selected : undefined}
      className={`${baseClasses} ${variantClasses[variant]} ${disabledClass} ${className}`}
    >
      <span className="material-symbol text-[20px]" data-fill={selected ? "1" : "0"}>
        {currentIcon}
      </span>
    </button>
  );
}
