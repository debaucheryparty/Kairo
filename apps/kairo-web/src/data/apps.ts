export const APP_IDS = [
  "dashboard",
  "files",
  "terminal",
  "settings",
] as const;

export type DockAppId = (typeof APP_IDS)[number];
export type AppId = DockAppId | "about" | "viewer" | "surface" | "trash" | "editor";

export type WindowChrome = "light" | "dark";

export const APP_META: Record<
  AppId,
  {
    title: string;
    width: number;
    height: number;
    available: boolean;
    chrome: WindowChrome;
  }
> = {
  dashboard: {
    title: "Dashboard",
    width: 900,
    height: 600,
    available: true,
    chrome: "light",
  },
  files: {
    title: "Files",
    width: 850,
    height: 600,
    available: true,
    chrome: "light",
  },
  terminal: {
    title: "Terminal",
    width: 800,
    height: 480,
    available: true,
    chrome: "dark",
  },
  surface: {
    title: "Remote Surface",
    width: 960,
    height: 640,
    available: true,
    chrome: "dark",
  },
  settings: {
    title: "Settings",
    width: 750,
    height: 550,
    available: true,
    chrome: "light",
  },
  about: {
    title: "About",
    width: 440,
    height: 380,
    available: true,
    chrome: "light",
  },
  viewer: {
    title: "Viewer",
    width: 880,
    height: 620,
    available: true,
    chrome: "light",
  },
  trash: {
    title: "Trash",
    width: 800,
    height: 520,
    available: true,
    chrome: "light",
  },
  editor: {
    title: "Visual Studio Code",
    width: 1024,
    height: 680,
    available: true,
    chrome: "dark",
  },
};
