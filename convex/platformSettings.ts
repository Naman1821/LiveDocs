import { v } from "convex/values";
import {
  clerkUserIdForClerkRestApi,
  sameConvexUser,
} from "./convexUserIdentity";
import type { ActionCtx, MutationCtx, QueryCtx } from "./_generated/server";
import { action, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";

export type AiProvider = "gemini" | "groq" | "byok";

type AppUserIdentity = {
  subject: string;
  tokenIdentifier: string;
  email?: string;
  name?: string;
} & Record<string, unknown>;

function ownerEmailFromEnv(): string {
  return (process.env.OWNER_EMAIL ?? "").trim().toLowerCase();
}

/** Clerk user id (`user_…`) — Convex JWT always includes `subject`; email may be missing. */
function ownerClerkUserIdFromEnv(): string {
  return (process.env.OWNER_CLERK_USER_ID ?? "").trim();
}

function identityEmail(identity: AppUserIdentity): string {
  const maybe = identity.email?.trim();
  if (maybe && maybe.includes("@")) return maybe.toLowerCase();
  for (const key of Object.keys(identity)) {
    if (!/email/i.test(key)) continue;
    const v = identity[key];
    if (typeof v === "string" && v.includes("@")) {
      return v.trim().toLowerCase();
    }
  }
  return "";
}

function identityDisplayName(identity: { name?: string; subject: string }): string {
  const n = identity.name?.trim();
  if (n) return n;
  const s = identity.subject.trim();
  if (s.startsWith("user_")) return s.slice(5);
  return "User";
}

/** JWT often has no email; optional hints come from Clerk `useUser()` on the client. */
function normalizeEmailHint(hint: string | undefined): string {
  const t = (hint ?? "").trim().toLowerCase();
  if (!t.includes("@") || t.length > 320) return "";
  if (t.startsWith("user_")) return "";
  return t;
}

function normalizeDisplayNameHint(hint: string | undefined): string {
  const t = (hint ?? "").trim();
  if (!t || t.length > 200) return "";
  return t;
}

function resolveAppUserEmail(
  identity: AppUserIdentity,
  emailHint: string | undefined,
  existingEmail: string | undefined,
): string {
  const fromJwt = identityEmail(identity);
  if (fromJwt) return fromJwt;
  const fromHint = normalizeEmailHint(emailHint);
  if (fromHint) return fromHint;
  const existing = (existingEmail ?? "").trim().toLowerCase();
  if (existing.includes("@") && !existing.startsWith("user_")) return existing;
  return identity.subject.trim();
}

function resolveAppUserDisplayName(
  identity: { name?: string; subject: string },
  displayNameHint: string | undefined,
): string {
  const fromHint = normalizeDisplayNameHint(displayNameHint);
  if (fromHint) return fromHint;
  return identityDisplayName(identity);
}

/** When JWT has no email, verify `OWNER_EMAIL` against Clerk user (needs CLERK_SECRET_KEY on Convex). */
async function verifyOwnerEmailViaClerkApi(
  clerkUserId: string,
  ownerEmailNormalized: string,
): Promise<boolean> {
  const secret = (process.env.CLERK_SECRET_KEY ?? "").trim();
  if (!secret || !ownerEmailNormalized) return false;
  const res = await fetch(
    `https://api.clerk.com/v1/users/${encodeURIComponent(clerkUserId)}`,
    {
      headers: {
        Authorization: `Bearer ${secret}`,
      },
    },
  );
  if (!res.ok) return false;
  const data = (await res.json()) as {
    email_addresses?: Array<{ email_address?: string }>;
  };
  const target = ownerEmailNormalized.toLowerCase();
  for (const row of data.email_addresses ?? []) {
    const e = (row.email_address ?? "").trim().toLowerCase();
    if (e === target) return true;
  }
  return false;
}

/**
 * List/filter users via Clerk REST and confirm the signed-in Convex `subject` matches a row.
 * OpenAPI uses query name `email_address` (array) — not always `email_address[]` in practice.
 */
async function verifyOwnerEmailViaClerkUserList(
  subject: string,
  tokenIdentifier: string,
  ownerEmailNormalized: string,
): Promise<boolean> {
  const secret = (process.env.CLERK_SECRET_KEY ?? "").trim();
  if (!secret || !ownerEmailNormalized) return false;

  const matchesSignedInUser = (body: unknown): boolean => {
    // Clerk REST often returns User[] at the top level; SDK-style uses { data: User[] }.
    const rows: Array<{ id?: string }> = Array.isArray(body)
      ? (body as Array<{ id?: string }>)
      : ((body as { data?: Array<{ id?: string }> }).data ?? []);
    for (const row of rows) {
      const id = (row.id ?? "").trim();
      if (id && sameConvexUser(subject, id)) return true;
    }
    return false;
  };

  const tryQuery = async (params: URLSearchParams): Promise<boolean> => {
    if (!params.has("limit")) params.set("limit", "25");
    const res = await fetch(
      `https://api.clerk.com/v1/users?${params.toString()}`,
      { headers: { Authorization: `Bearer ${secret}` } },
    );
    if (!res.ok) return false;
    return matchesSignedInUser(await res.json());
  };

  const attempts: URLSearchParams[] = [];

  const byEmail = new URLSearchParams();
  byEmail.append("email_address", ownerEmailNormalized);
  attempts.push(byEmail);

  const byEmailBracket = new URLSearchParams();
  byEmailBracket.append("email_address[]", ownerEmailNormalized);
  attempts.push(byEmailBracket);

  const byQuery = new URLSearchParams();
  byQuery.set("query", ownerEmailNormalized);
  attempts.push(byQuery);

  const clerkId = clerkUserIdForClerkRestApi(subject, tokenIdentifier);
  if (clerkId) {
    const byUserId = new URLSearchParams();
    byUserId.append("user_id", clerkId);
    attempts.push(byUserId);
  }

  for (const p of attempts) {
    if (await tryQuery(p)) return true;
  }
  return false;
}

async function assertOwnerInAction(
  ctx: Pick<ActionCtx, "auth" | "runQuery">,
): Promise<{ subject: string }> {
  const identity = (await ctx.auth.getUserIdentity()) as {
    subject: string;
    email?: string;
    tokenIdentifier: string;
  } | null;
  if (!identity) throw new Error("Unauthorized");

  const ownerUserId = ownerClerkUserIdFromEnv();
  if (ownerUserId) {
    if (sameConvexUser(identity.subject, ownerUserId)) {
      return { subject: identity.subject };
    }
    // `subject` may be non–user_ (e.g. oauth); Clerk user id is often on `tokenIdentifier` after `|`.
    const resolvedId = clerkUserIdForClerkRestApi(
      identity.subject,
      identity.tokenIdentifier ?? "",
    );
    if (resolvedId && sameConvexUser(resolvedId, ownerUserId)) {
      return { subject: identity.subject };
    }
  }

  const owner = ownerEmailFromEnv();
  if (owner) {
    const jwtEmail = identityEmail(identity);
    if (jwtEmail && jwtEmail === owner) return { subject: identity.subject };

    const clerkApiUserId = clerkUserIdForClerkRestApi(
      identity.subject,
      identity.tokenIdentifier ?? "",
    );
    if (clerkApiUserId) {
      const ok = await verifyOwnerEmailViaClerkApi(clerkApiUserId, owner);
      if (ok) return { subject: identity.subject };
    }

    const okList = await verifyOwnerEmailViaClerkUserList(
      identity.subject,
      identity.tokenIdentifier ?? "",
      owner,
    );
    if (okList) return { subject: identity.subject };

    const fromDb = await ctx.runQuery(
      internal.ownerInternal.getAppUserForConvexSubject,
      { subject: identity.subject },
    );
    if (fromDb && fromDb.email.trim().toLowerCase() === owner) {
      return { subject: identity.subject };
    }
  }

  if (!ownerUserId && !owner) {
    throw new Error(
      "Configure OWNER_EMAIL (+ optional CLERK_SECRET_KEY on Convex) or OWNER_CLERK_USER_ID",
    );
  }
  throw new Error(
    "Forbidden: sign in as the owner account, set OWNER_CLERK_USER_ID to your Clerk user id on Convex, or set OWNER_EMAIL to match your Clerk email (and CLERK_SECRET_KEY on Convex if the JWT has no email).",
  );
}

async function getSiteAiRuntimeFlags(ctx: QueryCtx | MutationCtx): Promise<{
  aiProvider: AiProvider;
  groqClipdropImages: boolean;
  aiEnabled: boolean;
  importFromComputerEnabled: boolean;
}> {
  const row = await ctx.db
    .query("siteSettings")
    .withIndex("by_singleton", (q) => q.eq("singletonKey", "app"))
    .unique();
  const aiProvider = (row?.aiProvider ?? "gemini") as AiProvider;
  const groqClipdropImages = aiProvider === "groq" && !!row?.groqClipdropImages;
  const aiEnabled = row?.aiEnabled !== false;
  const importFromComputerEnabled = row?.importFromComputerEnabled !== false;
  return { aiProvider, groqClipdropImages, aiEnabled, importFromComputerEnabled };
}

async function getSiteProvider(ctx: QueryCtx | MutationCtx): Promise<AiProvider> {
  const { aiProvider } = await getSiteAiRuntimeFlags(ctx);
  return aiProvider;
}

export const getAiRuntime = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      const {
        aiProvider,
        groqClipdropImages,
        aiEnabled,
        importFromComputerEnabled,
      } = await getSiteAiRuntimeFlags(ctx);
      return {
        aiProvider,
        hasUserByok: false,
        byokKeyPreview: null,
        groqClipdropImages,
        aiEnabled,
        importFromComputerEnabled,
      };
    }
    const {
      aiProvider,
      groqClipdropImages,
      aiEnabled,
      importFromComputerEnabled,
    } = await getSiteAiRuntimeFlags(ctx);
    const user = await ctx.db
      .query("appUsers")
      .withIndex("by_clerk", (q) => q.eq("clerkUserId", identity.subject))
      .first();
    return {
      aiProvider,
      hasUserByok: !!(user?.byokEnc && user.byokEnc.length > 0),
      byokKeyPreview: user?.byokKeyPreview ?? null,
      groqClipdropImages,
      aiEnabled,
      importFromComputerEnabled,
    };
  },
});

