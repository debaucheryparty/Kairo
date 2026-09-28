import {
  clearInjectedDesktopConfig,
  getInjectedDesktopConfig,
  setInjectedDesktopConfig,
  validateDesktopConfig,
  type DesktopRuntimeConfig,
} from "@/src/lib/runtime/config";

export type BootstrapResult = { kind: "web" } | { kind: "desktop"; config: DesktopRuntimeConfig };

export async function bootstrapRuntime(): Promise<BootstrapResult> {
  clearInjectedDesktopConfig();
  return { kind: "web" };
}

export async function watchDesktopBackend(
  _onStopped: (message: string) => void,
  _signal: AbortSignal,
): Promise<void> {
  return;
}
