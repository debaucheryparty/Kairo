"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Check, Copy, RefreshCw, X } from "lucide-react";
import type { NewServerInput, Server } from "@/src/lib/servers";

type AuthMethod = "password" | "private_key" | "token";

export function AddServerModal({
  server,
  busy,
  error,
  connectAfterSave = false,
  onClose,
  onSubmit,
}: {
  server?: Server | null;
  busy?: boolean;
  error?: string | null;
  connectAfterSave?: boolean;
  onClose: () => void;
  onSubmit: (input: NewServerInput, options?: { connect?: boolean }) => Promise<void> | void;
}) {
  const editing = Boolean(server);
  const titleId = useId();
  const firstField = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(server?.name || "");
  const [address, setAddress] = useState(server?.address || "");
  const [port, setPort] = useState(String(server?.sshPort || 22));
  const [username, setUsername] = useState(server?.username || "");
  const [auth, setAuth] = useState<AuthMethod>(server?.authType || "password");
  const [password, setPassword] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [authToken, setAuthToken] = useState(server?.authToken || "");
  const [tunnelMode, setTunnelMode] = useState(server?.tunnelMode || false);
  const [tunnelUrl, setTunnelUrl] = useState(server?.tunnelUrl || "");
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [copied, setCopied] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleClose = () => {
    setPassword("");
    setPrivateKey("");
    setAuthToken("");
    setTunnelUrl("");
    setCopied(false);
    onClose();
  };

  useEffect(() => {
    firstField.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") handleClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit(event: FormEvent, connect?: boolean) {
    event.preventDefault();
    const sshPort = Number(port);
    if (!name.trim() || !address.trim() || !username.trim()) {
      setLocalError("Server name, host, and username are required.");
      return;
    }
    if (!Number.isInteger(sshPort) || sshPort < 1 || sshPort > 65535) {
      setLocalError("SSH port must be a number between 1 and 65535.");
      return;
    }
    if (!editing && auth === "password" && !password.trim()) {
      setLocalError("Password is required.");
      return;
    }
    if (!editing && auth === "private_key" && !privateKey.trim()) {
      setLocalError("Private key is required.");
      return;
    }
    if (!editing && auth === "token" && !authToken.trim()) {
      setLocalError("Auth token is required.");
      return;
    }
    if (editing && auth !== server?.authType && !password.trim() && !privateKey.trim() && !authToken.trim()) {
      setLocalError("Enter new credentials when changing the authentication method.");
      return;
    }
    setLocalError(null);
    await onSubmit(
      {
        name: name.trim(),
        address: address.trim(),
        hostname: address.trim(),
        sshPort,
        username: username.trim(),
        authType: auth,
        password: password.trim() || undefined,
        privateKey: privateKey.trim() || undefined,
        authToken: authToken.trim() || undefined,
        tunnelMode,
        tunnelUrl: tunnelMode && tunnelUrl.trim() ? tunnelUrl.trim() : undefined,
      },
      { connect },
    );
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm animate-overlay-in"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) handleClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-[440px] overflow-hidden rounded-[22px] border border-white/12 bg-[#16181d]/92 shadow-[0_30px_80px_rgba(0,0,0,0.5)] backdrop-blur-2xl animate-modal-in"
      >
        <div className="flex items-center justify-between border-b border-white/8 px-5 py-3.5">
          <h2 id={titleId} className="text-[15px] font-semibold text-white">
            {editing ? "Edit Server" : "Add Server"}
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={handleClose}
            className="flex size-7 items-center justify-center rounded-full text-white/60 transition hover:bg-white/10 hover:text-white"
          >
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={(event) => void submit(event, false)} className="space-y-3.5 px-5 py-4">
          {!editing ? (
            <p className="text-[13px] leading-5 text-white/62">
              Add a remote server or agent. Credentials are kept private and transmitted securely over encrypted channels.
            </p>
          ) : null}
          <Field label="Server Name">
            <input
              ref={firstField}
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="sui-server-input"
              placeholder="Production"
              autoComplete="off"
            />
          </Field>
          <Field label="Host / IP">
            <input
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              className="sui-server-input"
              placeholder="203.0.113.10"
              autoComplete="off"
            />
          </Field>
          <Field label="SSH Port">
            <input
              value={port}
              onChange={(event) => setPort(event.target.value)}
              className="sui-server-input"
              inputMode="numeric"
              placeholder="22"
            />
          </Field>
          <Field label="Username">
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="sui-server-input"
              placeholder="deploy"
              autoComplete="username"
            />
          </Field>
          <fieldset>
            <legend className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.16em] text-white/48">
              Authentication
            </legend>
            <div className="flex gap-2" role="group" aria-label="Authentication method">
              <AuthChoice
                selected={auth === "password"}
                onSelect={() => setAuth("password")}
                label="Password"
              />
              <AuthChoice
                selected={auth === "private_key"}
                onSelect={() => setAuth("private_key")}
                label="SSH Key"
              />
              <AuthChoice
                selected={auth === "token"}
                onSelect={() => setAuth("token")}
                label="Token"
              />
            </div>
          </fieldset>

          {auth === "password" ? (
            <Field label="Password">
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="sui-server-input"
                placeholder={editing ? "Leave unchanged" : "••••••••••••"}
                autoComplete="new-password"
              />
            </Field>
          ) : auth === "private_key" ? (
            <Field label="Private Key">
              <div className="relative">
                <textarea
                  value={privateKey}
                  onChange={(event) => setPrivateKey(event.target.value)}
                  style={{
                    WebkitTextSecurity: showPrivateKey ? "none" : "disc",
                  } as React.CSSProperties}
                  className="sui-server-input min-h-[140px] resize-y font-mono text-[12px] leading-5 pr-14"
                  placeholder={
                    editing
                      ? "Leave unchanged"
                      : "-----BEGIN OPENSSH PRIVATE KEY-----\n...\n-----END OPENSSH PRIVATE KEY-----"
                  }
                  spellCheck={false}
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={() => setShowPrivateKey(!showPrivateKey)}
                  className="absolute right-2 top-2 rounded px-2 py-1 text-[11px] font-medium text-white/60 bg-white/5 hover:bg-white/10 hover:text-white"
                >
                  {showPrivateKey ? "Hide" : "Show"}
                </button>
              </div>
              <p className="mt-2 text-[12px] leading-5 text-white/52">
                Your private key is protected in memory and masked to prevent unauthorized viewing.
              </p>
            </Field>
          ) : (
            <Field label="Agent Auth Token">
              <div className="flex gap-2">
                <input
                  type="password"
                  value={authToken}
                  onChange={(event) => setAuthToken(event.target.value)}
                  className="sui-server-input font-mono flex-1"
                  placeholder={editing ? "Leave unchanged" : "kro_••••••••"}
                  autoComplete="new-password"
                  spellCheck={false}
                />
                {!editing ? (
                  <button
                    type="button"
                    onClick={() => {
                      const arr = new Uint8Array(18);
                      crypto.getRandomValues(arr);
                      const generated = "kro_" + Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
                      setAuthToken(generated);
                    }}
                    className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[12px] font-medium text-white/80 transition hover:bg-white/10 hover:text-white"
                  >
                    <RefreshCw className="size-3.5" />
                    <span>Generate</span>
                  </button>
                ) : null}
              </div>
              <p className="mt-2 text-[12px] leading-5 text-white/52">
                Shared secret token configured in the Kairo Agent.
              </p>

              {authToken && !editing ? (
                <div className="mt-3 rounded-xl border border-white/10 bg-black/40 p-3">
                  <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.16em] text-white/48">
                    <span>One-Click Pairing Command</span>
                    <button
                      type="button"
                      onClick={() => {
                        const cmd = `curl -fsSL https://kairo.dev/install.sh | sudo sh -s -- --token ${authToken}${
                          tunnelMode && tunnelUrl ? ` --tunnel ${tunnelUrl.trim()}` : ""
                        }`;
                        void navigator.clipboard.writeText(cmd);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      }}
                      className="flex items-center gap-1 text-[11px] font-medium text-blue-400 hover:text-blue-300 transition"
                    >
                      {copied ? (
                        <>
                          <Check className="size-3 text-emerald-400" />
                          <span className="text-emerald-400 normal-case">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="size-3" />
                          <span className="normal-case">Copy Command</span>
                        </>
                      )}
                    </button>
                  </div>
                  <pre className="mt-2 overflow-x-auto rounded-lg bg-black/60 p-2.5 font-mono text-[11px] leading-5 text-emerald-400 whitespace-pre">
                    curl -fsSL https://kairo.dev/install.sh | sudo sh -s -- --token {authToken}
                    {tunnelMode && tunnelUrl ? ` --tunnel ${tunnelUrl.trim()}` : ""}
                  </pre>
                  <p className="mt-2 text-[11px] text-white/45">
                    Run this on your remote server to automatically install and pair the agent.
                  </p>
                </div>
              ) : null}
            </Field>
          )}

          <div className="pt-1">
            <label className="flex items-center gap-2.5 cursor-pointer text-[13px] text-white/80 select-none">
              <input
                type="checkbox"
                checked={tunnelMode}
                onChange={(e) => setTunnelMode(e.target.checked)}
                className="size-4 rounded border-white/20 bg-white/10 text-blue-500 focus:ring-0 focus:ring-offset-0"
              />
              <span>Behind NAT / Firewall (Reverse Tunnel)</span>
            </label>
            {tunnelMode ? (
              <div className="mt-2.5 space-y-1">
                <input
                  value={tunnelUrl}
                  onChange={(event) => setTunnelUrl(event.target.value)}
                  className="sui-server-input font-mono text-[12px]"
                  placeholder="wss://relay.kairo.dev/tunnel"
                  autoComplete="off"
                />
                <p className="text-[11px] text-white/45">
                  Relay endpoint for agents operating behind NAT or restrictive firewalls.
                </p>
              </div>
            ) : null}
          </div>

          {localError || error ? (
            <p className="text-[12px] text-red-300" role="alert">
              {localError || error}
            </p>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full px-4 py-2 text-[13px] font-medium text-white/70 transition hover:bg-white/8 hover:text-white"
            >
              Cancel
            </button>
            {connectAfterSave && !editing ? (
              <button
                type="button"
                disabled={busy}
                onClick={(event) => void submit(event, true)}
                className="rounded-full bg-white px-4 py-2 text-[13px] font-semibold text-zinc-900 transition hover:bg-white/90 disabled:cursor-not-allowed disabled:bg-white/25 disabled:text-white/50"
              >
                {busy ? "Saving…" : "Save & Connect"}
              </button>
            ) : null}
            <button
              type="submit"
              disabled={busy}
              className={`rounded-full px-4 py-2 text-[13px] font-semibold transition disabled:cursor-not-allowed ${
                connectAfterSave && !editing
                  ? "bg-white/12 text-white hover:bg-white/18 disabled:bg-white/8 disabled:text-white/40"
                  : "bg-white text-zinc-900 hover:bg-white/90 disabled:bg-white/25 disabled:text-white/50"
              }`}
            >
              {busy ? "Saving…" : editing ? "Save Server" : "Save Server"}
            </button>
          </div>
          {!editing ? (
            <p className="text-[11px] leading-5 text-white/45">
              After saving, use Test Connection on the server card to verify SSH without opening the
              desktop.
            </p>
          ) : null}
        </form>
      </div>
    </div>
  );
}

function AuthChoice({
  selected,
  onSelect,
  label,
}: {
  selected: boolean;
  onSelect: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`flex-1 rounded-xl border px-3 py-2 text-[13px] font-medium transition ${
        selected
          ? "border-white/30 bg-white/12 text-white"
          : "border-white/10 bg-white/4 text-white/70 hover:bg-white/8"
      }`}
    >
      {label}
    </button>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.16em] text-white/48">
        {label}
      </span>
      {children}
    </label>
  );
}
