"use client";

import { AboutApp } from "@/src/components/apps/AboutApp";
import { DashboardApp } from "@/src/components/apps/DashboardApp";
import { FileViewer } from "@/src/components/apps/files/viewers/FileViewer";
import { FilesApp } from "@/src/components/apps/FilesApp";
import { RemoteAppsApp } from "@/src/components/apps/RemoteAppsApp";
import { RemoteSurfaceViewer } from "@/src/components/apps/RemoteSurfaceViewer";
import { SettingsApp } from "@/src/components/apps/SettingsApp";
import { TerminalApp } from "@/src/components/apps/TerminalApp";
import { TrashApp } from "@/src/components/apps/TrashApp";
import { Window } from "@/src/components/window/Window";
import { useWindowManager, type WindowPayload } from "@/src/components/window/window-context";
import type { AppId } from "@/src/data/apps";

export function WindowManager() {
  const { windows, snapPreview } = useWindowManager();

  return (
    <>
      {snapPreview && (
        <div
          className="pointer-events-none fixed z-[9990] rounded-2xl border-2 border-sky-400/50 bg-sky-500/15 backdrop-blur-md shadow-2xl shadow-sky-500/20 transition-all duration-150 ease-out"
          style={{
            left: snapPreview.rect.x,
            top: snapPreview.rect.y,
            width: snapPreview.rect.width,
            height: snapPreview.rect.height,
          }}
        />
      )}
      {windows
        .filter((item) => !item.minimized)
        .map((item) => (
          <Window key={item.id} window={item}>
            <AppBody app={item.app} payload={item.payload} windowId={item.id} />
          </Window>
        ))}
    </>
  );
}

function AppBody({
  app,
  payload,
  windowId,
}: {
  app: AppId;
  payload?: WindowPayload;
  windowId: string;
}) {
  switch (app) {
    case "dashboard":
      return <DashboardApp />;
    case "files":
      return <FilesApp />;
    case "terminal":
      return <TerminalApp payload={payload} />;
    case "remote-apps":
      return <RemoteAppsApp />;
    case "viewer":
      return <FileViewer payload={payload} windowId={windowId} />;
    case "surface":
      return <RemoteSurfaceViewer payload={payload} windowId={windowId} />;
    case "settings":
      return <SettingsApp />;
    case "about":
      return <AboutApp />;
    case "trash":
      return <TrashApp />;
  }
}
