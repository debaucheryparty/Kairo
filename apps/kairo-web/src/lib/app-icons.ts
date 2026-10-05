"use client";

import type { LucideIcon } from "lucide-react";
import {
  AppWindow,
  Code2,
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
  settings: Settings,
  about: Info,
  viewer: Eye,
  surface: AppWindow,
  trash: Trash2,
  editor: Code2,
};
