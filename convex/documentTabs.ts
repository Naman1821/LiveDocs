import { v } from "convex/values";
import { sameConvexUser } from "./convexUserIdentity";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";

type DocCtx = Pick<MutationCtx, "auth" | "db"> | Pick<QueryCtx, "auth" | "db">;
type CollaboratorEntry = {
  userId: string;
  role: "editor" | "viewer";
};

/** Owner or collaborator with editor role (viewers cannot manage tabs). */
async function assertCanManageTabs(
  ctx: DocCtx,
  documentId: Id<"documents">,
) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthorized");

  const doc = await ctx.db.get(documentId);
  if (!doc) throw new Error("Document not found");

  if (sameConvexUser(doc.ownerId, identity.subject)) return doc;

  const collabs = (doc.collaborators ?? []) as CollaboratorEntry[];
  const hit = collabs.find((c) => sameConvexUser(c.userId, identity.subject));
  if (hit?.role === "editor") return doc;

  throw new Error("Unauthorized");
}

function newTabKey(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) {
    return `t_${c.randomUUID().replace(/-/g, "").slice(0, 12)}`;
  }
  return `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Denormalized `documents.tabs` (id = tabKey); source of truth is `documentTabs` rows. */
export async function syncDocumentTabsSnapshot(
  ctx: MutationCtx,
  documentId: Id<"documents">,
) {
  const rows = await ctx.db
    .query("documentTabs")
    .withIndex("by_document", (q) => q.eq("documentId", documentId))
    .collect();
  const sorted = rows.sort((a, b) => a.sortOrder - b.sortOrder);
  await ctx.db.patch(documentId, {
    tabs: sorted.map((r) => ({ id: r.tabKey, title: r.title })),
    updatedAt: Date.now(),
  });
}

/** Called from `documents` mutations. Requires at least one tab row (e.g. `main`). */
export async function addTabForDocument(
  ctx: MutationCtx,
  args: {
    documentId: Id<"documents">;
    tabTitle?: string | undefined;
    tabKey?: string | undefined;
  },
): Promise<string> {
  await assertCanManageTabs(ctx, args.documentId);

  const rows = await ctx.db
    .query("documentTabs")
    .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
    .collect();

  if (rows.length === 0) {
    throw new Error(
      "Default tab is not ready yet. Wait a moment and try again, or refresh.",
    );
  }

  let tabKey = args.tabKey?.trim() || newTabKey();
  for (let attempt = 0; attempt < 8; attempt++) {
    const clash = await ctx.db
      .query("documentTabs")
      .withIndex("by_document_tabKey", (q) =>
        q.eq("documentId", args.documentId).eq("tabKey", tabKey),
      )
      .unique();
    if (!clash) break;
    if (attempt === 7) {
      throw new Error("Could not allocate a unique tab id");
    }
    tabKey = newTabKey();
  }

  const sortOrder = Math.max(...rows.map((r) => r.sortOrder)) + 1;
  const title =
    args.tabTitle?.trim() && args.tabTitle.trim().length > 0
      ? args.tabTitle.trim()
      : `Tab ${rows.length + 1}`;

  await ctx.db.insert("documentTabs", {
    documentId: args.documentId,
    tabKey,
    title,
    sortOrder,
    createdAt: Date.now(),
  });
  await syncDocumentTabsSnapshot(ctx, args.documentId);
  return tabKey;
}

export async function renameTabForDocument(
  ctx: MutationCtx,
  args: {
    documentId: Id<"documents">;
    tabKey: string;
    title: string;
  },
): Promise<void> {
  await assertCanManageTabs(ctx, args.documentId);

  const row = await ctx.db
    .query("documentTabs")
    .withIndex("by_document_tabKey", (q) =>
      q.eq("documentId", args.documentId).eq("tabKey", args.tabKey),
    )
    .unique();

  if (!row) throw new Error("Tab not found");

  await ctx.db.patch(row._id, {
    title: args.title.trim() || "Untitled tab",
  });
  await syncDocumentTabsSnapshot(ctx, args.documentId);
}

export async function deleteTabForDocument(
  ctx: MutationCtx,
  args: { documentId: Id<"documents">; tabKey: string },
): Promise<string> {
  await assertCanManageTabs(ctx, args.documentId);

  const rows = await ctx.db
    .query("documentTabs")
    .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
    .collect();

  if (rows.length <= 1) {
    throw new Error("Cannot delete the last tab");
  }

  const row = rows.find((r) => r.tabKey === args.tabKey);
  if (!row) throw new Error("Tab not found");

  await ctx.db.delete(row._id);
  await syncDocumentTabsSnapshot(ctx, args.documentId);

  const remaining = await ctx.db
    .query("documentTabs")
    .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
    .collect();
  const sorted = remaining.sort((a, b) => a.sortOrder - b.sortOrder);
  return sorted[0]!.tabKey;
}

export const listTabsForDocument = query({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const doc = await ctx.db.get(args.documentId);
    if (!doc) return [];
    const hasAccess =
      sameConvexUser(doc.ownerId, identity.subject) ||
      (doc.collaborators as CollaboratorEntry[] | undefined)?.some((c) =>
        sameConvexUser(c.userId, identity.subject),
      );
    if (!hasAccess) return [];

    const rows = await ctx.db
      .query("documentTabs")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
      .collect();

    return rows.sort((a, b) => a.sortOrder - b.sortOrder);
  },
});

/** Idempotent: ensures at least one tab (`main`) exists for legacy documents. */
export const ensureInitialTab = mutation({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    await assertCanManageTabs(ctx, args.documentId);

    const existing = await ctx.db
      .query("documentTabs")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
      .collect();

    if (existing.length > 0) {
      await syncDocumentTabsSnapshot(ctx, args.documentId);
      return existing.sort((a, b) => a.sortOrder - b.sortOrder)[0]!.tabKey;
    }

    const now = Date.now();
    await ctx.db.insert("documentTabs", {
      documentId: args.documentId,
      tabKey: "main",
      title: "Tab 1",
      sortOrder: 0,
      createdAt: now,
    });
    await syncDocumentTabsSnapshot(ctx, args.documentId);
    return "main";
  },
});

/** Tab CRUD (same implementation as `documents.addDocumentTab` / rename / delete). */
export const addDocumentTab = mutation({
  args: {
    documentId: v.id("documents"),
    title: v.optional(v.string()),
    tabKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await addTabForDocument(ctx, {
      documentId: args.documentId,
      tabTitle: args.title,
      tabKey: args.tabKey,
    });
  },
});

export const renameTab = mutation({
  args: {
    documentId: v.id("documents"),
    tabKey: v.string(),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    await renameTabForDocument(ctx, args);
  },
});

export const deleteTab = mutation({
  args: {
    documentId: v.id("documents"),
    tabKey: v.string(),
  },
  handler: async (ctx, args) => {
    return await deleteTabForDocument(ctx, args);
  },
});
