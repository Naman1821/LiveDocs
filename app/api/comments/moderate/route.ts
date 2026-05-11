import { Liveblocks } from "@liveblocks/node";
import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

const liveblocks = new Liveblocks({
  secret: process.env.LIVEBLOCKS_SECRET_KEY!,
});

/**
 * Owner moderation for Liveblocks Comments.
 *
 * The Liveblocks client SDK only lets a user delete *their own* comment.
 * The owner of a document needs to be able to delete anyone's comment so
 * everyone in the room sees the standard "Deleted" tombstone.
 *
 * This route uses the Node SDK (admin secret) to perform the delete after
 * we verify the requester is the document's owner via Convex.
 *
 * Body shape:
 *   - { roomId, threadId, commentId } → delete a single comment (kept as
 *     a tombstone in the thread; clients render the existing "Deleted by
 *     owner" caption because the thread author is the doc owner)
 *   - { roomId, threadId }            → delete the whole thread (room-wide)
 */
export async function POST(req: Request) {
  const { userId, getToken } = await auth();
  if (!userId) {
    return new Response("Unauthorized", { status: 401 });
  }

  let payload: { roomId?: unknown; threadId?: unknown; commentId?: unknown };
  try {
    payload = await req.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const roomId = typeof payload.roomId === "string" ? payload.roomId : "";
  const threadId = typeof payload.threadId === "string" ? payload.threadId : "";
  const commentId =
    typeof payload.commentId === "string" && payload.commentId.length > 0
      ? payload.commentId
      : undefined;

  if (!roomId || !threadId) {
    return new Response("Missing roomId or threadId", { status: 400 });
  }

  /** Rooms are `${documentId}_${tabKey}` (matches lib/liveblocks-room.ts). */
  const underscore = roomId.indexOf("_");
  const documentIdStr = underscore === -1 ? roomId : roomId.slice(0, underscore);
  if (!documentIdStr) {
    return new Response("Invalid roomId", { status: 400 });
  }

  const token = await getToken({ template: "convex" });
  if (!token) {
    return new Response("Convex auth missing", { status: 401 });
  }

  const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  convex.setAuth(token);

  const doc = await convex.query(api.documents.getDocumentById, {
    id: documentIdStr as Id<"documents">,
  });

  if (!doc || doc.isTrashed === true) {
    return new Response("Forbidden", { status: 403 });
  }

  if (doc.ownerId !== userId) {
    return new Response("Only the document owner can moderate comments", {
      status: 403,
    });
  }

  try {
    if (commentId) {
      await liveblocks.deleteComment({ roomId, threadId, commentId });
    } else {
      await liveblocks.deleteThread({ roomId, threadId });
    }
  } catch (err) {
    console.error("[comments/moderate] liveblocks delete failed", err);
    return new Response("Liveblocks delete failed", { status: 502 });
  }

  try {
    await convex.mutation(api.documents.recordModeratedComment, {
      documentId: documentIdStr as Id<"documents">,
      threadId,
      commentId,
    });
  } catch (err) {
    // Liveblocks delete already succeeded; the marker is a UX nicety so we
    // log and continue rather than fail the request.
    console.error("[comments/moderate] recordModeratedComment failed", err);
  }

  return new Response(null, { status: 204 });
}
