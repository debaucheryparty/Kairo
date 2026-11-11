"use client";

import React, { useRef, useEffect } from "react";

export interface M3CheckboxProps {
  checked?: boolean;
  indeterminate?: boolean;
  disabled?: boolean;
  onChange?: (checked: boolean) => void;
  className?: string;
  "aria-label"?: string;
}

/**
 * Official Material 3 Checkbox
 * Powered by @material/web md-checkbox custom element.
 * Source: https://github.com/material-components/material-web/tree/main/checkbox
 */
export function M3Checkbox({
  checked = false,
  indeterminate = false,
  disabled = false,
  onChange,
  className = "",
  "aria-label": ariaLabel,
}: M3CheckboxProps) {
  const ref = useRef<any>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.checked = checked;
      ref.current.indeterminate = indeterminate;
    }
  }, [checked, indeterminate]);

  return (
    <md-checkbox
      ref={ref}
      checked={checked ? "" : undefined}
      indeterminate={indeterminate ? "" : undefined}
      disabled={disabled ? "" : undefined}
      aria-label={ariaLabel}
      class={className}
      onChange={(e: any) => onChange?.(e.target.checked)}
    />
  );
}
