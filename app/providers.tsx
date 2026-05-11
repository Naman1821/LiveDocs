"use client";

import { useEffect } from "react";
import { useAuth, useUser } from "@clerk/nextjs";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { useMutation } from "convex/react";
import { LiveblocksProvider } from "@liveblocks/react";
import { api } from "@/convex/_generated/api";
import { GlobalFeedbackDialog } from "@/components/editor/global-feedback-dialog";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

/**
 * Resolves a batch of Clerk user IDs to `{ name, email }` so Liveblocks'
 * `useUser(userId)` works for *any* author — including the document owner
 * (who isn't in `document.collaborators`) and any user who isn't currently
 * connected. Without this, the comments panel falls back to the literal
 * "collaborator" string for offline authors.
 */
async function resolveUsers({
  userIds,
}: {
  userIds: readonly string[];
}): Promise<Array<{ name: string; email?: string } | undefined>> {
  if (!userIds.length) return [];
  try {
    const res = await fetch("/api/liveblocks-users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userIds }),
    });
    if (!res.ok) return userIds.map(() => undefined);
    const data = (await res.json()) as {
      users?: Array<{ name: string; email?: string } | null>;
    };
    const list = data.users ?? [];
    return userIds.map((_, i) => list[i] ?? undefined);
  } catch (err) {
    console.error("[resolveUsers] failed", err);
    return userIds.map(() => undefined);
  }
}

function AppUserHeartbeat() {
  const { isSignedIn, isLoaded } = useAuth();
  const { user, isLoaded: userLoaded } = useUser();
  const record = useMutation(api.platformSettings.recordAppUserHeartbeat);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !userLoaded) return;
    const emailHint = user?.primaryEmailAddress?.emailAddress;
    const displayNameHint =
      user?.fullName?.trim() ||
      [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim() ||
      undefined;
    void record({ emailHint, displayNameHint }).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("Could not find public function")) {
        console.warn(
          "[LiveDocs] Convex has no `platformSettings` yet. Run `npm run convex:dev` (or `npx convex dev`) in another terminal, then push/deploy.",
        );
        return;
      }
      console.warn("[LiveDocs] recordAppUserHeartbeat failed", err);
    });
  }, [
    isLoaded,
    isSignedIn,
    userLoaded,
    user?.primaryEmailAddress?.emailAddress,
    user?.fullName,
    user?.firstName,
    user?.lastName,
    record,
  ]);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <LiveblocksProvider
      authEndpoint="/api/liveblocks-auth"
      resolveUsers={resolveUsers}
    >
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        <AppUserHeartbeat />
        {children}
        <GlobalFeedbackDialog />
      </ConvexProviderWithClerk>
    </LiveblocksProvider>
  );
}