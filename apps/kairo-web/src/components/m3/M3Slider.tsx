"use client";

import React, { useRef, useEffect } from "react";

export type M3SliderProps = {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  labeled?: boolean;
  ticks?: boolean;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
  icon?: string;
};

/**
 * Official Material 3 Slider Component
 * Directly renders @material/web md-slider custom element with official pin and halo.
 * Source: https://github.com/material-components/material-web/tree/main/slider
 */
export function M3Slider({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  labeled = true,
  ticks = false,
  disabled = false,
  className = "",
  "aria-label": ariaLabel = "Slider",
  icon,
}: M3SliderProps) {
  const ref = useRef<any>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.value = value;
    }
  }, [value]);

  return (
    <div className={`flex items-center gap-3 w-full ${className}`}>
      {icon && (
        <span className="material-symbol text-[20px] text-[var(--md-sys-color-on-surface-variant)] shrink-0">
          {icon}
        </span>
      )}
      <md-slider
        ref={ref}
        value={value}
        min={min}
        max={max}
        step={step}
        labeled={labeled ? "" : undefined}
        ticks={ticks ? "" : undefined}
        disabled={disabled ? "" : undefined}
        aria-label={ariaLabel}
        class="w-full flex-1"
        onInput={(e: any) => onChange(Number(e.target.value))}
        onChange={(e: any) => onChange(Number(e.target.value))}
      />
    </div>
  );
}
