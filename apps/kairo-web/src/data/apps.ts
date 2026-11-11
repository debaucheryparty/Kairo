export const APP_IDS = [
  "dashboard",
  "files",
  "terminal",
  "browser",
  "settings",
] as const;

export type DockAppId = (typeof APP_IDS)[number];
export type BuiltinAppId = DockAppId | "about" | "viewer" | "trash" | "editor";
export type AppId = BuiltinAppId | (string & {});

export type WindowChrome = "light" | "dark";

export const APP_META: Record<
  string,
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
    chrome: "dark",
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
    height: 520,
    available: true,
    chrome: "dark",
  },
  browser: {
    title: "Web Browser",
    width: 1040,
    height: 680,
    available: true,
    chrome: "dark",
  },
  settings: {
    title: "Settings",
    width: 820,
    height: 580,
    available: true,
    chrome: "dark",
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
    title: "Text Editor",
    width: 800,
    height: 560,
    available: true,
    chrome: "dark",
  },
};
