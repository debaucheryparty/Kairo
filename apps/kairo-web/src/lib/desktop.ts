export const TOP_BAR_HEIGHT = 56;
export const DOCK_RESERVE = 108;
export const WINDOW_MIN_WIDTH = 360;
export const WINDOW_MIN_HEIGHT = 220;

export function desktopBounds() {
  if (typeof window === "undefined") {
    return {
      width: 1440,
      height: 900,
      workHeight: 736,
      fullscreenHeight: 844,
    };
  }

  const width = window.innerWidth;
  const height = window.innerHeight;

  return {
    width,
    height,
    workHeight: Math.max(320, height - TOP_BAR_HEIGHT - DOCK_RESERVE),
    fullscreenHeight: Math.max(320, height - TOP_BAR_HEIGHT),
  };
}
