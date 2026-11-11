"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/src/lib/theme";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <div
      role="group"
      aria-label="Appearance"
      className="flex shrink-0 items-center rounded-full p-0.5 bg-[var(--m3-surface-container-high)] border border-[var(--m3-outline-variant)]/40 transition-colors"
    >
      <button
        type="button"
        aria-label="Light mode"
        title="Light mode"
        aria-pressed={theme === "light"}
        className={`flex size-6 items-center justify-center rounded-full outline-none transition-all ${
          theme === "light"
            ? "bg-[var(--m3-primary)] text-[var(--m3-on-primary)] shadow-sm font-bold"
            : "text-[var(--m3-on-surface-variant)] hover:text-[var(--m3-on-surface)] hover:bg-[var(--m3-on-surface)]/10"
        }`}
        onClick={() => setTheme("light")}
      >
        <Sun aria-hidden className="size-3.5" />
      </button>
      <button
        type="button"
        aria-label="Dark mode"
        title="Dark mode"
        aria-pressed={theme === "dark"}
        className={`flex size-6 items-center justify-center rounded-full outline-none transition-all ${
          theme === "dark"
            ? "bg-[var(--m3-primary)] text-[var(--m3-on-primary)] shadow-sm font-bold"
            : "text-[var(--m3-on-surface-variant)] hover:text-[var(--m3-on-surface)] hover:bg-[var(--m3-on-surface)]/10"
        }`}
        onClick={() => setTheme("dark")}
      >
        <Moon aria-hidden className="size-3.5" />
      </button>
    </div>
  );
}

