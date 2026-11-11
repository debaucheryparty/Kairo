"use client";

import {
  argbFromHex,
  hexFromArgb,
  themeFromSourceColor,
  Hct,
  TonalPalette,
} from "@material/material-color-utilities";

export type M3SchemeVariant =
  | "Tonal Spot"
  | "Vibrant"
  | "Expressive"
  | "Spritz"
  | "Rainbow"
  | "Fruit Salad"
  | "Monochrome"
  | "Fidelity"
  | "Content";

export type ThemeMode = "light" | "dark";
export type ContrastLevel = "normal" | "high";

export interface M3ColorTokens {
  // Primary
  primary: string;
  onPrimary: string;
  primaryContainer: string;
  onPrimaryContainer: string;
  inversePrimary: string;
  primaryFixed: string;
  primaryFixedDim: string;
  onPrimaryFixed: string;
  onPrimaryFixedVariant: string;

  // Secondary
  secondary: string;
  onSecondary: string;
  secondaryContainer: string;
  onSecondaryContainer: string;
  secondaryFixed: string;
  secondaryFixedDim: string;
  onSecondaryFixed: string;
  onSecondaryFixedVariant: string;

  // Tertiary
  tertiary: string;
  onTertiary: string;
  tertiaryContainer: string;
  onTertiaryContainer: string;
  tertiaryFixed: string;
  tertiaryFixedDim: string;
  onTertiaryFixed: string;
  onTertiaryFixedVariant: string;

  // Error
  error: string;
  onError: string;
  errorContainer: string;
  onErrorContainer: string;

  // Surface & Background
  background: string;
  onBackground: string;
  surface: string;
  onSurface: string;
  surfaceDim: string;
  surfaceBright: string;
  surfaceContainerLowest: string;
  surfaceContainerLow: string;
  surfaceContainer: string;
  surfaceContainerHigh: string;
  surfaceContainerHighest: string;
  surfaceVariant: string;
  onSurfaceVariant: string;
  inverseSurface: string;
  inverseOnSurface: string;

  // Outline & Misc
  outline: string;
  outlineVariant: string;
  shadow: string;
  scrim: string;
  surfaceTint: string;
}

/**
 * Official Material 3 Baseline Seeds from:
 * https://m3.material.io/styles/color/static/baseline
 */
export const M3_BASELINE_SEEDS = [
  { id: "purple", name: "Baseline Purple", hex: "#6750A4" },
  { id: "blue", name: "Ocean Blue", hex: "#00639B" },
  { id: "green", name: "Forest Green", hex: "#006E1C" },
  { id: "amber", name: "Sunset Amber", hex: "#8B5000" },
  { id: "crimson", name: "Crimson Red", hex: "#B3261E" },
  { id: "teal", name: "Jade Teal", hex: "#006A6A" },
  { id: "plum", name: "Rose Plum", hex: "#984061" },
  { id: "cyan", name: "Vivid Cyan", hex: "#006874" },
  { id: "indigo", name: "Deep Indigo", hex: "#3F51B5" },
  { id: "lime", name: "Chartreuse Lime", hex: "#4C662B" },
] as const;

export const M3_SCHEME_VARIANTS: readonly M3SchemeVariant[] = [
  "Tonal Spot",
  "Vibrant",
  "Expressive",
  "Spritz",
  "Rainbow",
  "Fruit Salad",
  "Monochrome",
  "Fidelity",
  "Content",
] as const;

/**
 * Generates the full Material 3 tokens (standard and fixed) for any source color,
 * scheme variant, and contrast level using Google HCT color science algorithms.
 *
 * References:
 * - https://m3.material.io/styles/color/static/baseline
 * - https://m3.material.io/styles/color/choosing-a-scheme
 */
