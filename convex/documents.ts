import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import {
  addTabForDocument,
  deleteTabForDocument,
  renameTabForDocument,
  syncDocumentTabsSnapshot,
} from "./documentTabs";
import { convexUserKey, sameConvexUser } from "./convexUserIdentity";
import { templateTitleAndHtml } from "./templateContent";

type CollaboratorRole = "editor" | "viewer";
type CollaboratorEntry = {
  userId: string;
  email: string;
  displayName?: string;
  role: CollaboratorRole;
  addedAt: number;
};
type AccessRequestEntry = {
  userId: string;
  email: string;
  displayName?: string;
  requestedAt: number;
  status: "pending" | "denied";
  /** Public doc only: blocked link visitor re-requesting access. */
  wantsUnblock?: boolean;
};

type PublicAccessBlock = {
  userId: string;
  email: string;
  blockedAt: number;
};

const MAX_PUBLIC_BLOCKS = 80;
const MAX_JOIN_NOTIFICATIONS = 80;

function readPublicAccessBlocks(doc: {
  publicAccessBlocks?: PublicAccessBlock[];
}): PublicAccessBlock[] {
  return doc.publicAccessBlocks ?? [];
}

function isDocOwner(doc: { ownerId: string }, subject: string): boolean {
  return sameConvexUser(doc.ownerId, subject);
}

function isDocumentPublic(doc: { visibility?: "public" | "private" }): boolean {
  return doc.visibility === "public";
}

function isBlockedFromPublic(doc: { publicAccessBlocks?: PublicAccessBlock[] }, userId: string) {
  return readPublicAccessBlocks(doc).some((b) => sameConvexUser(b.userId, userId));
}

function withoutPublicBlockForUser(
  blocks: PublicAccessBlock[],
  userId: string,
): PublicAccessBlock[] {
  return blocks.filter((b) => !sameConvexUser(b.userId, userId));
}

function upsertPublicBlock(
  blocks: PublicAccessBlock[],
  userId: string,
  email: string,
  now: number,
): PublicAccessBlock[] {
  const next = withoutPublicBlockForUser(blocks, userId);
  next.push({
    userId,
    email: email.trim() || "unknown",
    blockedAt: now,
  });
  return next.slice(-MAX_PUBLIC_BLOCKS);
}

/**
 * Owner or listed collaborator, or implicit viewer on a public doc (if not blocked).
 */
function effectiveDocumentRole(
  doc: {
    ownerId: string;
    collaborators?: CollaboratorEntry[];
    visibility?: "public" | "private";
    publicAccessBlocks?: PublicAccessBlock[];
    isTrashed?: boolean;
  },
  userId: string,
): "owner" | CollaboratorRole | null {
  if (doc.isTrashed === true) return null;
  const explicit = getCollaboratorRole(doc, userId);
  if (explicit) return explicit;
  if (isDocumentPublic(doc) && !isBlockedFromPublic(doc, userId)) {
    return "viewer";
  }
  return null;
}

function identityEmail(identity: { email?: string; tokenIdentifier: string }): string {
  const maybe = identity.email?.trim();
  if (maybe && maybe.includes("@")) return maybe.toLowerCase();
  return "";
}

function identityDisplayName(identity: { name?: string; subject: string }): string {
  const n = identity.name?.trim();
  if (n) return n;
  const s = identity.subject.trim();
  if (s.startsWith("user_")) return s.slice(5);
  return "collaborator";
}

function readCollaborators(doc: {
  collaborators?: CollaboratorEntry[];
}): CollaboratorEntry[] {
  return doc.collaborators ?? [];
}

function readAccessRequests(doc: {
  accessRequests?: AccessRequestEntry[];
}): AccessRequestEntry[] {
  return doc.accessRequests ?? [];
}

function getCollaboratorRole(
  doc: { ownerId: string; collaborators?: CollaboratorEntry[] },
  userId: string,
): "owner" | CollaboratorRole | null {
  if (isDocOwner(doc, userId)) return "owner";
  const hit = readCollaborators(doc).find((c) => sameConvexUser(c.userId, userId));
  return hit?.role ?? null;
}

