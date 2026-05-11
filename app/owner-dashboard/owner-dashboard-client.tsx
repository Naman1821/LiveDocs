"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { sameConvexUser } from "@/convex/convexUserIdentity";

type AiProvider = "gemini" | "groq" | "byok";

type AppUserRow = {
  _id: string;
  clerkUserId: string;
  email: string;
  displayName?: string;
  lastSeenAt: number;
  hasByok: boolean;
};

function formatTime(ts: number) {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts);
  }
}

export function OwnerDashboardClient() {
  const loadDashboard = useAction(api.platformSettings.ownerDashboardLoadAction);
  const setProviderAction = useAction(api.platformSettings.ownerSetAiProviderAction);
  const setAiEnabledAction = useAction(api.platformSettings.ownerSetAiEnabledAction);
  const setImportFromComputerAction = useAction(
    api.platformSettings.ownerSetImportFromComputerEnabledAction,
  );
  const clearByokAction = useAction(api.platformSettings.ownerClearUserByokAction);
  const deleteUserAction = useAction(api.platformSettings.ownerDeleteAppUserAction);

  const [users, setUsers] = useState<AppUserRow[] | undefined>(undefined);
  const [dashboardOwnerSubject, setDashboardOwnerSubject] = useState<string | null>(null);
  const [currentProvider, setCurrentProvider] = useState<AiProvider>("gemini");
  const [groqClipdropImages, setGroqClipdropImages] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(true);
  const [aiEnabledSaving, setAiEnabledSaving] = useState(false);
  const [importFromComputerEnabled, setImportFromComputerEnabled] = useState(true);
  const [importSaving, setImportSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pendingProvider, setPendingProvider] = useState<AiProvider | null>(null);
  const [clipdropSaving, setClipdropSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoadError(null);
    try {
      const data = await loadDashboard({});
      setUsers(data.users as AppUserRow[]);
      setCurrentProvider(data.aiProvider);
      setGroqClipdropImages(!!data.groqClipdropImages);
      setAiEnabled(data.aiEnabled !== false);
      setImportFromComputerEnabled(data.importFromComputerEnabled !== false);
      setDashboardOwnerSubject(data.dashboardOwnerSubject);
    } catch (e) {
      setUsers([]);
      setLoadError(e instanceof Error ? e.message : "Could not load dashboard");
    }
  }, [loadDashboard]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const providerSaving = pendingProvider !== null || clipdropSaving;

  const saveAiEnabled = async (next: boolean) => {
    setAiEnabledSaving(true);
    setLoadError(null);
    try {
      await setAiEnabledAction({ enabled: next });
      setAiEnabled(next);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not update AI switch");
    } finally {
      setAiEnabledSaving(false);
    }
  };

  const saveImportFromComputer = async (next: boolean) => {
    setImportSaving(true);
    setLoadError(null);
    try {
      await setImportFromComputerAction({ enabled: next });
      setImportFromComputerEnabled(next);
    } catch (e) {
      setLoadError(
        e instanceof Error ? e.message : "Could not update import from computer",
      );
    } finally {
      setImportSaving(false);
    }
  };

  const saveProvider = async (p: AiProvider) => {
    setPendingProvider(p);
    try {
      await setProviderAction({
        aiProvider: p,
        groqClipdropImages: p === "groq" ? groqClipdropImages : undefined,
      });
      setCurrentProvider(p);
      if (p !== "groq") setGroqClipdropImages(false);
    } finally {
      setPendingProvider(null);
    }
  };

  const saveGroqClipdrop = async (next: boolean) => {
    if (currentProvider !== "groq") return;
    setClipdropSaving(true);
    try {
      await setProviderAction({ aiProvider: "groq", groqClipdropImages: next });
      setGroqClipdropImages(next);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not update Clipdrop setting");
    } finally {
      setClipdropSaving(false);
    }
  };

  const rows = users ?? [];

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Owner dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            AI provider for everyone · users who opened the app · BYOK keys
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/documents">Back to templates</Link>
        </Button>
      </div>

      {loadError ? (
        <div className="mb-6 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {loadError}
          <button
            type="button"
            className="ml-3 underline"
            onClick={() => void refresh()}
          >
            Retry
          </button>
        </div>
      ) : null}

      <section className="mb-10 rounded-xl border bg-card p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-medium">AI for everyone</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Turn off to hide all AI in the editor and block AI API calls. Project AI mode below
              stays saved for when you turn this back on.
            </p>
          </div>
          <label className="flex shrink-0 cursor-pointer items-center gap-3 rounded-lg border border-dashed border-muted-foreground/30 px-4 py-3 text-sm">
            <input
              type="checkbox"
              role="switch"
              className="size-4 accent-primary"
              checked={aiEnabled}
              disabled={aiEnabledSaving || users === undefined}
              onChange={(e) => void saveAiEnabled(e.target.checked)}
            />
            <span className="font-medium">{aiEnabled ? "AI on" : "AI off"}</span>
          </label>
        </div>
        {aiEnabledSaving ? (
          <p className="mt-2 text-xs text-muted-foreground">Saving…</p>
        ) : null}
      </section>

      <section className="mb-10 rounded-xl border bg-card p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-medium">Import from computer</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Controls the .docx import button on the templates page and the import icon in the
              document editor toolbar.
            </p>
          </div>
          <label className="flex shrink-0 cursor-pointer items-center gap-3 rounded-lg border border-dashed border-muted-foreground/30 px-4 py-3 text-sm">
            <input
              type="checkbox"
              role="switch"
              className="size-4 accent-primary"
              checked={importFromComputerEnabled}
              disabled={importSaving || users === undefined}
              onChange={(e) => void saveImportFromComputer(e.target.checked)}
            />
            <span className="font-medium">
              {importFromComputerEnabled ? "Import on" : "Import off"}
            </span>
          </label>
        </div>
        {importSaving ? (
          <p className="mt-2 text-xs text-muted-foreground">Saving…</p>
        ) : null}
      </section>

      <section className="mb-10 rounded-xl border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-medium">Project AI mode</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Controls text rewrite for all signed-in users. Images use Gemini unless you pick Groq
          only (no images) or Groq + Clipdrop (images via Clipdrop API key on the server).
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          {(
            [
              ["gemini", "Gemini (server key)"],
              ["groq", "Groq (server key)"],
              ["byok", "BYOK (each user’s Gemini key)"],
            ] as const
          ).map(([value, label]) => (
            <label
              key={value}
              className="flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5"
            >
              <input
                type="radio"
                name="aiProvider"
                value={value}
                checked={currentProvider === value}
                disabled={providerSaving || users === undefined}
                onChange={() => void saveProvider(value)}
              />
              {label}
            </label>
          ))}
        </div>
        {currentProvider === "groq" ? (
          <label className="mt-4 flex max-w-xl cursor-pointer items-start gap-3 rounded-lg border border-dashed border-muted-foreground/30 px-4 py-3 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={groqClipdropImages}
              disabled={providerSaving || users === undefined}
              onChange={(e) => void saveGroqClipdrop(e.target.checked)}
            />
            <span>
              <span className="font-medium">Use Clipdrop for images</span>
              <span className="mt-1 block text-muted-foreground">
                Text stays on Groq. Requires{" "}
                <code className="rounded bg-muted px-1">CLIPDROP_API_KEY</code> on the Next.js
                server.
              </span>
            </span>
          </label>
        ) : null}
        {providerSaving ? (
          <p className="mt-2 text-xs text-muted-foreground">Saving…</p>
        ) : null}
      </section>

      <section className="rounded-xl border bg-card shadow-sm">
        <div className="border-b px-6 py-4">
          <h2 className="text-lg font-medium">Users (heartbeat)</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Email comes from the Convex JWT when present; otherwise we store the user’s primary
            email from their Clerk session after sign-in. Clear BYOK removes stored Gemini key only.
            Remove deletes the tracking row (user can reappear on next visit).
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Last seen</th>
                <th className="px-4 py-3 font-medium">BYOK</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users === undefined ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    No users yet. Open the app signed-in to record a heartbeat.
                  </td>
                </tr>
              ) : (
                rows.map((u) => {
                  const isOwnerRow =
                    !!dashboardOwnerSubject &&
                    sameConvexUser(u.clerkUserId, dashboardOwnerSubject);
                  return (
                    <tr key={u._id} className="border-b last:border-0">
                      <td className="max-w-[220px] truncate px-4 py-3 font-mono text-xs">
                        {u.email || "—"}
                      </td>
                      <td className="max-w-[160px] truncate px-4 py-3">{u.displayName ?? "—"}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                        {formatTime(u.lastSeenAt)}
                      </td>
                      <td className="px-4 py-3">{u.hasByok ? "Yes" : "—"}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          {u.hasByok ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={busyId === u.clerkUserId}
                              onClick={async () => {
                                setBusyId(u.clerkUserId);
                                try {
                                  await clearByokAction({ clerkUserId: u.clerkUserId });
                                  await refresh();
                                } finally {
                                  setBusyId(null);
                                }
                              }}
                            >
                              Clear BYOK
                            </Button>
                          ) : null}
                          {isOwnerRow ? (
                            <span className="inline-flex items-center rounded-md border border-muted-foreground/25 bg-muted/50 px-2.5 py-1 text-xs font-medium text-muted-foreground">
                              Owner
                            </span>
                          ) : (
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              disabled={busyId === u.clerkUserId}
                              onClick={async () => {
                                if (
                                  !window.confirm(
                                    "Remove this user row from the dashboard list?",
                                  )
                                ) {
                                  return;
                                }
                                setBusyId(u.clerkUserId);
                                try {
                                  await deleteUserAction({ clerkUserId: u.clerkUserId });
                                  await refresh();
                                } catch (e) {
                                  window.alert(
                                    e instanceof Error ? e.message : "Could not remove user",
                                  );
                                } finally {
                                  setBusyId(null);
                                }
                              }}
                            >
                              Remove
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <p className="mt-8 text-xs text-muted-foreground">
        Owner access: set <code className="rounded bg-muted px-1">OWNER_EMAIL</code> on Convex (same
        as Next). Because the Convex JWT often omits email, also set{" "}
        <code className="rounded bg-muted px-1">CLERK_SECRET_KEY</code> on Convex (same value as
        Next <code className="rounded bg-muted px-1">CLERK_SECRET_KEY</code>) so the backend can
        confirm your email via Clerk. Alternative:{" "}
        <code className="rounded bg-muted px-1">npx convex env set OWNER_CLERK_USER_ID user_…</code>
        . Next.js: <code className="rounded bg-muted px-1">NEXT_PUBLIC_OWNER_EMAIL</code> /{" "}
        <code className="rounded bg-muted px-1">NEXT_PUBLIC_OWNER_CLERK_USER_ID</code> for the
        templates link. BYOK: <code className="rounded bg-muted px-1">BYOK_ENCRYPTION_SECRET</code>{" "}
        (16+ chars). Optional: <code className="rounded bg-muted px-1">GROQ_API_KEY</code>,{" "}
        <code className="rounded bg-muted px-1">GROQ_MODEL</code>. Groq + Clipdrop images:{" "}
        <code className="rounded bg-muted px-1">CLIPDROP_API_KEY</code>.
      </p>
    </div>
  );
}
