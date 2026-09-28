"use client";

import type { Server } from "@/src/lib/servers";
import { ServerStatus } from "@/src/components/server-selection/ServerStatus";

export function ServerCard({
  server,
  testing,
  testMessage,
  onConnect,
  onTest,
  onEdit,
  onDelete,
}: {
  server: Server;
  testing?: boolean;
  testMessage?: string | null;
  onConnect: () => void;
  onTest: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="animate-card-in rounded-[22px] border border-white/10 bg-white/[0.06] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.28)] backdrop-blur-xl">
      <div className="relative flex min-h-[118px] flex-col items-start text-left">
        <span
          className={`absolute right-0 top-0 size-2 rounded-full ${
            server.status === "online"
              ? "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.85)]"
              : server.status === "connecting"
                ? "bg-amber-300"
                : server.status === "authentication_failed"
                  ? "bg-red-400"
                  : "bg-zinc-400"
          }`}
          aria-hidden
        />
        <p className="pr-6 text-[17px] font-semibold tracking-tight text-white">{server.name}</p>
        {server.hostname && server.hostname !== server.name ? (
          <p className="mt-3 font-mono text-[12px] text-white/58">{server.hostname}</p>
        ) : null}
        <p
          className={`${server.hostname && server.hostname !== server.name ? "mt-1" : "mt-3"} font-mono text-[12px] text-white/58`}
        >
          {server.username ? `${server.username}@${server.address}` : server.address}
          {server.sshPort && server.sshPort !== 22 ? `:${server.sshPort}` : ""}
        </p>
        <div className="mt-auto pt-5">
          <ServerStatus status={server.status} />
        </div>
      </div>

      {testMessage ? (
        <p className="mt-3 text-[12px] text-white/70" role="status">
          {testMessage}
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          onClick={onConnect}
          className="inline-flex cursor-pointer items-center justify-center rounded-full bg-white px-4 py-1.5 text-[12px] font-semibold text-zinc-900 shadow-sm transition hover:bg-white/90 active:scale-95"
        >
          Connect
        </button>
        <button
          type="button"
          onClick={onTest}
          disabled={testing}
          className="inline-flex cursor-pointer items-center justify-center rounded-full border border-white/15 bg-white/10 px-3.5 py-1.5 text-[12px] font-medium text-white transition hover:bg-white/15 active:scale-95 disabled:opacity-50"
        >
          {testing ? "Testing…" : "Test Connection"}
        </button>
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex cursor-pointer items-center justify-center rounded-full border border-white/10 px-3 py-1.5 text-[12px] font-medium text-white/80 transition hover:bg-white/10 hover:text-white active:scale-95"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="inline-flex cursor-pointer items-center justify-center rounded-full border border-red-500/20 px-3 py-1.5 text-[12px] font-medium text-red-300 transition hover:bg-red-500/15 hover:text-red-200 active:scale-95"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
