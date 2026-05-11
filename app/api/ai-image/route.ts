import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { decryptByokApiKey } from "@/lib/byok-crypto";
import { clipdropTextToImageDataUrl } from "@/lib/server-ai";

type GeminiImagePart = {
  inlineData?: {
    mimeType?: string;
    data?: string;
  };
  text?: string;
};

type GeminiImageResponse = {
  candidates?: Array<{
    content?: {
      parts?: GeminiImagePart[];
    };
  }>;
};

const IMAGE_MODEL =
  process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";

export async function POST(req: Request) {
  const { userId, getToken } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const token = await getToken({ template: "convex" });
  if (!token) return new Response("Convex auth missing", { status: 401 });

  let body: { prompt?: unknown };
  try {
    body = await req.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) return new Response("Missing prompt", { status: 400 });

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

  if (aiCtx.provider === "groq") {
    if (!aiCtx.groqClipdropImages) {
      return new Response(
        "Image generation is disabled while the project uses Groq for text.",
        { status: 400 },
      );
    }
    const clipKey = process.env.CLIPDROP_API_KEY?.trim();
    if (!clipKey) {
      return new Response(
        "CLIPDROP_API_KEY is not configured on the server. Owner enabled Groq + Clipdrop images.",
        { status: 500 },
      );
    }
    try {
      const imageDataUrl = await clipdropTextToImageDataUrl(prompt, clipKey);
      return Response.json({ imageDataUrl });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Clipdrop image failed";
      return new Response(msg, { status: 502 });
    }
  }

  let apiKey: string;
  if (aiCtx.provider === "byok") {
    const secret = process.env.BYOK_ENCRYPTION_SECRET;
    if (!secret || secret.length < 16) {
      return new Response("BYOK_ENCRYPTION_SECRET is not configured on server", {
        status: 500,
      });
    }
    if (!aiCtx.byokEnc) {
      return new Response(
        "Add your Gemini API key before generating images (BYOK mode).",
        { status: 400 },
      );
    }
    try {
      apiKey = decryptByokApiKey(aiCtx.byokEnc, secret);
    } catch {
      return new Response("Invalid stored API key", { status: 500 });
    }
  } else {
    const k = process.env.GEMINI_API_KEY;
    if (!k) return new Response("Missing GEMINI_API_KEY", { status: 500 });
    apiKey = k;
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(IMAGE_MODEL)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const systemPrompt = `Create a clean, high-quality image for this instruction: ${prompt}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: systemPrompt }] }],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("[ai-image] gemini failed", res.status, err);
    let providerMessage = "Gemini image generation failed";
    try {
      const parsed = JSON.parse(err) as { error?: { message?: string } };
      providerMessage = parsed.error?.message || providerMessage;
    } catch {
      // keep fallback
    }
    return new Response(providerMessage, { status: 502 });
  }

  const data = (await res.json()) as GeminiImageResponse;
  const part = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  const mimeType = part?.inlineData?.mimeType || "image/png";
  const b64 = part?.inlineData?.data;

  if (!b64) return new Response("No image returned by Gemini", { status: 502 });

  return Response.json({ imageDataUrl: `data:${mimeType};base64,${b64}` });
}
