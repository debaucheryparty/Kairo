"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  generateDynamicM3Tokens,
  M3_BASELINE_SEEDS,
  M3_SCHEME_VARIANTS,
  type M3SchemeVariant,
  type ThemeMode,
  type ContrastLevel,
  type M3ColorTokens,
} from "@/src/lib/color/dynamic-color";

export type Theme = ThemeMode;
export type { M3SchemeVariant, ContrastLevel, M3ColorTokens };
export { M3_BASELINE_SEEDS, M3_SCHEME_VARIANTS };

const STORAGE_KEY = "kairo-theme";
const SCHEME_STORAGE_KEY = "kairo-scheme";
const SOURCE_COLOR_STORAGE_KEY = "kairo-source-color";
const CONTRAST_STORAGE_KEY = "kairo-contrast";
const THEME_EVENT = "kairo-theme";

export interface ThemeContextValue {
  theme: Theme;
  scheme: M3SchemeVariant;
  sourceColor: string;
  contrast: ContrastLevel;
  tokens: M3ColorTokens;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  setScheme: (scheme: M3SchemeVariant) => void;
  setSourceColor: (hex: string) => void;
  setContrast: (contrast: ContrastLevel) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {}
  return document.documentElement.classList.contains("light") ? "light" : "dark";
}

function readScheme(): M3SchemeVariant {
  if (typeof document === "undefined") return "Tonal Spot";
  try {
    const saved = localStorage.getItem(SCHEME_STORAGE_KEY) as M3SchemeVariant | null;
    if (saved && (M3_SCHEME_VARIANTS as readonly string[]).includes(saved)) {
      return saved;
    }
  } catch {}
  return "Tonal Spot";
}

function readSourceColor(): string {
  if (typeof document === "undefined") return "#6750A4";
  try {
    const saved = localStorage.getItem(SOURCE_COLOR_STORAGE_KEY);
    if (saved && /^#[0-9A-Fa-f]{6}$/.test(saved)) {
      return saved;
    }
  } catch {}
  return "#6750A4"; // Google Material 3 Baseline Purple
}

function readContrast(): ContrastLevel {
  if (typeof document === "undefined") return "normal";
  try {
    const saved = localStorage.getItem(CONTRAST_STORAGE_KEY);
    if (saved === "normal" || saved === "high") return saved;
  } catch {}
  return "normal";
}

