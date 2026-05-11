import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { encryptByokApiKey, decryptByokApiKey } from "@/lib/byok-crypto";
import { buildByokKeyPreview, isValidGeminiApiKeyShape } from "@/lib/gemini-api-key";

export async function GET() {
  const { userId, getToken } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });
  const token = await getToken({ template: "convex" });
  if (!token) return new Response("Convex auth missing", { status: 401 });

  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) return new Response("Missing NEXT_PUBLIC_CONVEX_URL", { status: 500 });

  const secret = process.env.BYOK_ENCRYPTION_SECRET;
  if (!secret || secret.length < 16) {
    return new Response("BYOK_ENCRYPTION_SECRET not configured (min 16 chars)", {
      status: 500,
    });
  }

  const convex = new ConvexHttpClient(convexUrl);
  convex.setAuth(token);
  const aiCtx = await convex.query(api.platformSettings.getAiRequestContext, {});
  if (!aiCtx) return new Response("Unauthorized", { status: 401 });
  if (!aiCtx.aiEnabled) {
    return new Response("AI is disabled for this project.", { status: 403 });
  }
  if (!aiCtx.byokEnc) {
    return new Response("No Gemini API key stored for this account.", { status: 404 });
  }

  try {
    const geminiApiKey = decryptByokApiKey(aiCtx.byokEnc, secret);
    return Response.json({ geminiApiKey });
  } catch {
    return new Response("Could not read stored key", { status: 500 });
  }
}

export async function POST(req: Request) {
  const { userId, getToken } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });
  const token = await getToken({ template: "convex" });
  if (!token) return new Response("Convex auth missing", { status: 401 });

  let body: { geminiApiKey?: unknown };
  try {
    body = await req.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  const raw =
    typeof body.geminiApiKey === "string" ? body.geminiApiKey.trim() : "";
  if (!raw) return new Response("Missing geminiApiKey", { status: 400 });
  if (raw.length > 512) return new Response("Key too long", { status: 400 });
  if (!isValidGeminiApiKeyShape(raw)) {
    return new Response(
      'Invalid Gemini API key. Keys from Google AI Studio start with "AIza" and are about 39 characters.',
      { status: 400 },
    );
  }

  const secret = process.env.BYOK_ENCRYPTION_SECRET;
  if (!secret || secret.length < 16) {
    return new Response("BYOK_ENCRYPTION_SECRET not configured (min 16 chars)", {
      status: 500,
    });
  }

  const enc = encryptByokApiKey(raw, secret);
  const keyPreview = buildByokKeyPreview(raw);
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) return new Response("Missing NEXT_PUBLIC_CONVEX_URL", { status: 500 });

  const convex = new ConvexHttpClient(convexUrl);
  convex.setAuth(token);
  const aiCtx = await convex.query(api.platformSettings.getAiRequestContext, {});
  if (!aiCtx) return new Response("Unauthorized", { status: 401 });
  if (!aiCtx.aiEnabled) {
    return new Response("AI is disabled for this project.", { status: 403 });
  }
  await convex.mutation(api.platformSettings.saveMyByokEnc, { enc, keyPreview });
  return Response.json({ ok: true });
}

export async function DELETE() {
  const { userId, getToken } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });
  const token = await getToken({ template: "convex" });
  if (!token) return new Response("Convex auth missing", { status: 401 });

  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) return new Response("Missing NEXT_PUBLIC_CONVEX_URL", { status: 500 });

  const convex = new ConvexHttpClient(convexUrl);
  convex.setAuth(token);
  await convex.mutation(api.platformSettings.clearMyByokEnc, {});
  return Response.json({ ok: true });
}