/** Used from Next.js API routes with the caller's Clerk JWT. */
export const getAiRequestContext = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const { aiProvider: provider, groqClipdropImages, aiEnabled } =
      await getSiteAiRuntimeFlags(ctx);
    const user = await ctx.db
      .query("appUsers")
      .withIndex("by_clerk", (q) => q.eq("clerkUserId", identity.subject))
      .first();
    return {
      provider,
      byokEnc: user?.byokEnc ?? null,
      groqClipdropImages,
      aiEnabled,
    };
  },
});

export const recordAppUserHeartbeat = mutation({
  args: {
    emailHint: v.optional(v.string()),
    displayNameHint: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return;
    const now = Date.now();
    const existing = await ctx.db
      .query("appUsers")
      .withIndex("by_clerk", (q) => q.eq("clerkUserId", identity.subject))
      .first();
    const id = identity as AppUserIdentity;
    const email = resolveAppUserEmail(id, args.emailHint, existing?.email);
    const displayName = resolveAppUserDisplayName(id, args.displayNameHint);
    if (existing) {
      await ctx.db.patch(existing._id, {
        email,
        displayName,
        lastSeenAt: now,
      });
    } else {
      await ctx.db.insert("appUsers", {
        clerkUserId: identity.subject,
        email,
        displayName,
        lastSeenAt: now,
      });
    }
  },
});