async function insertDocumentRecord(
  ctx: MutationCtx,
  ownerId: string,
  input: {
    title?: string | undefined;
    templateType?: string | undefined;
    /** When set (including `""`), wins over `templateType` for body HTML. */
    initialContent?: string | undefined;
  },
): Promise<Id<"documents">> {
  const now = Date.now();

  let title = input.title?.trim() ?? "";
  let content = "";

  if (input.initialContent !== undefined) {
    content = input.initialContent;
    title = title.length > 0 ? title : "Untitled document";
  } else if (input.templateType) {
    const t = templateTitleAndHtml(input.templateType);
    title = t.title;
    content = t.html;
  } else {
    title = title.length > 0 ? title : "Untitled document";
  }

  const documentId = await ctx.db.insert("documents", {
    title,
    content,
    ownerId,
    createdAt: now,
    updatedAt: now,
    tabs: [{ id: "main", title: "Tab 1" }],
  });

  await ctx.db.insert("documentTabs", {
    documentId,
    tabKey: "main",
    title: "Tab 1",
    sortOrder: 0,
    createdAt: now,
  });

  await syncDocumentTabsSnapshot(ctx, documentId);

  return documentId;
}

export const createDocument = mutation({
  args: {
    title: v.optional(v.string()),
    /** Dashboard template id (e.g. `resume-coral`, `blank`). Ignored if `initialContent` is set. */
    templateType: v.optional(v.string()),
    /** HTML snapshot for new doc (e.g. gallery engine or Mammoth import). */
    initialContent: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }
    return await insertDocumentRecord(ctx, identity.subject, {
      title: args.title,
      templateType: args.templateType,
      initialContent: args.initialContent,
    });
  },
});

/** Template gallery: requires a non-empty `templateType` (Convex-validated). */
export const createDocumentFromTemplate = mutation({
  args: { templateType: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }
    return await insertDocumentRecord(ctx, identity.subject, {
      templateType: args.templateType,
    });
  },
});

/** Adds a tab row after the default tab exists (`ensureInitialTab` / new documents). */
export const addDocumentTab = mutation({
  args: {
    documentId: v.id("documents"),
    tabTitle: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await addTabForDocument(ctx, {
      documentId: args.documentId,
      tabTitle: args.tabTitle,
    });
  },
});

export const renameDocumentTab = mutation({
  args: {
    documentId: v.id("documents"),
    tabKey: v.string(),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    await renameTabForDocument(ctx, {
      documentId: args.documentId,
      tabKey: args.tabKey,
      title: args.title,
    });
  },
});

export const deleteDocumentTab = mutation({
  args: {
    documentId: v.id("documents"),
    tabKey: v.string(),
  },
  handler: async (ctx, args) => {
    return await deleteTabForDocument(ctx, {
      documentId: args.documentId,
      tabKey: args.tabKey,
    });
  },
});

export const toggleFavorite = mutation({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const doc = await ctx.db.get(args.id);
    if (!doc || !isDocOwner(doc, identity.subject)) {
      throw new Error("Document not found");
    }
    if (doc.isTrashed === true) throw new Error("Invalid document");

    await ctx.db.patch(args.id, {
      isFavorite: !(doc.isFavorite === true),
      updatedAt: Date.now(),
    });
  },
});

export const getDocuments = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();

    if (!identity) {
      return [];
    }

    const rows = await ctx.db
      .query("documents")
      .withIndex("by_owner", (q) => q.eq("ownerId", identity.subject))
      .order("desc")
      .collect();

    return rows.filter((d) => d.isTrashed !== true);
  },
});

export const getDocumentById = query({
  args: {
    id: v.id("documents"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const doc = await ctx.db.get(args.id);
    if (!doc) return null;

    if (!effectiveDocumentRole(doc, identity.subject)) return null;

    if (doc.isTrashed === true) return null;

    if (!isDocOwner(doc, identity.subject)) {
      const {
        publicAccessBlocks: _omitBlocks,
        joinNotifications: _omitJoins,
        ...rest
      } = doc;
      void _omitBlocks;
      void _omitJoins;
      return rest;
    }

    return doc;
  },
});

/** Owner-only: block list + join feed so the UI always subscribes even if `getDocumentById` omits fields. */
export const getDocumentOwnerSidecar = query({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const doc = await ctx.db.get(args.id);
    if (!doc || doc.isTrashed === true) return null;
    if (!isDocOwner(doc, identity.subject)) return null;
    return {
      publicAccessBlocks: readPublicAccessBlocks(doc),
      joinNotifications: doc.joinNotifications ?? [],
    };
  },
});

