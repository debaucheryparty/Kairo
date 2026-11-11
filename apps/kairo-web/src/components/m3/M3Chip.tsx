"use client";

import React, { type ReactNode } from "react";

export type M3ChipProps = {
  children: ReactNode;
  selected?: boolean;
  onClick?: () => void;
  icon?: string;
  trailingIcon?: string;
  className?: string;
};

/**
 * Official Material 3 Chip Component
 * Directly renders @material/web md-filter-chip custom element.
 * Source: https://github.com/material-components/material-web/tree/main/chips
 */
export function M3Chip({
  children,
  selected = false,
  onClick,
  icon,
  trailingIcon,
  className = "",
}: M3ChipProps) {
  const label = typeof children === "string" ? children : undefined;

  return (
    <md-filter-chip
      label={label}
      selected={selected ? "" : undefined}
      class={className}
      onClick={onClick}
    >
      {icon && (
        <md-icon slot="icon">
          <span className="material-symbol">{icon}</span>
        </md-icon>
      )}
      {!label && children}
      {trailingIcon && (
        <md-icon slot="trailing-icon">
          <span className="material-symbol">{trailingIcon}</span>
        </md-icon>
      )}
    </md-filter-chip>
  );
}
