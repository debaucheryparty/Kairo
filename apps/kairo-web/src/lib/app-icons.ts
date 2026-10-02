"use client";

import type { LucideIcon } from "lucide-react";
import {
  AppWindow,
  Eye,
  Folder,
  Info,
  LayoutDashboard,
  LayoutGrid,
  Settings,
  Terminal,
  Trash2,
} from "lucide-react";
import type { AppId } from "@/src/data/apps";

export const APP_ICONS: Record<AppId, LucideIcon> = {
  dashboard: LayoutDashboard,
  files: Folder,
  terminal: Terminal,
  "remote-apps": LayoutGrid,
  settings: Settings,
  about: Info,
  viewer: Eye,
  surface: AppWindow,
  trash: Trash2,
};