export const getMyDocumentAccess = query({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return {
        exists: false,
        hasAccess: false,
        role: null as "owner" | CollaboratorRole | null,
        requestStatus: "none" as "none" | "pending" | "denied",
      };
    }
    const doc = await ctx.db.get(args.id);
    if (!doc || doc.isTrashed === true) {
      return {
        exists: false,
        hasAccess: false,
        role: null as "owner" | CollaboratorRole | null,
        requestStatus: "none" as "none" | "pending" | "denied",
      };
    }
    const role = effectiveDocumentRole(doc, identity.subject);
    const req = readAccessRequests(doc).find((r) =>
      sameConvexUser(r.userId, identity.subject),
    );
    return {
      exists: true,
      hasAccess: role !== null,
      role,
      requestStatus: req?.status ?? "none",
    };
  },
});

export const requestAccess = mutation({
  args: {
    id: v.id("documents"),
    requesterEmail: v.optional(v.string()),
    requesterName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    const doc = await ctx.db.get(args.id);
    if (!doc || doc.isTrashed === true) throw new Error("Document not found");

    if (effectiveDocumentRole(doc, identity.subject)) {
      return { status: "already_has_access" as const };
    }

    const current = readAccessRequests(doc);
    const now = Date.now();
    const email = (args.requesterEmail?.trim().toLowerCase() || identityEmail(identity)).trim();
    const displayName = (args.requesterName?.trim() || identityDisplayName(identity)).trim();
    const next = current.filter((r) => !sameConvexUser(r.userId, identity.subject));
    const wantsUnblock =
      isDocumentPublic(doc) && isBlockedFromPublic(doc, identity.subject);
    next.push({
      userId: identity.subject,
      email,
      displayName,
      requestedAt: now,
      status: "pending",
      ...(wantsUnblock ? { wantsUnblock: true as const } : {}),
    });
    await ctx.db.patch(args.id, {
      accessRequests: next,
      updatedAt: now,
    });
    return { status: "requested" as const };
  },
});

export const syncMyAccessIdentity = mutation({
  args: {
    id: v.id("documents"),
    email: v.optional(v.string()),
    displayName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const doc = await ctx.db.get(args.id);
    if (!doc || doc.isTrashed === true) throw new Error("Document not found");

    const role = effectiveDocumentRole(doc, identity.subject);
    if (!role) throw new Error("Unauthorized");

    const inCollaborators = readCollaborators(doc).some((c) =>
      sameConvexUser(c.userId, identity.subject),
    );
    if (!inCollaborators) {
      return { updated: false as const };
    }

    const email = (args.email?.trim().toLowerCase() || identityEmail(identity)).trim();
    const displayName = (args.displayName?.trim() || identityDisplayName(identity)).trim();

    let changed = false;
    const nextCollaborators = readCollaborators(doc).map((c) => {
      if (!sameConvexUser(c.userId, identity.subject)) return c;
      const nextEmail = c.email || email;
      const nextName = c.displayName || displayName;
      if (nextEmail !== c.email || nextName !== c.displayName) changed = true;
      return {
        ...c,
        email: nextEmail,
        displayName: nextName,
      };
    });

    if (!changed) return { updated: false as const };

    await ctx.db.patch(args.id, {
      collaborators: nextCollaborators,
      updatedAt: Date.now(),
    });

    return { updated: true as const };
  },
});

export const listPendingAccessRequests = query({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const doc = await ctx.db.get(args.id);
    if (!doc || !isDocOwner(doc, identity.subject) || doc.isTrashed === true) return [];
    return readAccessRequests(doc)
      .filter((r) => r.status === "pending")
      .sort((a, b) => b.requestedAt - a.requestedAt);
  },
});

export const respondToAccessRequest = mutation({
  args: {
    id: v.id("documents"),
    requesterUserId: v.string(),
    decision: v.union(v.literal("accept"), v.literal("deny")),
    role: v.optional(v.union(v.literal("editor"), v.literal("viewer"))),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    const doc = await ctx.db.get(args.id);
    if (!doc || !isDocOwner(doc, identity.subject) || doc.isTrashed === true) {
      throw new Error("Unauthorized");
    }
    const now = Date.now();
    const requests = readAccessRequests(doc);
    const existing = requests.find((r) => sameConvexUser(r.userId, args.requesterUserId));
    if (!existing) throw new Error("Request not found");
    if (args.decision === "accept" && existing.wantsUnblock === true) {
      throw new Error(
        "This request is only to remove the link block. Use Unblock — then set editor/viewer from People when they are online.",
      );
    }

    const nextRequests = requests
      .filter((r) => !sameConvexUser(r.userId, args.requesterUserId))
      .concat(
        args.decision === "deny"
          ? [{ ...existing, status: "denied" as const, requestedAt: now }]
          : [],
      );

    const nextCollaborators = readCollaborators(doc).filter(
      (c) => !sameConvexUser(c.userId, args.requesterUserId),
    );
    let nextBlocks = readPublicAccessBlocks(doc);
    if (args.decision === "accept") {
      nextCollaborators.push({
        userId: existing.userId,
        email: existing.email,
        displayName: existing.displayName,
        role: args.role ?? "viewer",
        addedAt: now,
      });
      nextBlocks = withoutPublicBlockForUser(nextBlocks, existing.userId);
    }

    await ctx.db.patch(args.id, {
      accessRequests: nextRequests,
      collaborators: nextCollaborators,
      publicAccessBlocks: nextBlocks.length > 0 ? nextBlocks : undefined,
      updatedAt: now,
    });
  },
});

