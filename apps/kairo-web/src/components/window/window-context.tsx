"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
  type ReactNode,
} from "react";
import { APP_META, type AppId, type WindowChrome } from "@/src/data/apps";
import { getFileType } from "@/src/lib/files/file-type";
import { desktopBounds, WINDOW_MIN_HEIGHT, WINDOW_MIN_WIDTH } from "@/src/lib/desktop";

export type WindowPayload = {
  filePath?: string;
  fileName?: string;
  fileSize?: number;
  modified?: string;
  mime?: string;
  cwd?: string;
  isDirectory?: boolean;
  infoOnly?: boolean;
  surfaceId?: string;
  appId?: string;
  appName?: string;
  appExec?: string;
  appIcon?: string;
};

export type SnapSide = "left" | "right" | "top";

export type SnapRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type WindowState = {
  id: string;
  title: string;
  app: AppId;
  x: number;
  y: number;
  width: number;
  height: number;
  minimized: boolean;
  maximized: boolean;
  snapped?: "left" | "right" | null;
  zIndex: number;
  workspaceId?: number;
  payload?: WindowPayload;
  chrome?: WindowChrome;
  restoreBounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
};

type ManagerState = {
  windows: WindowState[];
  focusedId: string | null;
  zCounter: number;
  activeWorkspace: number;
  overviewOpen: boolean;
};

type Action =
  | { type: "open"; app: AppId; payload?: WindowPayload }
  | { type: "close"; id: string }
  | { type: "minimize"; id: string }
  | { type: "maximize"; id: string }
  | { type: "restore"; id: string }
  | { type: "snap"; id: string; side: "left" | "right" }
  | { type: "tile" }
  | { type: "focus"; id: string }
  | { type: "clearFocus" }
  | { type: "move"; id: string; x: number; y: number }
  | {
      type: "resize";
      id: string;
      x: number;
      y: number;
      width: number;
      height: number;
    }
  | { type: "syncMaximized" }
  | { type: "updateTitle"; id: string; title: string }
  | { type: "setWorkspace"; workspaceId: number }
  | { type: "moveWindowToWorkspace"; id: string; workspaceId: number }
  | { type: "toggleOverview" }
  | { type: "setOverview"; open: boolean };

function nextZ(state: ManagerState) {
  return state.zCounter + 1;
}

function clampPosition(x: number, y: number, width: number) {
  const { width: vw, workHeight } = desktopBounds();
  const maxX = Math.max(8, vw - 80);
  const maxY = Math.max(0, workHeight - 40);
  return {
    x: Math.min(Math.max(x, 8 - Math.max(0, width - 80)), maxX),
    y: Math.min(Math.max(y, 0), maxY),
  };
}

function fitSize(width: number, height: number) {
  const { width: vw, workHeight } = desktopBounds();
  return {
    width: Math.min(width, Math.max(WINDOW_MIN_WIDTH, vw - 32)),
    height: Math.min(height, Math.max(WINDOW_MIN_HEIGHT, workHeight)),
  };
}

function maximizedRect() {
  const { width, fullscreenHeight } = desktopBounds();
  return {
    x: 0,
    y: 0,
    width,
    height: fullscreenHeight,
  };
}

export function snapRect(side: SnapSide): SnapRect {
  const { width: vw, workHeight, fullscreenHeight } = desktopBounds();
  if (side === "top") {
    return {
      x: 0,
      y: 0,
      width: vw,
      height: fullscreenHeight,
    };
  }
  const halfW = Math.floor(vw / 2) - 12;
  return {
    x: side === "left" ? 8 : Math.floor(vw / 2) + 4,
    y: 8,
    width: halfW,
    height: workHeight - 16,
  };
}

