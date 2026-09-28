import { getInjectedDesktopConfig } from "@/src/lib/runtime/config";

export type RuntimeMode = "web" | "desktop";

export function currentRuntime(
  env: Record<string, string | undefined> = typeof process !== "undefined" ? process.env : {},
): RuntimeMode {
  const injected = getInjectedDesktopConfig();
  if (injected?.mode === "desktop") return "desktop";

  const raw = env.NEXT_PUBLIC_KAIRO_RUNTIME?.trim().toLowerCase();
  if (raw === "desktop") return "desktop";
  return "web";
}

export function isDesktopRuntime(
  env: Record<string, string | undefined> = typeof process !== "undefined" ? process.env : {},
): boolean {
  return currentRuntime(env) === "desktop";
}