/** Public doc: pending request with `wantsUnblock` — remove link block only; does not add collaborator. */
export const grantLinkUnblockRequest = mutation({
  args: {
    id: v.id("documents"),
    requesterUserId: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    const doc = await ctx.db.get(args.id);
    if (!doc || !isDocOwner(doc, identity.subject) || doc.isTrashed === true) {
      throw new Error("Unauthorized");
    }
    if (!isDocumentPublic(doc)) throw new Error("Only for public documents");

    const requests = readAccessRequests(doc);
    const existing = requests.find((r) => sameConvexUser(r.userId, args.requesterUserId));
    if (!existing || existing.status !== "pending") {
      throw new Error("Request not found");
    }
    if (existing.wantsUnblock !== true) {
      throw new Error("Not a link-unblock request");
    }

    const now = Date.now();
    const nextRequests = requests.filter(
      (r) => !sameConvexUser(r.userId, args.requesterUserId),
    );
    const nextBlocks = withoutPublicBlockForUser(
      readPublicAccessBlocks(doc),
      existing.userId,
    );

    await ctx.db.patch(args.id, {
      accessRequests: nextRequests.length > 0 ? nextRequests : undefined,
      publicAccessBlocks: nextBlocks.length > 0 ? nextBlocks : undefined,
      updatedAt: now,
    });
  },
});

export const setCollaboratorRole = mutation({
  args: {
    id: v.id("documents"),
    collaboratorUserId: v.string(),
    role: v.union(v.literal("editor"), v.literal("viewer")),
    email: v.optional(v.string()),
    displayName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    const doc = await ctx.db.get(args.id);
    if (!doc || !isDocOwner(doc, identity.subject) || doc.isTrashed === true) {
      throw new Error("Unauthorized");
    }
    const current = readCollaborators(doc);
    const hit = current.find((c) => sameConvexUser(c.userId, args.collaboratorUserId));
    const now = Date.now();
    let next: CollaboratorEntry[];
    let nextBlocks = readPublicAccessBlocks(doc);

    if (!hit) {
      if (!isDocumentPublic(doc)) {
        throw new Error("Collaborator not found");
      }
      const email =
        (args.email?.trim().toLowerCase() || "").trim() || "guest@unknown.invalid";
      const displayName = (args.displayName?.trim() || "").trim() || undefined;
      next = [
        ...current,
        {
          userId: args.collaboratorUserId,
          email,
          displayName,
          role: args.role,
          addedAt: now,
        },
      ];
      nextBlocks = withoutPublicBlockForUser(nextBlocks, args.collaboratorUserId);
    } else {
      next = current.map((c) =>
        sameConvexUser(c.userId, args.collaboratorUserId) ? { ...c, role: args.role } : c,
      );
    }

    await ctx.db.patch(args.id, {
      collaborators: next,
      publicAccessBlocks: nextBlocks.length > 0 ? nextBlocks : undefined,
      updatedAt: now,
    });
  },
});

export const removeCollaborator = mutation({
  args: {
    id: v.id("documents"),
    collaboratorUserId: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    const doc = await ctx.db.get(args.id);
    if (!doc || !isDocOwner(doc, identity.subject) || doc.isTrashed === true) {
      throw new Error("Unauthorized");
    }
    const current = readCollaborators(doc);
    const hit = current.find((c) => sameConvexUser(c.userId, args.collaboratorUserId));
    if (!hit) return;
    const now = Date.now();
    const next = current.filter((c) => !sameConvexUser(c.userId, args.collaboratorUserId));
    let nextBlocks = readPublicAccessBlocks(doc);
    if (isDocumentPublic(doc)) {
      nextBlocks = upsertPublicBlock(
        nextBlocks,
        args.collaboratorUserId,
        hit.email || "",
        now,
      );
    }
    await ctx.db.patch(args.id, {
      collaborators: next,
      publicAccessBlocks: nextBlocks.length > 0 ? nextBlocks : undefined,
      updatedAt: now,
    });
  },
});