export function applyTheme(
  theme: Theme = readTheme(),
  scheme: M3SchemeVariant = readScheme(),
  sourceColor: string = readSourceColor(),
  contrast: ContrastLevel = readContrast()
): M3ColorTokens {
  const tokens = generateDynamicM3Tokens(sourceColor, scheme, theme, contrast);
  if (typeof document === "undefined") return tokens;

  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.scheme = scheme;
  document.documentElement.dataset.sourceColor = sourceColor;
  document.documentElement.dataset.contrast = contrast;
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.classList.toggle("light", theme === "light");
  document.documentElement.classList.toggle("high-contrast", contrast === "high");
  document.documentElement.style.colorScheme = theme;

  const style = document.documentElement.style;

  // 1. Official Material 3 Standard Tokens (--md-sys-color-*)
  style.setProperty("--md-sys-color-primary", tokens.primary);
  style.setProperty("--md-sys-color-on-primary", tokens.onPrimary);
  style.setProperty("--md-sys-color-primary-container", tokens.primaryContainer);
  style.setProperty("--md-sys-color-on-primary-container", tokens.onPrimaryContainer);
  style.setProperty("--md-sys-color-inverse-primary", tokens.inversePrimary);

  // M3 Fixed Tokens (Image 1, 2, 4)
  style.setProperty("--md-sys-color-primary-fixed", tokens.primaryFixed);
  style.setProperty("--md-sys-color-primary-fixed-dim", tokens.primaryFixedDim);
  style.setProperty("--md-sys-color-on-primary-fixed", tokens.onPrimaryFixed);
  style.setProperty("--md-sys-color-on-primary-fixed-variant", tokens.onPrimaryFixedVariant);

  style.setProperty("--md-sys-color-secondary", tokens.secondary);
  style.setProperty("--md-sys-color-on-secondary", tokens.onSecondary);
  style.setProperty("--md-sys-color-secondary-container", tokens.secondaryContainer);
  style.setProperty("--md-sys-color-on-secondary-container", tokens.onSecondaryContainer);

  style.setProperty("--md-sys-color-secondary-fixed", tokens.secondaryFixed);
  style.setProperty("--md-sys-color-secondary-fixed-dim", tokens.secondaryFixedDim);
  style.setProperty("--md-sys-color-on-secondary-fixed", tokens.onSecondaryFixed);
  style.setProperty("--md-sys-color-on-secondary-fixed-variant", tokens.onSecondaryFixedVariant);

  style.setProperty("--md-sys-color-tertiary", tokens.tertiary);
  style.setProperty("--md-sys-color-on-tertiary", tokens.onTertiary);
  style.setProperty("--md-sys-color-tertiary-container", tokens.tertiaryContainer);
  style.setProperty("--md-sys-color-on-tertiary-container", tokens.onTertiaryContainer);

  style.setProperty("--md-sys-color-tertiary-fixed", tokens.tertiaryFixed);
  style.setProperty("--md-sys-color-tertiary-fixed-dim", tokens.tertiaryFixedDim);
  style.setProperty("--md-sys-color-on-tertiary-fixed", tokens.onTertiaryFixed);
  style.setProperty("--md-sys-color-on-tertiary-fixed-variant", tokens.onTertiaryFixedVariant);

  style.setProperty("--md-sys-color-error", tokens.error);
  style.setProperty("--md-sys-color-on-error", tokens.onError);
  style.setProperty("--md-sys-color-error-container", tokens.errorContainer);
  style.setProperty("--md-sys-color-on-error-container", tokens.onErrorContainer);

  style.setProperty("--md-sys-color-background", tokens.background);
  style.setProperty("--md-sys-color-on-background", tokens.onBackground);
  style.setProperty("--md-sys-color-surface", tokens.surface);
  style.setProperty("--md-sys-color-on-surface", tokens.onSurface);
  style.setProperty("--md-sys-color-surface-dim", tokens.surfaceDim);
  style.setProperty("--md-sys-color-surface-bright", tokens.surfaceBright);
  style.setProperty("--md-sys-color-surface-container-lowest", tokens.surfaceContainerLowest);
  style.setProperty("--md-sys-color-surface-container-low", tokens.surfaceContainerLow);
  style.setProperty("--md-sys-color-surface-container", tokens.surfaceContainer);
  style.setProperty("--md-sys-color-surface-container-high", tokens.surfaceContainerHigh);
  style.setProperty("--md-sys-color-surface-container-highest", tokens.surfaceContainerHighest);
  style.setProperty("--md-sys-color-surface-variant", tokens.surfaceVariant);
  style.setProperty("--md-sys-color-on-surface-variant", tokens.onSurfaceVariant);
  style.setProperty("--md-sys-color-inverse-surface", tokens.inverseSurface);
  style.setProperty("--md-sys-color-inverse-on-surface", tokens.inverseOnSurface);

  style.setProperty("--md-sys-color-outline", tokens.outline);
  style.setProperty("--md-sys-color-outline-variant", tokens.outlineVariant);
  style.setProperty("--md-sys-color-shadow", tokens.shadow);
  style.setProperty("--md-sys-color-scrim", tokens.scrim);
  style.setProperty("--md-sys-color-surface-tint", tokens.surfaceTint);

  // 2. Compatibility aliases (--m3-*)
  style.setProperty("--m3-primary", tokens.primary);
  style.setProperty("--m3-on-primary", tokens.onPrimary);
  style.setProperty("--m3-primary-container", tokens.primaryContainer);
  style.setProperty("--m3-on-primary-container", tokens.onPrimaryContainer);
  style.setProperty("--m3-secondary", tokens.secondary);
  style.setProperty("--m3-on-secondary", tokens.onSecondary);
  style.setProperty("--m3-secondary-container", tokens.secondaryContainer);
  style.setProperty("--m3-on-secondary-container", tokens.onSecondaryContainer);
  style.setProperty("--m3-tertiary", tokens.tertiary);
  style.setProperty("--m3-on-tertiary", tokens.onTertiary);
  style.setProperty("--m3-tertiary-container", tokens.tertiaryContainer);
  style.setProperty("--m3-on-tertiary-container", tokens.onTertiaryContainer);

  style.setProperty("--m3-surface", tokens.surface);
  style.setProperty("--m3-on-surface", tokens.onSurface);
  style.setProperty("--m3-surface-dim", tokens.surfaceDim);
  style.setProperty("--m3-surface-bright", tokens.surfaceBright);
  style.setProperty("--m3-surface-container-lowest", tokens.surfaceContainerLowest);
  style.setProperty("--m3-surface-container-low", tokens.surfaceContainerLow);
  style.setProperty("--m3-surface-container", tokens.surfaceContainer);
  style.setProperty("--m3-surface-container-high", tokens.surfaceContainerHigh);
  style.setProperty("--m3-surface-container-highest", tokens.surfaceContainerHighest);
  style.setProperty("--m3-surface-variant", tokens.surfaceVariant);
  style.setProperty("--m3-on-surface-variant", tokens.onSurfaceVariant);
  style.setProperty("--m3-outline", tokens.outline);
  style.setProperty("--m3-outline-variant", tokens.outlineVariant);
  style.setProperty("--m3-error", tokens.error);
  style.setProperty("--m3-on-error", tokens.onError);
  style.setProperty("--m3-error-container", tokens.errorContainer);
  style.setProperty("--m3-on-error-container", tokens.onErrorContainer);

  // 3. Shell / Hyprland compatibility
  style.setProperty("--hypr-primary", tokens.primary);
  style.setProperty("--hypr-primary-container", tokens.primaryContainer);
  style.setProperty("--hypr-on-primary-container", tokens.onPrimaryContainer);
  style.setProperty("--hypr-secondary", tokens.secondary);
  style.setProperty("--hypr-secondary-container", tokens.secondaryContainer);
  style.setProperty("--hypr-active-border", `${tokens.primary}b3`);

  // 4. Desktop scrim, dock, menu, and surface variables for seamless Dark/Light modes
  if (theme === "light") {
    style.setProperty("--desktop-scrim", "linear-gradient(to bottom, rgba(255, 255, 255, 0.40), rgba(255, 255, 255, 0.15), rgba(255, 255, 255, 0.35))");
    style.setProperty("--dock-bg", "rgba(247, 242, 250, 0.85)");
    style.setProperty("--dock-border", "rgba(0, 0, 0, 0.10)");
    style.setProperty("--menu-bg", "rgba(247, 242, 250, 0.95)");
    style.setProperty("--menu-fg", tokens.onSurface);
    style.setProperty("--menu-border", "rgba(0, 0, 0, 0.12)");
    style.setProperty("--menu-muted", "rgba(0, 0, 0, 0.55)");
    style.setProperty("--menu-hover-bg", tokens.primaryContainer);
    style.setProperty("--menu-hover-fg", tokens.onPrimaryContainer);
    style.setProperty("--app-bg", tokens.surface);
    style.setProperty("--app-fg", tokens.onSurface);
    style.setProperty("--app-bg-2", tokens.surfaceContainerLow);
    style.setProperty("--app-card", tokens.surfaceContainer);
    style.setProperty("--app-border", `${tokens.outlineVariant}40`);
    style.setProperty("--app-title", tokens.onSurface);
    style.setProperty("--app-muted", tokens.onSurfaceVariant);
    style.setProperty("--window-bg", tokens.surfaceContainer);
    style.setProperty("--window-header", tokens.surfaceContainerHigh);
    style.setProperty("--window-header-inactive", tokens.surfaceContainer);
    style.setProperty("--window-title", tokens.onSurface);
    style.setProperty("--window-border", `${tokens.outlineVariant}40`);
  } else {
    style.setProperty("--desktop-scrim", "linear-gradient(to bottom, rgba(0, 0, 0, 0.22), transparent, rgba(0, 0, 0, 0.28))");
    style.setProperty("--dock-bg", "rgba(20, 18, 24, 0.55)");
    style.setProperty("--dock-border", "rgba(255, 255, 255, 0.15)");
    style.setProperty("--menu-bg", "rgba(33, 31, 38, 0.92)");
    style.setProperty("--menu-fg", tokens.onSurface);
    style.setProperty("--menu-border", "rgba(255, 255, 255, 0.14)");
    style.setProperty("--menu-muted", "rgba(255, 255, 255, 0.55)");
    style.setProperty("--menu-hover-bg", tokens.primaryContainer);
    style.setProperty("--menu-hover-fg", tokens.onPrimaryContainer);
    style.setProperty("--app-bg", tokens.surface);
    style.setProperty("--app-fg", tokens.onSurface);
    style.setProperty("--app-bg-2", tokens.surfaceContainerLow);
    style.setProperty("--app-card", tokens.surfaceContainer);
    style.setProperty("--app-border", `${tokens.outlineVariant}40`);
    style.setProperty("--app-title", tokens.onSurface);
    style.setProperty("--app-muted", tokens.onSurfaceVariant);
    style.setProperty("--window-bg", tokens.surfaceContainer);
    style.setProperty("--window-header", tokens.surfaceContainerHigh);
    style.setProperty("--window-header-inactive", tokens.surfaceContainer);
    style.setProperty("--window-title", tokens.onSurface);
    style.setProperty("--window-border", `${tokens.outlineVariant}40`);
  }

  try {
    localStorage.setItem(STORAGE_KEY, theme);
    localStorage.setItem(SCHEME_STORAGE_KEY, scheme);
    localStorage.setItem(SOURCE_COLOR_STORAGE_KEY, sourceColor);
    localStorage.setItem(CONTRAST_STORAGE_KEY, contrast);
  } catch {}
  window.dispatchEvent(new Event(THEME_EVENT));

  return tokens;
}