export function generateDynamicM3Tokens(
  sourceHex: string,
  variant: M3SchemeVariant = "Tonal Spot",
  mode: ThemeMode = "dark",
  contrast: ContrastLevel = "normal"
): M3ColorTokens {
  const isDark = mode === "dark";
  const isHighContrast = contrast === "high";
  const sourceArgb = argbFromHex(sourceHex);
  const sourceHct = Hct.fromInt(sourceArgb);
  const hue = sourceHct.hue;
  const chroma = sourceHct.chroma;

  let primaryPalette: TonalPalette;
  let secondaryPalette: TonalPalette;
  let tertiaryPalette: TonalPalette;
  let neutralPalette: TonalPalette;
  let neutralVariantPalette: TonalPalette;

  switch (variant) {
    case "Monochrome": {
      // 0 Chroma pure luminance scale
      primaryPalette = TonalPalette.fromHueAndChroma(hue, 0);
      secondaryPalette = TonalPalette.fromHueAndChroma(hue, 0);
      tertiaryPalette = TonalPalette.fromHueAndChroma(hue, 0);
      neutralPalette = TonalPalette.fromHueAndChroma(hue, 0);
      neutralVariantPalette = TonalPalette.fromHueAndChroma(hue, 0);
      break;
    }
    case "Spritz": {
      // Spritz / Neutral: Low chroma calm palettes
      primaryPalette = TonalPalette.fromHueAndChroma(hue, 12);
      secondaryPalette = TonalPalette.fromHueAndChroma(hue, 8);
      tertiaryPalette = TonalPalette.fromHueAndChroma((hue + 60) % 360, 12);
      neutralPalette = TonalPalette.fromHueAndChroma(hue, 4);
      neutralVariantPalette = TonalPalette.fromHueAndChroma(hue, 8);
      break;
    }
    case "Vibrant": {
      // Vibrant: High chroma primary and energetic secondary
      primaryPalette = TonalPalette.fromHueAndChroma(hue, Math.max(48, chroma));
      secondaryPalette = TonalPalette.fromHueAndChroma(hue, 24);
      tertiaryPalette = TonalPalette.fromHueAndChroma((hue + 60) % 360, 32);
      neutralPalette = TonalPalette.fromHueAndChroma(hue, 6);
      neutralVariantPalette = TonalPalette.fromHueAndChroma(hue, 12);
      break;
    }
    case "Expressive": {
      // Expressive: Complementary and rotated tertiary hues
      primaryPalette = TonalPalette.fromHueAndChroma((hue + 240) % 360, 40);
      secondaryPalette = TonalPalette.fromHueAndChroma((hue + 180) % 360, 24);
      tertiaryPalette = TonalPalette.fromHueAndChroma((hue + 120) % 360, 32);
      neutralPalette = TonalPalette.fromHueAndChroma((hue + 15) % 360, 8);
      neutralVariantPalette = TonalPalette.fromHueAndChroma((hue + 15) % 360, 12);
      break;
    }
    case "Fruit Salad": {
      // Fruit Salad: Playful dual-hue
      primaryPalette = TonalPalette.fromHueAndChroma((hue - 50 + 360) % 360, 48);
      secondaryPalette = TonalPalette.fromHueAndChroma((hue - 50 + 360) % 360, 20);
      tertiaryPalette = TonalPalette.fromHueAndChroma(hue, 36);
      neutralPalette = TonalPalette.fromHueAndChroma(hue, 4);
      neutralVariantPalette = TonalPalette.fromHueAndChroma(hue, 8);
      break;
    }
    case "Rainbow": {
      // Rainbow: Multi-hued accents
      primaryPalette = TonalPalette.fromHueAndChroma(hue, 48);
      secondaryPalette = TonalPalette.fromHueAndChroma((hue + 90) % 360, 28);
      tertiaryPalette = TonalPalette.fromHueAndChroma((hue + 180) % 360, 36);
      neutralPalette = TonalPalette.fromHueAndChroma(hue, 6);
      neutralVariantPalette = TonalPalette.fromHueAndChroma(hue, 10);
      break;
    }
    case "Fidelity":
    case "Content": {
      // Fidelity / Content: Exact match to user/content source
      primaryPalette = TonalPalette.fromHueAndChroma(hue, chroma);
      secondaryPalette = TonalPalette.fromHueAndChroma(hue, Math.max(16, chroma * 0.5));
      tertiaryPalette = TonalPalette.fromHueAndChroma((hue + 60) % 360, Math.max(24, chroma * 0.7));
      neutralPalette = TonalPalette.fromHueAndChroma(hue, Math.min(8, chroma * 0.2));
      neutralVariantPalette = TonalPalette.fromHueAndChroma(hue, Math.min(12, chroma * 0.3));
      break;
    }
    case "Tonal Spot":
    default: {
      // Official Google Material You default theme
      const mcuTheme = themeFromSourceColor(sourceArgb);
      primaryPalette = mcuTheme.palettes.primary;
      secondaryPalette = mcuTheme.palettes.secondary;
      tertiaryPalette = mcuTheme.palettes.tertiary;
      neutralPalette = mcuTheme.palettes.neutral;
      neutralVariantPalette = mcuTheme.palettes.neutralVariant;
      break;
    }
  }

  const errorPalette = TonalPalette.fromHueAndChroma(25, 84);

  // M3 Fixed Tokens (Consistent lightness across light & dark themes)
  const primaryFixed = hexFromArgb(primaryPalette.tone(90));
  const primaryFixedDim = hexFromArgb(primaryPalette.tone(80));
  const onPrimaryFixed = hexFromArgb(primaryPalette.tone(10));
  const onPrimaryFixedVariant = hexFromArgb(primaryPalette.tone(30));

  const secondaryFixed = hexFromArgb(secondaryPalette.tone(90));
  const secondaryFixedDim = hexFromArgb(secondaryPalette.tone(80));
  const onSecondaryFixed = hexFromArgb(secondaryPalette.tone(10));
  const onSecondaryFixedVariant = hexFromArgb(secondaryPalette.tone(30));

  const tertiaryFixed = hexFromArgb(tertiaryPalette.tone(90));
  const tertiaryFixedDim = hexFromArgb(tertiaryPalette.tone(80));
  const onTertiaryFixed = hexFromArgb(tertiaryPalette.tone(10));
  const onTertiaryFixedVariant = hexFromArgb(tertiaryPalette.tone(30));

  // High Contrast overrides
  if (isHighContrast) {
    if (isDark) {
      return {
        primary: hexFromArgb(primaryPalette.tone(90)),
        onPrimary: "#000000",
        primaryContainer: hexFromArgb(primaryPalette.tone(70)),
        onPrimaryContainer: "#000000",
        inversePrimary: hexFromArgb(primaryPalette.tone(30)),
        primaryFixed,
        primaryFixedDim,
        onPrimaryFixed,
        onPrimaryFixedVariant,

        secondary: hexFromArgb(secondaryPalette.tone(90)),
        onSecondary: "#000000",
        secondaryContainer: hexFromArgb(secondaryPalette.tone(70)),
        onSecondaryContainer: "#000000",
        secondaryFixed,
        secondaryFixedDim,
        onSecondaryFixed,
        onSecondaryFixedVariant,

        tertiary: hexFromArgb(tertiaryPalette.tone(90)),
        onTertiary: "#000000",
        tertiaryContainer: hexFromArgb(tertiaryPalette.tone(70)),
        onTertiaryContainer: "#000000",
        tertiaryFixed,
        tertiaryFixedDim,
        onTertiaryFixed,
        onTertiaryFixedVariant,

        error: hexFromArgb(errorPalette.tone(90)),
        onError: "#000000",
        errorContainer: hexFromArgb(errorPalette.tone(70)),
        onErrorContainer: "#000000",

        background: "#000000",
        onBackground: "#FFFFFF",
        surface: "#000000",
        onSurface: "#FFFFFF",
        surfaceDim: "#000000",
        surfaceBright: hexFromArgb(neutralPalette.tone(20)),
        surfaceContainerLowest: "#000000",
        surfaceContainerLow: hexFromArgb(neutralPalette.tone(10)),
        surfaceContainer: hexFromArgb(neutralPalette.tone(15)),
        surfaceContainerHigh: hexFromArgb(neutralPalette.tone(20)),
        surfaceContainerHighest: hexFromArgb(neutralPalette.tone(25)),
        surfaceVariant: hexFromArgb(neutralVariantPalette.tone(30)),
        onSurfaceVariant: "#FFFFFF",
        inverseSurface: "#FFFFFF",
        inverseOnSurface: "#000000",

        outline: hexFromArgb(neutralVariantPalette.tone(80)),
        outlineVariant: hexFromArgb(neutralVariantPalette.tone(60)),
        shadow: "#000000",
        scrim: "#000000",
        surfaceTint: hexFromArgb(primaryPalette.tone(90)),
      };
    }

    // High Contrast Light (As shown in screenshot #3)
    return {
      primary: hexFromArgb(primaryPalette.tone(20)),
      onPrimary: "#FFFFFF",
      primaryContainer: hexFromArgb(primaryPalette.tone(30)),
      onPrimaryContainer: "#FFFFFF",
      inversePrimary: hexFromArgb(primaryPalette.tone(80)),
      primaryFixed,
      primaryFixedDim,
      onPrimaryFixed,
      onPrimaryFixedVariant,

      secondary: hexFromArgb(secondaryPalette.tone(20)),
      onSecondary: "#FFFFFF",
      secondaryContainer: hexFromArgb(secondaryPalette.tone(30)),
      onSecondaryContainer: "#FFFFFF",
      secondaryFixed,
      secondaryFixedDim,
      onSecondaryFixed,
      onSecondaryFixedVariant,

      tertiary: hexFromArgb(tertiaryPalette.tone(20)),
      onTertiary: "#FFFFFF",
      tertiaryContainer: hexFromArgb(tertiaryPalette.tone(30)),
      onTertiaryContainer: "#FFFFFF",
      tertiaryFixed,
      tertiaryFixedDim,
      onTertiaryFixed,
      onTertiaryFixedVariant,

      error: hexFromArgb(errorPalette.tone(20)),
      onError: "#FFFFFF",
      errorContainer: hexFromArgb(errorPalette.tone(30)),
      onErrorContainer: "#FFFFFF",

      background: hexFromArgb(neutralPalette.tone(98)),
      onBackground: "#000000",
      surface: hexFromArgb(neutralPalette.tone(98)),
      onSurface: "#000000",
      surfaceDim: hexFromArgb(neutralPalette.tone(87)),
      surfaceBright: hexFromArgb(neutralPalette.tone(98)),
      surfaceContainerLowest: "#FFFFFF",
      surfaceContainerLow: hexFromArgb(neutralPalette.tone(96)),
      surfaceContainer: hexFromArgb(neutralPalette.tone(94)),
      surfaceContainerHigh: hexFromArgb(neutralPalette.tone(92)),
      surfaceContainerHighest: hexFromArgb(neutralPalette.tone(90)),
      surfaceVariant: hexFromArgb(neutralVariantPalette.tone(90)),
      onSurfaceVariant: "#000000",
      inverseSurface: "#000000",
      inverseOnSurface: "#FFFFFF",

      outline: hexFromArgb(neutralVariantPalette.tone(30)),
      outlineVariant: hexFromArgb(neutralVariantPalette.tone(40)),
      shadow: "#000000",
      scrim: "#000000",
      surfaceTint: hexFromArgb(primaryPalette.tone(20)),
    };
  }

  // Standard Dark Mode (As shown in screenshot #2)
  if (isDark) {
    return {
      primary: hexFromArgb(primaryPalette.tone(80)),
      onPrimary: hexFromArgb(primaryPalette.tone(20)),
      primaryContainer: hexFromArgb(primaryPalette.tone(30)),
      onPrimaryContainer: hexFromArgb(primaryPalette.tone(90)),
      inversePrimary: hexFromArgb(primaryPalette.tone(40)),
      primaryFixed,
      primaryFixedDim,
      onPrimaryFixed,
      onPrimaryFixedVariant,

      secondary: hexFromArgb(secondaryPalette.tone(80)),
      onSecondary: hexFromArgb(secondaryPalette.tone(20)),
      secondaryContainer: hexFromArgb(secondaryPalette.tone(30)),
      onSecondaryContainer: hexFromArgb(secondaryPalette.tone(90)),
      secondaryFixed,
      secondaryFixedDim,
      onSecondaryFixed,
      onSecondaryFixedVariant,

      tertiary: hexFromArgb(tertiaryPalette.tone(80)),
      onTertiary: hexFromArgb(tertiaryPalette.tone(20)),
      tertiaryContainer: hexFromArgb(tertiaryPalette.tone(30)),
      onTertiaryContainer: hexFromArgb(tertiaryPalette.tone(90)),
      tertiaryFixed,
      tertiaryFixedDim,
      onTertiaryFixed,
      onTertiaryFixedVariant,

      error: hexFromArgb(errorPalette.tone(80)),
      onError: hexFromArgb(errorPalette.tone(20)),
      errorContainer: hexFromArgb(errorPalette.tone(30)),
      onErrorContainer: hexFromArgb(errorPalette.tone(90)),

      background: hexFromArgb(neutralPalette.tone(6)),
      onBackground: hexFromArgb(neutralPalette.tone(90)),
      surface: hexFromArgb(neutralPalette.tone(6)),
      onSurface: hexFromArgb(neutralPalette.tone(90)),
      surfaceDim: hexFromArgb(neutralPalette.tone(6)),
      surfaceBright: hexFromArgb(neutralPalette.tone(24)),
      surfaceContainerLowest: hexFromArgb(neutralPalette.tone(4)),
      surfaceContainerLow: hexFromArgb(neutralPalette.tone(10)),
      surfaceContainer: hexFromArgb(neutralPalette.tone(12)),
      surfaceContainerHigh: hexFromArgb(neutralPalette.tone(17)),
      surfaceContainerHighest: hexFromArgb(neutralPalette.tone(22)),
      surfaceVariant: hexFromArgb(neutralVariantPalette.tone(30)),
      onSurfaceVariant: hexFromArgb(neutralVariantPalette.tone(80)),
      inverseSurface: hexFromArgb(neutralPalette.tone(90)),
      inverseOnSurface: hexFromArgb(neutralPalette.tone(20)),

      outline: hexFromArgb(neutralVariantPalette.tone(60)),
      outlineVariant: hexFromArgb(neutralVariantPalette.tone(30)),
      shadow: "#000000",
      scrim: "#000000",
      surfaceTint: hexFromArgb(primaryPalette.tone(80)),
    };
  }

  // Standard Light Mode (As shown in screenshot #1 & #5)
  return {
    primary: hexFromArgb(primaryPalette.tone(40)),
    onPrimary: hexFromArgb(primaryPalette.tone(100)),
    primaryContainer: hexFromArgb(primaryPalette.tone(90)),
    onPrimaryContainer: hexFromArgb(primaryPalette.tone(10)),
    inversePrimary: hexFromArgb(primaryPalette.tone(80)),
    primaryFixed,
    primaryFixedDim,
    onPrimaryFixed,
    onPrimaryFixedVariant,

    secondary: hexFromArgb(secondaryPalette.tone(40)),
    onSecondary: hexFromArgb(secondaryPalette.tone(100)),
    secondaryContainer: hexFromArgb(secondaryPalette.tone(90)),
    onSecondaryContainer: hexFromArgb(secondaryPalette.tone(10)),
    secondaryFixed,
    secondaryFixedDim,
    onSecondaryFixed,
    onSecondaryFixedVariant,

    tertiary: hexFromArgb(tertiaryPalette.tone(40)),
    onTertiary: hexFromArgb(tertiaryPalette.tone(100)),
    tertiaryContainer: hexFromArgb(tertiaryPalette.tone(90)),
    onTertiaryContainer: hexFromArgb(tertiaryPalette.tone(10)),
    tertiaryFixed,
    tertiaryFixedDim,
    onTertiaryFixed,
    onTertiaryFixedVariant,

    error: hexFromArgb(errorPalette.tone(40)),
    onError: hexFromArgb(errorPalette.tone(100)),
    errorContainer: hexFromArgb(errorPalette.tone(90)),
    onErrorContainer: hexFromArgb(errorPalette.tone(10)),

    background: hexFromArgb(neutralPalette.tone(98)),
    onBackground: hexFromArgb(neutralPalette.tone(10)),
    surface: hexFromArgb(neutralPalette.tone(98)),
    onSurface: hexFromArgb(neutralPalette.tone(10)),
    surfaceDim: hexFromArgb(neutralPalette.tone(87)),
    surfaceBright: hexFromArgb(neutralPalette.tone(98)),
    surfaceContainerLowest: hexFromArgb(neutralPalette.tone(100)),
    surfaceContainerLow: hexFromArgb(neutralPalette.tone(96)),
    surfaceContainer: hexFromArgb(neutralPalette.tone(94)),
    surfaceContainerHigh: hexFromArgb(neutralPalette.tone(92)),
    surfaceContainerHighest: hexFromArgb(neutralPalette.tone(90)),
    surfaceVariant: hexFromArgb(neutralVariantPalette.tone(90)),
    onSurfaceVariant: hexFromArgb(neutralVariantPalette.tone(30)),
    inverseSurface: hexFromArgb(neutralPalette.tone(20)),
    inverseOnSurface: hexFromArgb(neutralPalette.tone(95)),

    outline: hexFromArgb(neutralVariantPalette.tone(50)),
    outlineVariant: hexFromArgb(neutralVariantPalette.tone(80)),
    shadow: "#000000",
    scrim: "#000000",
    surfaceTint: hexFromArgb(primaryPalette.tone(40)),
  };
}