function reducer(state: ManagerState, action: Action): ManagerState {
  switch (action.type) {
    case "open": {
      const id = windowId(action.app, action.payload);
      const existing = state.windows.find((item) => item.id === id);
      if (existing) {
        const zIndex = nextZ(state);
        return {
          ...state,
          windows: state.windows.map((item) =>
            item.id === existing.id
              ? {
                  ...item,
                  minimized: false,
                  zIndex,
                  payload: action.payload ?? item.payload,
                  title: windowTitle(action.app, action.payload ?? item.payload),
                  chrome: windowChrome(action.app, action.payload ?? item.payload),
                }
              : item,
          ),
          focusedId: existing.id,
          zCounter: zIndex,
          overviewOpen: false,
        };
      }

      const meta = APP_META[action.app] || {
        title: action.payload?.appName || action.app,
        width: 960,
        height: 640,
        available: true,
        chrome: "dark" as const,
      };
      const size = fitSize(meta.width, meta.height);
      const cascade = (state.windows.length % 6) * 28;
      const pos = clampPosition(64 + cascade, 20 + cascade, size.width);
      const zIndex = nextZ(state);
      const windowState: WindowState = {
        id,
        title: windowTitle(action.app, action.payload),
        app: action.app,
        x: pos.x,
        y: pos.y,
        width: size.width,
        height: size.height,
        minimized: false,
        maximized: false,
        zIndex,
        workspaceId: state.activeWorkspace,
        payload: action.payload,
        chrome: windowChrome(action.app, action.payload),
      };

      return {
        ...state,
        windows: [...state.windows, windowState],
        focusedId: windowState.id,
        zCounter: zIndex,
        overviewOpen: false,
      };
    }
    case "close":
      return {
        ...state,
        windows: state.windows.filter((item) => item.id !== action.id),
        focusedId:
          state.focusedId === action.id
            ? (state.windows.filter((item) => item.id !== action.id).at(-1)?.id ?? null)
            : state.focusedId,
      };
    case "minimize":
      return {
        ...state,
        windows: state.windows.map((item) =>
          item.id === action.id ? { ...item, minimized: true } : item,
        ),
        focusedId: state.focusedId === action.id ? null : state.focusedId,
      };
    case "maximize": {
      const max = maximizedRect();
      const zIndex = nextZ(state);
      return {
        ...state,
        windows: state.windows.map((item) => {
          if (item.id !== action.id) return item;
          if (item.maximized) return item;
          return {
            ...item,
            maximized: true,
            minimized: false,
            zIndex,
            restoreBounds: {
              x: item.x,
              y: item.y,
              width: item.width,
              height: item.height,
            },
            ...max,
          };
        }),
        focusedId: action.id,
        zCounter: zIndex,
      };
    }
    case "restore": {
      const zIndex = nextZ(state);
      return {
        ...state,
        windows: state.windows.map((item) => {
          if (item.id !== action.id) return item;
          if (item.minimized && item.maximized) {
            return { ...item, minimized: false, zIndex };
          }
          if (item.minimized) {
            return { ...item, minimized: false, zIndex };
          }
          if ((item.maximized || item.snapped) && item.restoreBounds) {
            return {
              ...item,
              maximized: false,
              snapped: null,
              minimized: false,
              zIndex,
              ...item.restoreBounds,
              restoreBounds: undefined,
            };
          }
          return { ...item, minimized: false, snapped: null, zIndex };
        }),
        focusedId: action.id,
        zCounter: zIndex,
      };
    }
    case "snap": {
      const zIndex = nextZ(state);
      const rect = snapRect(action.side);
      return {
        ...state,
        windows: state.windows.map((item) => {
          if (item.id !== action.id) return item;
          const restoreBounds = item.restoreBounds || {
            x: item.x,
            y: item.y,
            width: item.width,
            height: item.height,
          };
          return {
            ...item,
            maximized: false,
            minimized: false,
            snapped: action.side,
            zIndex,
            restoreBounds,
            ...rect,
          };
        }),
        focusedId: action.id,
        zCounter: zIndex,
      };
    }
    case "tile": {
      const openWindows = state.windows.filter((w) => !w.minimized);
      if (openWindows.length === 0) return state;
      const { width: vw, workHeight } = desktopBounds();
      let zIndex = state.zCounter;

      if (openWindows.length === 1) {
        const rect = snapRect("left");
        zIndex = zIndex + 1;
        return {
          ...state,
          windows: state.windows.map((w) =>
            w.id === openWindows[0].id ? { ...w, ...rect, snapped: "left", zIndex } : w,
          ),
          zCounter: zIndex,
        };
      }

      if (openWindows.length === 2) {
        const leftRect = snapRect("left");
        const rightRect = snapRect("right");
        return {
          ...state,
          windows: state.windows.map((w) => {
            if (w.id === openWindows[0].id) {
              zIndex = zIndex + 1;
              return { ...w, ...leftRect, snapped: "left", zIndex };
            }
            if (w.id === openWindows[1].id) {
              zIndex = zIndex + 1;
              return { ...w, ...rightRect, snapped: "right", zIndex };
            }
            return w;
          }),
          zCounter: zIndex,
        };
      }

      const cols = 2;
      const rows = Math.ceil(openWindows.length / 2);
      const cellW = Math.floor(vw / cols) - 12;
      const cellH = Math.floor((workHeight - 16) / rows);

      return {
        ...state,
        windows: state.windows.map((w) => {
          const idx = openWindows.findIndex((item) => item.id === w.id);
          if (idx === -1) return w;
          const col = idx % cols;
          const row = Math.floor(idx / cols);
          zIndex = zIndex + 1;
          return {
            ...w,
            x: 8 + col * (cellW + 8),
            y: 8 + row * (cellH + 8),
            width: cellW,
            height: cellH,
            snapped: null,
            maximized: false,
            minimized: false,
            zIndex,
          };
        }),
        zCounter: zIndex,
      };
    }
    case "focus": {
      const zIndex = nextZ(state);
      return {
        ...state,
        windows: state.windows.map((item) =>
          item.id === action.id ? { ...item, minimized: false, zIndex } : item,
        ),
        focusedId: action.id,
        zCounter: zIndex,
      };
    }
    case "clearFocus":
      return { ...state, focusedId: null };
    case "move": {
      const pos = clampPosition(action.x, action.y, 80);
      return {
        ...state,
        windows: state.windows.map((item) =>
          item.id === action.id && !item.maximized
            ? { ...item, x: pos.x, y: pos.y, snapped: null }
            : item,
        ),
      };
    }
    case "resize": {
      const width = Math.max(WINDOW_MIN_WIDTH, action.width);
      const height = Math.max(WINDOW_MIN_HEIGHT, action.height);
      const pos = clampPosition(action.x, action.y, width);
      return {
        ...state,
        windows: state.windows.map((item) =>
          item.id === action.id && !item.maximized
            ? { ...item, ...pos, width, height, snapped: null }
            : item,
        ),
      };
    }
    case "syncMaximized": {
      const max = maximizedRect();
      return {
        ...state,
        windows: state.windows.map((item) => (item.maximized ? { ...item, ...max } : item)),
      };
    }
    case "updateTitle": {
      return {
        ...state,
        windows: state.windows.map((item) =>
          item.id === action.id ? { ...item, title: action.title } : item,
        ),
      };
    }
    case "setWorkspace": {
      const targetWs = Math.max(1, Math.min(5, action.workspaceId));
      if (state.activeWorkspace === targetWs) {
        return state.overviewOpen ? { ...state, overviewOpen: false } : state;
      }
      const wsWindows = state.windows.filter(
        (w) => (w.workspaceId ?? 1) === targetWs && !w.minimized,
      );
      const topWindow = wsWindows.sort((a, b) => b.zIndex - a.zIndex)[0];
      return {
        ...state,
        activeWorkspace: targetWs,
        focusedId: topWindow ? topWindow.id : null,
        overviewOpen: false,
      };
    }
    case "moveWindowToWorkspace": {
      const targetWs = Math.max(1, Math.min(5, action.workspaceId));
      return {
        ...state,
        windows: state.windows.map((w) =>
          w.id === action.id ? { ...w, workspaceId: targetWs } : w,
        ),
      };
    }
    case "toggleOverview": {
      return {
        ...state,
        overviewOpen: !state.overviewOpen,
      };
    }
    case "setOverview": {
      return {
        ...state,
        overviewOpen: action.open,
      };
    }
    default:
      return state;
  }
}

