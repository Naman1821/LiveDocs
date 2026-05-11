import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/** Epic 5: client uploads image bytes here, then resolves a public URL. */
export const generateImageUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    return await ctx.storage.generateUploadUrl();
  },
});

export const getImageUrl = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    return await ctx.storage.getUrl(args.storageId);
  },
});

/** After client POSTs bytes to `generateImageUploadUrl`, resolve a usable `src`. */
export const finalizeImageUpload = mutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    const url = await ctx.storage.getUrl(args.storageId);
    if (!url) throw new Error("Could not resolve file URL");
    return url;
  },
});