export const setDocumentVisibility = mutation({
  args: {
    id: v.id("documents"),
    visibility: v.union(v.literal("private"), v.literal("public")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    const doc = await ctx.db.get(args.id);
    if (!doc || !isDocOwner(doc, identity.subject) || doc.isTrashed === true) {
      throw new Error("Unauthorized");
    }
    await ctx.db.patch(args.id, {
      visibility: args.visibility,
      updatedAt: Date.now(),
    });
  },
});

export const blockPublicVisitor = mutation({
  args: {
    id: v.id("documents"),
    userId: v.string(),
    email: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    const doc = await ctx.db.get(args.id);
    if (!doc || !isDocOwner(doc, identity.subject) || doc.isTrashed === true) {
      throw new Error("Unauthorized");
    }
    if (!isDocumentPublic(doc)) throw new Error("Document is not public");
    if (isDocOwner(doc, args.userId)) throw new Error("Invalid user");

    const now = Date.now();
    const email = (args.email?.trim().toLowerCase() || "").trim() || "unknown";
    const nextBlocks = upsertPublicBlock(readPublicAccessBlocks(doc), args.userId, email, now);
    await ctx.db.patch(args.id, {
      publicAccessBlocks: nextBlocks,
      updatedAt: now,
    });
  },
});

export const unblockPublicVisitor = mutation({
  args: {
    id: v.id("documents"),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    const doc = await ctx.db.get(args.id);
    if (!doc || !isDocOwner(doc, identity.subject) || doc.isTrashed === true) {
      throw new Error("Unauthorized");
    }
    const next = withoutPublicBlockForUser(readPublicAccessBlocks(doc), args.userId);
    await ctx.db.patch(args.id, {
      publicAccessBlocks: next.length > 0 ? next : undefined,
      updatedAt: Date.now(),
    });
  },
});

export const recordPublicDocumentJoin = mutation({
  args: {
    id: v.id("documents"),
    /** Clerk profile (Convex JWT often omits email); improves “Recent joins” labels. */
    clientEmail: v.optional(v.string()),
    clientName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    const doc = await ctx.db.get(args.id);
    if (!doc || doc.isTrashed === true) return;
    if (!isDocumentPublic(doc)) return;
    if (isDocOwner(doc, identity.subject)) return;
    if (readCollaborators(doc).some((c) => sameConvexUser(c.userId, identity.subject))) return;
    if (isBlockedFromPublic(doc, identity.subject)) return;

    const existing = doc.joinNotifications ?? [];
    const recent = existing.filter((n) => sameConvexUser(n.userId, identity.subject)).pop();
    const now = Date.now();
    if (recent && now - recent.at < 10 * 60 * 1000) {
      return;
    }

    const clientMail = (args.clientEmail?.trim().toLowerCase() ?? "").trim();
    const jwtMail = identityEmail(identity).trim().toLowerCase();
    const email =
      (clientMail.includes("@") ? clientMail : "") ||
      (jwtMail.includes("@") ? jwtMail : "") ||
      identity.subject.trim();

    const clientNm = (args.clientName?.trim() ?? "").trim();
    const name =
      clientNm ||
      (clientMail.includes("@") ? (clientMail.split("@")[0] ?? "").trim() : "") ||
      (jwtMail.includes("@") ? (jwtMail.split("@")[0] ?? "").trim() : "") ||
      identity.name?.trim() ||
      identityDisplayName(identity);

    const next = [
      ...existing,
      { userId: identity.subject, email, name, at: now },
    ].slice(-MAX_JOIN_NOTIFICATIONS);

    await ctx.db.patch(args.id, {
      joinNotifications: next,
      updatedAt: now,
    });
  },
});

export const clearJoinNotifications = mutation({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    const doc = await ctx.db.get(args.id);
    if (!doc || !isDocOwner(doc, identity.subject) || doc.isTrashed === true) {
      throw new Error("Unauthorized");
    }
    await ctx.db.patch(args.id, {
      joinNotifications: undefined,
      updatedAt: Date.now(),
    });
  },
});

