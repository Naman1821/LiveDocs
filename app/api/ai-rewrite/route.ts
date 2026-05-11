import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { decryptByokApiKey } from "@/lib/byok-crypto";
import {
  buildAiEditorPrompt,
  extractJsonCandidate,
  geminiGenerateText,
  groqGenerateText,
  normalizeAiPayload,
} from "@/lib/server-ai";

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.1-8b-instant";

export async function POST(req: Request) {
  const { userId, getToken } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const token = await getToken({ template: "convex" });
  if (!token) return new Response("Convex auth missing", { status: 401 });

  let body: { selectedText?: unknown; instruction?: unknown };
  try {
    body = await req.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const selectedText =
    typeof body.selectedText === "string" ? body.selectedText.trim() : "";
  const instruction =
    typeof body.instruction === "string" ? body.instruction.trim() : "";

  if (!selectedText || !instruction) {
    return new Response("Missing selectedText or instruction", { status: 400 });
  }
  if (selectedText.length > 8000 || instruction.length > 1000) {
    return new Response("Input too large", { status: 413 });
  }

  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    return new Response("Missing NEXT_PUBLIC_CONVEX_URL", { status: 500 });
  }

  const convex = new ConvexHttpClient(convexUrl);
  convex.setAuth(token);

  const aiCtx = await convex.query(api.platformSettings.getAiRequestContext, {});
  if (!aiCtx) return new Response("Unauthorized", { status: 401 });
  if (!aiCtx.aiEnabled) {
    return new Response("AI is disabled for this project.", { status: 403 });
  }

  const prompt = buildAiEditorPrompt(selectedText, instruction);

  let responseText: string;
  try {
    if (aiCtx.provider === "groq") {
      const groqKey = process.env.GROQ_API_KEY;
      if (!groqKey) {
        return new Response("Missing GROQ_API_KEY on server", { status: 500 });
      }
      responseText = await groqGenerateText(prompt, groqKey, GROQ_MODEL);
    } else if (aiCtx.provider === "byok") {
      const secret = process.env.BYOK_ENCRYPTION_SECRET;
      if (!secret || secret.length < 16) {
        return new Response("BYOK_ENCRYPTION_SECRET is not configured on server", {
          status: 500,
        });
      }
      if (!aiCtx.byokEnc) {
        return new Response(
          "Add your Gemini API key (Google AI Studio) in the app before using AI.",
          { status: 400 },
        );
      }
      const userKey = decryptByokApiKey(aiCtx.byokEnc, secret);
      responseText = await geminiGenerateText(prompt, userKey, GEMINI_MODEL);
    } else {
      const geminiKey = process.env.GEMINI_API_KEY;
      if (!geminiKey) {
        return new Response("Missing GEMINI_API_KEY", { status: 500 });
      }
      responseText = await geminiGenerateText(prompt, geminiKey, GEMINI_MODEL);
    }
  } catch (err) {
    console.error("[ai-rewrite]", err);
    const msg = err instanceof Error ? err.message : "AI provider error";
    return new Response(msg, { status: 502 });
  }

  const jsonCandidate = extractJsonCandidate(responseText);
  if (jsonCandidate) {
    try {
      const parsed = JSON.parse(jsonCandidate) as unknown;
      const normalized = normalizeAiPayload(parsed);
      if (normalized) return Response.json(normalized);
    } catch {
      // fall through to rewrite fallback
    }
  }

  return Response.json({ intent: "rewrite", rewrittenText: responseText });
}