export const saveMyByokEnc = mutation({
  args: {
    enc: v.string(),
    keyPreview: v.optional(v.string()),
    emailHint: v.optional(v.string()),
    displayNameHint: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    if (args.enc.length > 16_000) throw new Error("Payload too large");
    const previewArg =
      typeof args.keyPreview === "string" && args.keyPreview.trim().length > 0
        ? args.keyPreview.trim().slice(0, 80)
        : undefined;
    const now = Date.now();
    const existing = await ctx.db
      .query("appUsers")
      .withIndex("by_clerk", (q) => q.eq("clerkUserId", identity.subject))
      .first();
    const id = identity as AppUserIdentity;
    const email = resolveAppUserEmail(id, args.emailHint, existing?.email);
    const displayName = resolveAppUserDisplayName(id, args.displayNameHint);
    const nextPreview = previewArg ?? existing?.byokKeyPreview;
    if (existing) {
      await ctx.db.patch(existing._id, {
        byokEnc: args.enc,
        byokKeyPreview: nextPreview,
        lastSeenAt: now,
        email,
        displayName,
      });
    } else {
      await ctx.db.insert("appUsers", {
        clerkUserId: identity.subject,
        email,
        displayName,
        lastSeenAt: now,
        byokEnc: args.enc,
        byokKeyPreview: previewArg,
      });
    }
  },
});

