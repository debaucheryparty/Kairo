"use client";

import React, { useRef, useEffect } from "react";

export type M3SwitchProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  icon?: boolean;
  id?: string;
  className?: string;
  "aria-label"?: string;
};

/**
 * Official Material 3 Switch Component
 * Directly renders @material/web md-switch custom element with full M3 track & handle animations.
 * Source: https://github.com/material-components/material-web/tree/main/switch
 */
export function M3Switch({
  checked,
  onChange,
  disabled = false,
  icon = true,
  id,
  className = "",
  "aria-label": ariaLabel,
}: M3SwitchProps) {
  const ref = useRef<any>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.selected = checked;
    }
  }, [checked]);

  return (
    <md-switch
      ref={ref}
      id={id}
      selected={checked ? "" : undefined}
      disabled={disabled ? "" : undefined}
      show-only-selected-icon={icon ? "" : undefined}
      icons={icon ? "" : undefined}
      aria-label={ariaLabel}
      class={className}
      onChange={(e: any) => onChange(e.target.selected)}
    />
  );
}
