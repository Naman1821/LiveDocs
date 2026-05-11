import { v } from "convex/values";
import { sameConvexUser } from "./convexUserIdentity";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, internalQuery } from "./_generated/server";

type AiProvider = "gemini" | "groq" | "byok";

async function getSiteProvider(ctx: QueryCtx | MutationCtx): Promise<AiProvider> {
  const row = await ctx.db
    .query("siteSettings")
    .withIndex("by_singleton", (q) => q.eq("singletonKey", "app"))
    .unique();
  return row?.aiProvider ?? "gemini";
}

export const listAppUsersData = internalQuery({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("appUsers").collect();
    users.sort((a, b) => b.lastSeenAt - a.lastSeenAt);
    return users.map((u) => ({
      _id: u._id,
      clerkUserId: u.clerkUserId,
      email: u.email,
      displayName: u.displayName,
      lastSeenAt: u.lastSeenAt,
      hasByok: !!(u.byokEnc && u.byokEnc.length > 0),
    }));
  },
});

export const getSiteProviderData = internalQuery({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db
      .query("siteSettings")
      .withIndex("by_singleton", (q) => q.eq("singletonKey", "app"))
      .unique();
    const aiProvider = row?.aiProvider ?? "gemini";
    const groqClipdropImages = aiProvider === "groq" && !!row?.groqClipdropImages;
    const aiEnabled = row?.aiEnabled !== false;
    const importFromComputerEnabled = row?.importFromComputerEnabled !== false;
    return { aiProvider, groqClipdropImages, aiEnabled, importFromComputerEnabled };
  },
});

/** Match Convex identity `subject` to a row (ids can differ by `oauth|…` prefix vs bare `user_…`). */
export const getAppUserForConvexSubject = internalQuery({
  args: { subject: v.string() },
  handler: async (ctx, { subject }) => {
    const users = await ctx.db.query("appUsers").collect();
    const row = users.find((u) => sameConvexUser(u.clerkUserId, subject));
    if (!row) return null;
    return { email: row.email, clerkUserId: row.clerkUserId };
  },
});

export const setSiteImportFromComputerEnabled = internalMutation({
  args: { enabled: v.boolean() },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("siteSettings")
      .withIndex("by_singleton", (q) => q.eq("singletonKey", "app"))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        importFromComputerEnabled: args.enabled,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("siteSettings", {
        singletonKey: "app",
        aiProvider: "gemini",
        groqClipdropImages: false,
        importFromComputerEnabled: args.enabled,
        updatedAt: now,
      });
    }
  },
});

export const setSiteAiEnabled = internalMutation({
  args: { enabled: v.boolean() },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("siteSettings")
      .withIndex("by_singleton", (q) => q.eq("singletonKey", "app"))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { aiEnabled: args.enabled, updatedAt: now });
    } else {
      await ctx.db.insert("siteSettings", {
        singletonKey: "app",
        aiProvider: "gemini",
        groqClipdropImages: false,
        aiEnabled: args.enabled,
        updatedAt: now,
      });
    }
  },
});

export const setAiProvider = internalMutation({
  args: {
    aiProvider: v.union(
      v.literal("gemini"),
      v.literal("groq"),
      v.literal("byok"),
    ),
    /** Only honored when `aiProvider` is `groq`; cleared when switching away from Groq. */
    groqClipdropImages: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const clip =
      args.aiProvider === "groq" && args.groqClipdropImages === true ? true : false;
    const existing = await ctx.db
      .query("siteSettings")
      .withIndex("by_singleton", (q) => q.eq("singletonKey", "app"))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        aiProvider: args.aiProvider,
        groqClipdropImages: args.aiProvider === "groq" ? clip : false,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("siteSettings", {
        singletonKey: "app",
        aiProvider: args.aiProvider,
        groqClipdropImages: args.aiProvider === "groq" ? clip : false,
        updatedAt: now,
      });
    }
  },
});

export const clearUserByok = internalMutation({
  args: { clerkUserId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("appUsers")
      .withIndex("by_clerk", (q) => q.eq("clerkUserId", args.clerkUserId))
      .first();
    if (user) await ctx.db.patch(user._id, { byokEnc: undefined, byokKeyPreview: undefined });
  },
});

export const deleteAppUser = internalMutation({
  args: { clerkUserId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("appUsers")
      .withIndex("by_clerk", (q) => q.eq("clerkUserId", args.clerkUserId))
      .first();
    if (user) await ctx.db.delete(user._id);
  },
});
