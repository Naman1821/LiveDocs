# LiveDocs

**LiveDocs** is a production-style collaborative document editor: Google Docs–inspired layout, **real-time multi-user editing** on **Yjs** + **Liveblocks**, rich **TipTap** editing, **Convex** persistence and permissions, **Clerk** authentication, and configurable **AI** (hosted Gemini or Groq, optional **BYOK** Gemini). An **owner dashboard** controls global AI, import policy, and provider settings.

---

## What it does

| Area | Implementation |
|------|------------------|
| **Realtime editing** | Liveblocks rooms; one Y document per **tab** (`documentId_tabKey`). TipTap `Collaboration` on a `Y.Doc` synced via `LiveblocksYjsProvider`. |
| **Editor** | TipTap 3.x: headings, lists, tasks, tables (resize, cell background), links, images (alignable, base64), highlights, fonts, line height, block indent, page breaks, auto-pagination, two-column sections, print-oriented page chrome. |
| **Tabs** | First-class **document tabs** in Convex (`documentTabs`); denormalized snapshot on `documents.tabs`; Liveblocks room id per tab. |
| **Outline** | Left sidebar builds an outline from **heading** nodes in the active tab. |
| **Comments** | Liveblocks threads with metadata (e.g. tab, selection). Comments panel with filters, notifications, owner **moderation** (Convex-backed). |
| **Sharing** | Private by default; optional **public link** with join flow, **access requests**, collaborator **editor / viewer** roles, optional **block list** for public visitors. |
| **Templates** | Dashboard gallery: blank, resume, business letter, brochure-style layouts (HTML seeds in `lib/`). |
| **Import** | **.docx → HTML** via Mammoth (toolbar + owner-toggle to disable “import from computer”). |
| **Export** | **PDF** via `html2pdf.js` from the editor menubar; **print** CSS (`print-layout`) for browser print-to-PDF. |
| **AI** | Server routes for rewrite / image; provider from Convex `siteSettings` (Gemini, Groq, BYOK). Per-user encrypted BYOK storage; **global AI kill-switch** and marquee when off. |
| **Owner ops** | `/owner-dashboard`: AI on/off, provider + Groq image flags, import toggle, listed app users, BYOK clear, etc. (Clerk user id or owner email gate). |

There is **no** built-in document version timeline (like Google Docs “Version history”); collaboration history lives in the realtime layer and Convex document fields.

---

## Tech stack

- **Framework:** [Next.js](https://nextjs.org) 16 (App Router), React 19, TypeScript  
- **UI:** Tailwind CSS 4, Radix primitives / shadcn-style components, `lucide-react`, `zustand`  
- **Auth:** [Clerk](https://clerk.com) (`@clerk/nextjs`)  
- **Backend / DB:** [Convex](https://convex.dev) (queries, mutations, actions, file uploads)  
- **Realtime:** [Liveblocks](https://liveblocks.io) (presence, rooms, comments) + [Yjs](https://yjs.dev)  
- **Editor:** [TipTap](https://tiptap.dev) + `@tiptap/extension-collaboration`, custom extensions under `lib/tiptap/`  
- **Other:** `mammoth` (DOCX), `html2pdf.js` (PDF), `resend` (where wired), `class-variance-authority`, `tailwind-merge`

---

## Repository layout (high level)

```
app/                    # Next.js routes: home, documents, editor [id], sign-in/up, owner-dashboard
app/api/                # Route handlers: Liveblocks auth, AI rewrite/image, BYOK, comment moderation, feedback
components/editor/      # Editor shell: header, toolbar, tabs sidebar, comments, dialogs, TipTap wiring
convex/                 # Schema, documents, tabs, platform settings, owner actions, auth config
lib/                    # Templates HTML, TipTap extensions, Liveblocks room ids, crypto helpers, stores
liveblocks.config.ts    # Thread metadata typing for Liveblocks
```

---

## Prerequisites

- Node.js 20+ (recommended)  
- [Convex](https://dashboard.convex.dev) project + CLI  
- [Clerk](https://dashboard.clerk.com) application  
- [Liveblocks](https://liveblocks.io/dashboard) project (secret key for server routes, public key for client)

---

## Environment variables

Configure in `.env.local` (names may vary slightly; search the repo for `process.env`):

- **Next / Clerk:** `NEXT_PUBLIC_CLERK_*`, Clerk secret key as required by `@clerk/nextjs`  
- **Convex:** `NEXT_PUBLIC_CONVEX_URL`, deploy key for `convex deploy` / `convex dev`  
- **Liveblocks:** secret for `/api/liveblocks-auth`, public key for client room connection  
- **AI:** e.g. Gemini / Groq keys for server routes; optional `CLIPDROP` for Groq image path  
- **Owner dashboard:** `OWNER_EMAIL` and/or `OWNER_CLERK_USER_ID` to restrict `/owner-dashboard`  
- **BYOK:** app secret used with `lib/byok-crypto.ts` for encrypting user keys at rest  

Never commit real secrets; keep them in `.env.local` or your host’s secret store.

---

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Next dev (webpack; uses `scripts/with-project-root.mjs`) |
| `npm run convex:dev` | Convex dev against your deployment |
| `npm run convex:deploy` | Deploy Convex functions/schema |
| `npm run build` / `npm start` | Production build and server |

---

## Development flow

1. Clone the repo and `npm install`.  
2. Create a Convex project, run `npx convex dev`, set `NEXT_PUBLIC_CONVEX_URL`.  
3. Configure Clerk and Liveblocks; wire env vars for auth and room tokens.  
4. Run `npm run dev` and open `/` then `/documents` after signing in.

Convex **schema** and **auth** live under `convex/schema.ts` and `convex/auth.config.ts`. Regenerated types are under `convex/_generated/`.

---

## License

Private project unless you add an explicit `LICENSE` file.
