"use client";

import React, { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";

export interface M3TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size" | "prefix"> {
  label?: string;
  supportingText?: string;
  errorText?: string;
  error?: boolean;
  variant?: "outlined" | "filled";
  leadingIcon?: string | ReactNode;
  trailingIcon?: string | ReactNode;
  clearable?: boolean;
  onClear?: () => void;
  className?: string;
}

/**
 * Official Material 3 Text Field Component
 * Sources:
 * - https://material-web.dev/components/text-field/
 * - https://m3.material.io/components/text-fields/specs
 *
 * Features:
 * - 12dp corner radius (Surface Container)
 * - M3 primary active outline border
 * - Supporting text & error states
 * - Fully responsive width & robust event handling
 */
export const M3TextField = forwardRef<HTMLInputElement, M3TextFieldProps>(function M3TextField(
  {
    label,
    supportingText,
    errorText,
    error = false,
    leadingIcon,
    trailingIcon,
    clearable = false,
    onClear,
    value,
    defaultValue,
    onChange,
    onKeyDown,
    onFocus,
    onBlur,
    disabled = false,
    className = "",
    type = "text",
    id,
    placeholder,
    autoFocus,
  },
  ref
) {
  return (
    <div className={`relative flex flex-col gap-1.5 w-full font-google-sans ${className}`}>
      {label && (
        <label
          htmlFor={id}
          className="text-xs font-semibold text-[var(--md-sys-color-on-surface-variant,#cac5c8)] px-0.5 tracking-wide"
        >
          {label}
        </label>
      )}
      <div
        className={`relative flex items-center w-full rounded-[12px] bg-[var(--md-sys-color-surface-container,#201f20)] border transition-all ${
          error || Boolean(errorText)
            ? "border-[var(--md-sys-color-error,#ffb4ab)] ring-1 ring-[var(--md-sys-color-error,#ffb4ab)]"
            : "border-[var(--md-sys-color-outline-variant,#49464a)]/70 focus-within:border-2 focus-within:border-[var(--md-sys-color-primary,#cfbcff)]"
        }`}
      >
        {leadingIcon && (
          <span className="material-symbol text-[20px] text-[var(--md-sys-color-on-surface-variant)] ml-3 shrink-0 select-none">
            {leadingIcon}
          </span>
        )}
        <input
          ref={ref}
          id={id}
          type={type}
          value={value}
          defaultValue={defaultValue}
          placeholder={placeholder}
          disabled={disabled}
          autoFocus={autoFocus}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onFocus={onFocus}
          onBlur={onBlur}
          className="w-full bg-transparent px-3.5 py-2.5 text-sm text-[var(--md-sys-color-on-surface,#e6e1e1)] placeholder:text-[var(--md-sys-color-on-surface-variant)]/40 outline-none selection:bg-[var(--md-sys-color-primary)]/30"
        />
        {clearable && Boolean(value) && (
          <button
            type="button"
            onClick={onClear}
            className="mr-2.5 size-6 rounded-full flex items-center justify-center text-[var(--md-sys-color-on-surface-variant)] hover:bg-white/10 transition-colors"
          >
            <span className="material-symbol text-[16px]">close</span>
          </button>
        )}
        {trailingIcon && (
          <span className="material-symbol text-[20px] text-[var(--md-sys-color-on-surface-variant)] mr-3 shrink-0 select-none">
            {trailingIcon}
          </span>
        )}
      </div>
      {(supportingText || errorText) && (
        <p
          className={`text-xs px-1 ${
            error || Boolean(errorText)
              ? "text-[var(--md-sys-color-error,#ffb4ab)] font-medium"
              : "text-[var(--md-sys-color-on-surface-variant,#cac5c8)]/70"
          }`}
        >
          {errorText || supportingText}
        </p>
      )}
    </div>
  );
});
