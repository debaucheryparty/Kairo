export type AppId = 'finder' | 'terminal' | 'monitor' | 'settings';

export interface WindowState {
  id: string;
  appId: AppId;
  title: string;
  computerId: string;
  computerName?: string;
  computerColor?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  minWidth: number;
  minHeight: number;
  isMinimized: boolean;
  isMaximized: boolean;
  zIndex: number;
}
