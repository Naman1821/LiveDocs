import { auth, clerkClient } from "@clerk/nextjs/server";

/**
 * Resolves Clerk user IDs to display info for Liveblocks.
 * Used by `resolveUsers` in `app/providers.tsx`, which lets
 * `useUser(userId)` work for any author — including the doc owner
 * (not in document.collaborators) and any user who isn't currently
 * connected to the room.
 *
 * Body: { userIds: string[] }
 * Returns: { users: Array<{ name: string; email?: string } | null> }
 *   ordered the same as input. `null` for ids we can't find.
 */
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return new Response("Unauthorized", { status: 401 });
  }

  let userIds: string[] = [];
  try {
    const body = await req.json();
    if (Array.isArray(body?.userIds)) {
      userIds = body.userIds.filter(
        (x: unknown): x is string => typeof x === "string" && x.length > 0,
      );
    }
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  if (userIds.length === 0) {
    return Response.json({ users: [] });
  }

  let users: Array<{ name: string; email?: string } | null> = userIds.map(
    () => null,
  );

  try {
    const cc = await clerkClient();
    const list = await cc.users.getUserList({ userId: userIds, limit: userIds.length });
    const byId = new Map<string, { name: string; email?: string }>();
    for (const u of list.data) {
      const email =
        u.primaryEmailAddress?.emailAddress ??
        u.emailAddresses?.[0]?.emailAddress ??
        undefined;
      const name = email ?? u.fullName ?? u.username ?? u.id;
      byId.set(u.id, { name, email });
    }
    users = userIds.map((id) => byId.get(id) ?? null);
  } catch (err) {
    console.error("[liveblocks-users] resolve failed", err);
  }

  return Response.json({ users });
}
