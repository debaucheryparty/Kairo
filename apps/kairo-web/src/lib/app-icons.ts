"use client";

import type { LucideIcon } from "lucide-react";
import {
  AppWindow,
  Code2,
  Database,
  Eye,
  Folder,
  Globe,
  Info,
  LayoutDashboard,
  Settings,
  Terminal,
  Trash2,
} from "lucide-react";
import type { AppId } from "@/src/data/apps";

export const APP_ICONS: Record<AppId, LucideIcon> = {
  dashboard: LayoutDashboard,
  files: Folder,
  terminal: Terminal,
  editor: Code2,
  domains: Globe,
  databases: Database,
  settings: Settings,
  about: Info,
  viewer: Eye,
  surface: AppWindow,
  trash: Trash2,
};