export const clearMyByokEnc = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    const existing = await ctx.db
      .query("appUsers")
      .withIndex("by_clerk", (q) => q.eq("clerkUserId", identity.subject))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { byokEnc: undefined, byokKeyPreview: undefined });
    }
  },
});

// —— Owner dashboard (actions): JWT often omits email; Clerk API verifies OWNER_EMAIL. ——

export const ownerDashboardLoadAction = action({
  args: {},
  handler: async (ctx): Promise<{
    users: Array<{
      _id: string;
      clerkUserId: string;
      email: string;
      displayName?: string;
      lastSeenAt: number;
      hasByok: boolean;
    }>;
    aiProvider: AiProvider;
    groqClipdropImages: boolean;
    aiEnabled: boolean;
    importFromComputerEnabled: boolean;
    /** Convex JWT `subject` for the signed-in owner — match rows with `sameConvexUser`. */
    dashboardOwnerSubject: string;
  }> => {
    const { subject } = await assertOwnerInAction(ctx);
    const users = await ctx.runQuery(internal.ownerInternal.listAppUsersData, {});
    const site = await ctx.runQuery(internal.ownerInternal.getSiteProviderData, {});
    return {
      users,
      aiProvider: site.aiProvider as AiProvider,
      groqClipdropImages: site.groqClipdropImages,
      aiEnabled: site.aiEnabled,
      importFromComputerEnabled: site.importFromComputerEnabled,
      dashboardOwnerSubject: subject,
    };
  },
});

export const ownerSetImportFromComputerEnabledAction = action({
  args: { enabled: v.boolean() },
  handler: async (ctx, args) => {
    await assertOwnerInAction(ctx);
    await ctx.runMutation(internal.ownerInternal.setSiteImportFromComputerEnabled, {
      enabled: args.enabled,
    });
  },
});

export const ownerSetAiEnabledAction = action({
  args: { enabled: v.boolean() },
  handler: async (ctx, args) => {
    await assertOwnerInAction(ctx);
    await ctx.runMutation(internal.ownerInternal.setSiteAiEnabled, {
      enabled: args.enabled,
    });
  },
});

export const ownerSetAiProviderAction = action({
  args: {
    aiProvider: v.union(
      v.literal("gemini"),
      v.literal("groq"),
      v.literal("byok"),
    ),
    groqClipdropImages: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await assertOwnerInAction(ctx);
    await ctx.runMutation(internal.ownerInternal.setAiProvider, {
      aiProvider: args.aiProvider,
      groqClipdropImages: args.groqClipdropImages,
    });
  },
});

export const ownerClearUserByokAction = action({
  args: { clerkUserId: v.string() },
  handler: async (ctx, args) => {
    await assertOwnerInAction(ctx);
    await ctx.runMutation(internal.ownerInternal.clearUserByok, {
      clerkUserId: args.clerkUserId,
    });
  },
});

export const ownerDeleteAppUserAction = action({
  args: { clerkUserId: v.string() },
  handler: async (ctx, args) => {
    const { subject } = await assertOwnerInAction(ctx);
    if (sameConvexUser(args.clerkUserId, subject)) {
      throw new Error("Cannot remove owner row");
    }
    await ctx.runMutation(internal.ownerInternal.deleteAppUser, {
      clerkUserId: args.clerkUserId,
    });
  },
});
