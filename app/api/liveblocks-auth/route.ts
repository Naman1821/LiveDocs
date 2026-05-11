import { Liveblocks } from "@liveblocks/node";
import { auth, currentUser } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

const jsonHeaders = { "Content-Type": "application/json" } as const;

function getLiveblocks(): Liveblocks | null {
  const secret = process.env.LIVEBLOCKS_SECRET_KEY?.trim();
  if (!secret) {
    return null;
  }
  return new Liveblocks({ secret });
}

/**
 * Liveblocks sometimes POSTs with no `room` (body `{}`) for a lightweight token
 * (notifications, resolveUsers, etc.). Returning 400 here used to break that
 * flow and contributed to flaky WebSocket (1006) + tight client retries.
 */
export async function POST(req: Request) {
  const liveblocks = getLiveblocks();
  if (!liveblocks) {
    console.error(
      "[liveblocks-auth] LIVEBLOCKS_SECRET_KEY is missing or empty — set it in .env.local.",
    );
    return new Response(
      JSON.stringify({ error: "liveblocks_not_configured" }),
      { status: 401, headers: jsonHeaders },
    );
  }

  const { userId, getToken } = await auth();
  if (!userId) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: jsonHeaders,
    });
  }

  let room: string | undefined;
  try {
    const body = await req.json();
    room =
      typeof body?.room === "string" && body.room.length > 0
        ? body.room
        : undefined;
  } catch {
    return new Response(JSON.stringify({ error: "bad_request" }), {
      status: 400,
      headers: jsonHeaders,
    });
  }

  const user = await currentUser();
  const email =
    user?.primaryEmailAddress?.emailAddress ??
    user?.emailAddresses?.[0]?.emailAddress ??
    undefined;
  const session = liveblocks.prepareSession(userId, {
    userInfo: {
      name: email ?? user?.fullName ?? user?.username ?? "Anonymous",
      email,
    },
  });

  if (room) {
    /** Rooms are `${documentId}_${tabKey}` (tabs); legacy rooms used Convex document id only. */
    const underscore = room.indexOf("_");
    const documentIdStr =
      underscore === -1 ? room : room.slice(0, underscore);
    if (!documentIdStr) {
      return new Response(JSON.stringify({ error: "invalid_room" }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    const token = await getToken({ template: "convex" });
    if (!token) {
      return new Response(JSON.stringify({ error: "convex_auth_missing" }), {
        status: 401,
        headers: jsonHeaders,
      });
    }

    const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
    convex.setAuth(token);

    const docId = documentIdStr as Id<"documents">;

    const [doc, access] = await Promise.all([
      convex.query(api.documents.getDocumentById, { id: docId }),
      convex.query(api.documents.getMyDocumentAccess, { id: docId }),
    ]);

    if (!doc || doc.isTrashed === true || !access.exists || !access.hasAccess) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: jsonHeaders,
      });
    }

    const roomAccess =
      access.role === "viewer" ? session.READ_ACCESS : session.FULL_ACCESS;
    session.allow(room, roomAccess);
  } else {
    session.allow("*", ["comments:read"]);
  }

  try {
    const { status, body } = await session.authorize();
    return new Response(body, { status, headers: jsonHeaders });
  } catch (err) {
    console.error("[liveblocks-auth] session.authorize failed", err);
    return new Response(JSON.stringify({ error: "liveblocks_authorize_failed" }), {
      status: 403,
      headers: jsonHeaders,
    });
  }
}