type WindowManagerApi = {
  windows: WindowState[];
  focusedId: string | null;
  activeWorkspace: number;
  overviewOpen: boolean;
  snapPreview: { side: SnapSide; rect: SnapRect } | null;
  setSnapPreview: (preview: { side: SnapSide; rect: SnapRect } | null) => void;
  snapWindow: (id: string, side: "left" | "right") => void;
  tileWindows: () => void;
  openWindow: (app: AppId, payload?: WindowPayload) => void;
  closeWindow: (id: string) => void;
  minimizeWindow: (id: string) => void;
  maximizeWindow: (id: string) => void;
  restoreWindow: (id: string) => void;
  focusWindow: (id: string) => void;
  clearFocus: () => void;
  updateWindowPosition: (id: string, x: number, y: number) => void;
  updateWindowSize: (id: string, width: number, height: number, x: number, y: number) => void;
  updateWindowTitle: (id: string, title: string) => void;
  setWorkspace: (workspaceId: number) => void;
  moveWindowToWorkspace: (id: string, workspaceId: number) => void;
  toggleOverview: () => void;
  setOverview: (open: boolean) => void;
};

const WindowManagerContext = createContext<WindowManagerApi | null>(null);

export function WindowManagerProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, {
    windows: [],
    focusedId: null,
    zCounter: 10,
    activeWorkspace: 1,
    overviewOpen:
      typeof window !== "undefined" &&
      (new URLSearchParams(window.location.search).has("overview") ||
        window.location.pathname.toLowerCase().includes("overview")),
  });
  const [snapPreview, setSnapPreview] = useState<{ side: SnapSide; rect: SnapRect } | null>(null);

  useEffect(() => {
    const onResize = () => dispatch({ type: "syncMaximized" });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const openWindow = useCallback((app: AppId, payload?: WindowPayload) => {
    dispatch({ type: "open", app, payload });
  }, []);
  const closeWindow = useCallback((id: string) => {
    dispatch({ type: "close", id });
  }, []);
  const minimizeWindow = useCallback((id: string) => {
    dispatch({ type: "minimize", id });
  }, []);
  const maximizeWindow = useCallback((id: string) => {
    dispatch({ type: "maximize", id });
  }, []);
  const restoreWindow = useCallback((id: string) => {
    dispatch({ type: "restore", id });
  }, []);
  const snapWindow = useCallback((id: string, side: "left" | "right") => {
    dispatch({ type: "snap", id, side });
  }, []);
  const tileWindows = useCallback(() => {
    dispatch({ type: "tile" });
  }, []);
  const focusWindow = useCallback((id: string) => {
    dispatch({ type: "focus", id });
  }, []);
  const clearFocus = useCallback(() => {
    dispatch({ type: "clearFocus" });
  }, []);
  const updateWindowPosition = useCallback((id: string, x: number, y: number) => {
    dispatch({ type: "move", id, x, y });
  }, []);
  const updateWindowSize = useCallback(
    (id: string, width: number, height: number, x: number, y: number) => {
      dispatch({ type: "resize", id, x, y, width, height });
    },
    [],
  );
  const updateWindowTitle = useCallback((id: string, title: string) => {
    dispatch({ type: "updateTitle", id, title });
  }, []);
  const setWorkspace = useCallback((workspaceId: number) => {
    dispatch({ type: "setWorkspace", workspaceId });
  }, []);
  const moveWindowToWorkspace = useCallback((id: string, workspaceId: number) => {
    dispatch({ type: "moveWindowToWorkspace", id, workspaceId });
  }, []);
  const toggleOverview = useCallback(() => {
    dispatch({ type: "toggleOverview" });
  }, []);
  const setOverview = useCallback((open: boolean) => {
    dispatch({ type: "setOverview", open });
  }, []);

  const value = useMemo<WindowManagerApi>(
    () => ({
      windows: state.windows,
      focusedId: state.focusedId,
      activeWorkspace: state.activeWorkspace,
      overviewOpen: state.overviewOpen,
      snapPreview,
      setSnapPreview,
      snapWindow,
      tileWindows,
      openWindow,
      closeWindow,
      minimizeWindow,
      maximizeWindow,
      restoreWindow,
      focusWindow,
      clearFocus,
      updateWindowPosition,
      updateWindowSize,
      updateWindowTitle,
      setWorkspace,
      moveWindowToWorkspace,
      toggleOverview,
      setOverview,
    }),
    [
      state.windows,
      state.focusedId,
      state.activeWorkspace,
      state.overviewOpen,
      snapPreview,
      snapWindow,
      tileWindows,
      openWindow,
      closeWindow,
      minimizeWindow,
      maximizeWindow,
      restoreWindow,
      focusWindow,
      clearFocus,
      updateWindowPosition,
      updateWindowSize,
      updateWindowTitle,
      setWorkspace,
      moveWindowToWorkspace,
      toggleOverview,
      setOverview,
    ],
  );

  return <WindowManagerContext.Provider value={value}>{children}</WindowManagerContext.Provider>;
}

export function useWindowManager() {
  const context = useContext(WindowManagerContext);
  if (!context) {
    throw new Error("useWindowManager must be used within WindowManagerProvider");
  }
  return context;
}

function windowId(app: AppId, payload?: WindowPayload) {
  if (app === "viewer" && payload?.filePath) {
    if (payload.infoOnly || payload.isDirectory) {
      return `viewer:info:${payload.filePath}`;
    }
    return `viewer:${payload.filePath}`;
  }
  if (payload?.surfaceId) {
    return `surface:${payload.surfaceId}`;
  }
  return app;
}

function windowTitle(app: AppId, payload?: WindowPayload) {
  if (app === "viewer") {
    return payload?.fileName || payload?.filePath?.split("/").filter(Boolean).pop() || "Viewer";
  }
  if (payload?.appName) {
    return payload.appName;
  }
  return APP_META[app]?.title || app.charAt(0).toUpperCase() + app.slice(1);
}

function windowChrome(app: AppId, payload?: WindowPayload): WindowChrome | undefined {
  if (app !== "viewer") return undefined;
  const kind = getFileType({
    name: payload?.fileName || payload?.filePath || "",
    mime: payload?.mime,
  });
  if (kind === "video" || kind === "audio" || kind === "code" || kind === "text") {
    return "dark";
  }
  return "light";
}
