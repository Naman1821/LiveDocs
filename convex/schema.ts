import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  documents: defineTable({
    title: v.string(),
    content: v.string(),
    ownerId: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    /** Soft-delete from editor “Move to bin”; omit/false = active document */
    isTrashed: v.optional(v.boolean()),
    isFavorite: v.optional(v.boolean()),
    /** Denormalized tab list (id = tabKey); source of truth rows in `documentTabs`. */
    tabs: v.optional(
      v.array(
        v.object({
          id: v.string(),
          title: v.string(),
        }),
      ),
    ),
    collaborators: v.optional(
      v.array(
        v.object({
          userId: v.string(),
          email: v.string(),
          displayName: v.optional(v.string()),
          role: v.union(v.literal("editor"), v.literal("viewer")),
          addedAt: v.number(),
        }),
      ),
    ),
    accessRequests: v.optional(
      v.array(
        v.object({
          userId: v.string(),
          email: v.string(),
          displayName: v.optional(v.string()),
          requestedAt: v.number(),
          status: v.union(v.literal("pending"), v.literal("denied")),
          /** Public doc: user was on the link block list and sent "Request access" to ask owner to unblock. */
          wantsUnblock: v.optional(v.boolean()),
        }),
      ),
    ),
    /** Liveblocks `(threadId, commentId)` pairs that the document owner has moderated. Used to render "Deleted by owner" on every viewer's panel even when the original author was someone else (or the viewer themselves). */
    moderatedComments: v.optional(
      v.array(
        v.object({
          threadId: v.string(),
          commentId: v.string(),
          at: v.number(),
        }),
      ),
    ),
    /** Omit or `"private"` = only owner + collaborators. `"public"` = signed-in users with the link unless blocked. */
    visibility: v.optional(v.union(v.literal("private"), v.literal("public"))),
    /** Removed / blocked from link access on a public doc until unblocked or explicitly invited. */
    publicAccessBlocks: v.optional(
      v.array(
        v.object({
          userId: v.string(),
          email: v.string(),
          blockedAt: v.number(),
        }),
      ),
    ),
    /** Owner-only: link visitors (non-collaborators) opening a public doc. */
    joinNotifications: v.optional(
      v.array(
        v.object({
          userId: v.string(),
          email: v.string(),
          name: v.optional(v.string()),
          at: v.number(),
        }),
      ),
    ),
  })
    .index("by_owner", ["ownerId"])
    .searchIndex("search_title", {
      searchField: "title",
      filterFields: ["ownerId"],
    }),

  /** Per-tab metadata; Liveblocks room id = `${documentId}_${tabKey}`. */
  documentTabs: defineTable({
    documentId: v.id("documents"),
    tabKey: v.string(),
    title: v.string(),
    sortOrder: v.number(),
    createdAt: v.number(),
  })
    .index("by_document", ["documentId"])
    .index("by_document_tabKey", ["documentId", "tabKey"]),

  /** Singleton row: global AI provider for all users (owner configures). */
  siteSettings: defineTable({
    singletonKey: v.literal("app"),
    aiProvider: v.union(
      v.literal("gemini"),
      v.literal("groq"),
      v.literal("byok"),
    ),
    /** When `aiProvider` is Groq: use Clipdrop text-to-image for /api/ai-image (needs CLIPDROP_API_KEY on Next). */
    groqClipdropImages: v.optional(v.boolean()),
    /** Owner kill-switch: `false` disables AI everywhere. Omit/`true` = AI allowed. */
    aiEnabled: v.optional(v.boolean()),
    /** Owner: hide .docx “import from computer” on templates + editor toolbar when `false`. */
    importFromComputerEnabled: v.optional(v.boolean()),
    updatedAt: v.number(),
  }).index("by_singleton", ["singletonKey"]),

  /** Signed-in users seen by the app (heartbeat). Owner dashboard lists this. */
  appUsers: defineTable({
    clerkUserId: v.string(),
    email: v.string(),
    displayName: v.optional(v.string()),
    lastSeenAt: v.number(),
    /** AES-256-GCM payload (base64) — plaintext only on server when calling Gemini. */
    byokEnc: v.optional(v.string()),
    /** Masked preview only (e.g. `AIzaSy•••…x12`); set when saving BYOK key from the server. */
    byokKeyPreview: v.optional(v.string()),
  }).index("by_clerk", ["clerkUserId"]),
});