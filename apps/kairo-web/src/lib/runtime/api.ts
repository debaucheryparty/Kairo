import { currentRuntime, type RuntimeMode } from "@/src/lib/runtime/mode";
import { getInjectedDesktopConfig, withLocalAuthQuery } from "@/src/lib/runtime/config";

export type BrowserLocation = {
  hostname: string;
  port: string;
  protocol: string;
};

export type ApiResolveInput = {
  runtime?: RuntimeMode;
  explicitBase?: string | null;
  location?: BrowserLocation | null;
  desktopBackendOrigin?: string | null;
};

const DEFAULT_DESKTOP_BACKEND = "http://127.0.0.1:8080";

function trimTrailingSlash(value: string) {
  return value.replace(/\/$/, "");
}

function readExplicitBase(
  env: Record<string, string | undefined> = typeof process !== "undefined" ? process.env : {},
): string {
  return trimTrailingSlash(env.NEXT_PUBLIC_API_BASE?.trim() || "");
}

export function resolveApiOrigin(input: ApiResolveInput = {}): string {
  const explicit = trimTrailingSlash(input.explicitBase?.trim() || "");
  if (explicit) return explicit;

  const runtime = input.runtime ?? "web";

  if (runtime === "desktop") {
    const desktop = trimTrailingSlash(input.desktopBackendOrigin?.trim() || "");
    return desktop || DEFAULT_DESKTOP_BACKEND;
  }

  const location = input.location;
  if (!location) return "";

  const { hostname, port, protocol } = location;
  if ((hostname === "localhost" || hostname === "127.0.0.1") && port === "3000") {
    return `${protocol}//127.0.0.1:8080`;
  }
  return "";
}

export function apiOrigin(
  env: Record<string, string | undefined> = typeof process !== "undefined" ? process.env : {},
): string {
  if (typeof window === "undefined") return "";
  const injected = getInjectedDesktopConfig();
  const { hostname, port, protocol } = window.location;
  return resolveApiOrigin({
    runtime: currentRuntime(env),
    explicitBase: readExplicitBase(env),
    location: { hostname, port, protocol },
    desktopBackendOrigin: injected?.apiOrigin,
  });
}

export function apiUrl(
  path: string,
  env: Record<string, string | undefined> = typeof process !== "undefined" ? process.env : {},
): string {
  if (/^https?:\/\//.test(path)) return path;
  return `${apiOrigin(env)}${path}`;
}

export function wsUrl(
  path: string,
  env: Record<string, string | undefined> = typeof process !== "undefined" ? process.env : {},
): string {
  const origin = apiOrigin(env);
  if (!origin) {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    return `${protocol}://${window.location.host}${path}`;
  }
  return `${origin.replace(/^http/, "ws")}${path}`;
}

export function resolveWsUrl(
  path: string,
  httpOrigin: string,
  pageHost: string,
  pageIsHttps: boolean,
) {
  if (!httpOrigin) {
    const protocol = pageIsHttps ? "wss" : "ws";
    return `${protocol}://${pageHost}${path}`;
  }
  return `${httpOrigin.replace(/^http/, "ws")}${path}`;
}

export function authenticatedApiUrl(
  path: string,
  env: Record<string, string | undefined> = typeof process !== "undefined" ? process.env : {},
): string {
  return withLocalAuthQuery(apiUrl(path, env), getInjectedDesktopConfig()?.localAuthToken);
}