function getThemeSnapshot(): string {
  return `${readTheme()}::${readScheme()}::${readSourceColor()}::${readContrast()}`;
}

function subscribe(onStoreChange: () => void) {
  window.addEventListener(THEME_EVENT, onStoreChange);
  window.addEventListener("storage", onStoreChange);
  return () => {
    window.removeEventListener(THEME_EVENT, onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const snapshot = useSyncExternalStore<string>(
    subscribe,
    getThemeSnapshot,
    () => "dark::Tonal Spot::#6750A4::normal"
  );
  const [themeStr, schemeStr, sourceColorStr, contrastStr] = snapshot.split("::");
  const theme = (themeStr === "light" ? "light" : "dark") as Theme;
  const scheme = ((M3_SCHEME_VARIANTS as readonly string[]).includes(schemeStr)
    ? schemeStr
    : "Tonal Spot") as M3SchemeVariant;
  const sourceColor = sourceColorStr || "#6750A4";
  const contrast = (contrastStr === "high" ? "high" : "normal") as ContrastLevel;

  const tokens = useMemo(
    () => generateDynamicM3Tokens(sourceColor, scheme, theme, contrast),
    [sourceColor, scheme, theme, contrast]
  );

  const setTheme = useCallback((next: Theme) => {
    applyTheme(next, readScheme(), readSourceColor(), readContrast());
  }, []);

  const setScheme = useCallback((nextScheme: M3SchemeVariant) => {
    applyTheme(readTheme(), nextScheme, readSourceColor(), readContrast());
  }, []);

  const setSourceColor = useCallback((nextColor: string) => {
    applyTheme(readTheme(), readScheme(), nextColor, readContrast());
  }, []);

  const setContrast = useCallback((nextContrast: ContrastLevel) => {
    applyTheme(readTheme(), readScheme(), readSourceColor(), nextContrast);
  }, []);

  const toggleTheme = useCallback(() => {
    applyTheme(
      readTheme() === "dark" ? "light" : "dark",
      readScheme(),
      readSourceColor(),
      readContrast()
    );
  }, []);

  const value = useMemo(
    () => ({
      theme,
      scheme,
      sourceColor,
      contrast,
      tokens,
      setTheme,
      toggleTheme,
      setScheme,
      setSourceColor,
      setContrast,
    }),
    [theme, scheme, sourceColor, contrast, tokens, setTheme, toggleTheme, setScheme, setSourceColor, setContrast]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