export const duplicateDocument = mutation({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const existing = await ctx.db.get(args.id);
    if (!existing || !isDocOwner(existing, identity.subject)) {
      throw new Error("Document not found");
    }
    if (existing.isTrashed === true) {
      throw new Error("Cannot duplicate a document in the bin");
    }

    const now = Date.now();
    const baseTitle = existing.title.trim() || "Untitled document";
    const title = baseTitle.startsWith("Copy of ")
      ? baseTitle
      : `Copy of ${baseTitle}`;

    const newId = await ctx.db.insert("documents", {
      title,
      content: existing.content,
      ownerId: identity.subject,
      createdAt: now,
      updatedAt: now,
      tabs: [{ id: "main", title: "Tab 1" }],
    });

    const oldTabs = await ctx.db
      .query("documentTabs")
      .withIndex("by_document", (q) => q.eq("documentId", args.id))
      .collect();

    const sortedTabs = oldTabs.sort((a, b) => a.sortOrder - b.sortOrder);
    if (sortedTabs.length === 0) {
      await ctx.db.insert("documentTabs", {
        documentId: newId,
        tabKey: "main",
        title: "Tab 1",
        sortOrder: 0,
        createdAt: now,
      });
    } else {
      for (const tab of sortedTabs) {
        await ctx.db.insert("documentTabs", {
          documentId: newId,
          tabKey: tab.tabKey,
          title: tab.title,
          sortOrder: tab.sortOrder,
          createdAt: now,
        });
      }
    }

    await syncDocumentTabsSnapshot(ctx, newId);

    return newId;
  },
});

export const moveDocumentToBin = mutation({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const existing = await ctx.db.get(args.id);
    if (!existing || !isDocOwner(existing, identity.subject)) {
      throw new Error("Document not found");
    }

    await ctx.db.patch(args.id, {
      isTrashed: true,
      updatedAt: Date.now(),
    });
  },
});

export const updateDocument = mutation({
  args: {
    id: v.id("documents"),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    isFavorite: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    const existing = await ctx.db.get(args.id);
    if (!existing) {
      throw new Error("Document not found");
    }

    const role = effectiveDocumentRole(existing, identity.subject);
    if (role !== "owner" && role !== "editor") {
      throw new Error("Unauthorized");
    }

    const patch: {
      title?: string;
      content?: string;
      isFavorite?: boolean;
      updatedAt: number;
    } = {
      updatedAt: Date.now(),
    };

    if (args.title !== undefined) {
      patch.title = args.title;
    }

    if (args.content !== undefined) {
      patch.content = args.content;
    }

    if (args.isFavorite !== undefined) {
      patch.isFavorite = args.isFavorite;
    }

    await ctx.db.patch(args.id, patch);
  },
});

export const deleteDocument = mutation({
  args: {
    id: v.id("documents"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    const existing = await ctx.db.get(args.id);
    if (!existing) {
      return;
    }

    if (!isDocOwner(existing, identity.subject)) {
      throw new Error("Unauthorized");
    }

    const tabs = await ctx.db
      .query("documentTabs")
      .withIndex("by_document", (q) => q.eq("documentId", args.id))
      .collect();

    for (const tab of tabs) {
      await ctx.db.delete(tab._id);
    }

    await ctx.db.delete(args.id);
  },
});

/**
 * Records that the document owner moderated (deleted) a Liveblocks comment
 * so every viewer's UI can render "Deleted by owner" instead of the default
 * Liveblocks tombstone (which can't tell us who actually deleted).
 *
 * Owner-only. The matching Liveblocks delete is performed in the
 * `/api/comments/moderate` Next.js route which calls this right after.
 */
export const recordModeratedComment = mutation({
  args: {
    documentId: v.id("documents"),
    threadId: v.string(),
    commentId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const doc = await ctx.db.get(args.documentId);
    if (!doc) throw new Error("Document not found");
    if (!isDocOwner(doc, identity.subject)) {
      throw new Error("Only the document owner can moderate comments");
    }

    if (!args.commentId) {
      // Whole-thread deletes don't need a per-comment marker; the entire
      // thread disappears from Liveblocks for all clients.
      return;
    }

    const existing = doc.moderatedComments ?? [];
    if (
      existing.some(
        (m) => m.threadId === args.threadId && m.commentId === args.commentId,
      )
    ) {
      return;
    }

    await ctx.db.patch(args.documentId, {
      moderatedComments: [
        ...existing,
        { threadId: args.threadId, commentId: args.commentId, at: Date.now() },
      ],
      updatedAt: Date.now(),
    });
  },
});
