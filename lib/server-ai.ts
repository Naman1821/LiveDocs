export type AiIntent = "rewrite" | "format" | "mixed";
export type AiAction = {
  op: string;
  value?: string | number | boolean;
  targetText?: string;
};
export type AiRewritePayload = {
  intent: AiIntent;
  rewrittenText?: string;
  actions?: AiAction[];
};

type GeminiPart = { text?: string };
type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: GeminiPart[];
    };
  }>;
};

export function buildAiEditorPrompt(
  selectedText: string,
  instruction: string,
): string {
  return [
    "You are an AI editor operating on selected text only.",
    "Understand user intent and return STRICT JSON (no markdown).",
    "If user asks visual formatting/style only (color, alignment, bold, italic, size, highlight, list, heading), use intent=format and provide actions.",
    "If user asks text/content change (rewrite, rephrase, add/remove words, summarize), use intent=rewrite and provide rewrittenText.",
    "If both are required, use intent=mixed with rewrittenText and actions.",
    "When formatting only part of the selected text, include targetText with exact phrase that should be formatted.",
    "Never apply a style to the full selection when user asks for only one word/phrase.",
    "",
    "Allowed action ops:",
    "setColor, unsetColor, setHighlight, unsetHighlight, setTextAlign, setFontSize, setFontFamily, setLineHeight,",
    "toggleBold, toggleItalic, toggleUnderline, toggleStrike, toggleSuperscript, toggleSubscript,",
    "toggleBulletList, toggleOrderedList, toggleTaskList, toggleBlockquote, toggleCodeBlock, toggleCode,",
    "setHeading, setParagraph, clearFormatting, uppercase, lowercase",
    "",
    "JSON shape:",
    '{"intent":"rewrite|format|mixed","rewrittenText":"...","actions":[{"op":"setColor","value":"green","targetText":"naman"}]}',
    "",
    `Instruction: ${instruction}`,
    "",
    "Selected text:",
    selectedText,
  ].join("\n");
}

export function extractJsonCandidate(raw: string): string | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? raw;
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  return fenced.slice(start, end + 1);
}

export function normalizeAiPayload(input: unknown): AiRewritePayload | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const obj = input as {
    intent?: unknown;
    rewrittenText?: unknown;
    actions?: unknown;
  };
  const intent =
    obj.intent === "rewrite" || obj.intent === "format" || obj.intent === "mixed"
      ? obj.intent
      : null;
  if (!intent) return null;
  const rewrittenText =
    typeof obj.rewrittenText === "string" ? obj.rewrittenText.trim() : undefined;
  const actions = Array.isArray(obj.actions)
    ? obj.actions
        .filter(
          (x): x is { op: unknown; value?: unknown; targetText?: unknown } =>
            !!x && typeof x === "object",
        )
        .map((x) => ({
          op: typeof x.op === "string" ? x.op.trim() : "",
          value:
            typeof x.value === "string" ||
            typeof x.value === "number" ||
            typeof x.value === "boolean"
              ? x.value
              : undefined,
          targetText:
            typeof x.targetText === "string" && x.targetText.trim()
              ? x.targetText.trim()
              : undefined,
        }))
        .filter((x) => x.op.length > 0)
    : [];
  return { intent, rewrittenText, actions };
}

export async function geminiGenerateText(
  prompt: string,
  apiKey: string,
  model: string,
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  const geminiRes = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.4,
      },
    }),
  });

  if (!geminiRes.ok) {
    const errText = await geminiRes.text();
    let providerMessage = "AI provider error";
    try {
      const parsed = JSON.parse(errText) as { error?: { message?: string } };
      providerMessage = parsed.error?.message || providerMessage;
    } catch {
      // keep fallback
    }
    throw new Error(providerMessage);
  }

  const data = (await geminiRes.json()) as GeminiResponse;
  const responseText = (data.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text ?? "")
    .join("")
    .trim();

  if (!responseText) throw new Error("Empty AI response");
  return responseText;
}

export async function groqGenerateText(
  prompt: string,
  apiKey: string,
  model: string,
): Promise<string> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.4,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    let msg = `Groq error (${res.status})`;
    try {
      const parsed = JSON.parse(errText) as { error?: { message?: string } };
      msg = parsed.error?.message || msg;
    } catch {
      if (errText) msg = errText.slice(0, 400);
    }
    throw new Error(msg);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("Empty AI response");
  return content;
}

const CLIPDROP_TEXT_TO_IMAGE_URL = "https://clipdrop-api.co/text-to-image/v1";

/** Text-to-image (PNG). Requires `CLIPDROP_API_KEY` on the server. */
export async function clipdropTextToImageDataUrl(
  prompt: string,
  apiKey: string,
): Promise<string> {
  const form = new FormData();
  form.append("prompt", prompt.slice(0, 1000));

  const res = await fetch(CLIPDROP_TEXT_TO_IMAGE_URL, {
    method: "POST",
    headers: { "x-api-key": apiKey },
    body: form,
  });

  if (!res.ok) {
    const ct = res.headers.get("content-type") ?? "";
    let msg = `Clipdrop error (${res.status})`;
    if (ct.includes("application/json")) {
      try {
        const j = (await res.json()) as { error?: string };
        if (typeof j.error === "string") msg = j.error;
      } catch {
        // keep msg
      }
    } else {
      const t = await res.text();
      if (t) msg = t.slice(0, 400);
    }
    throw new Error(msg);
  }

  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 100) {
    throw new Error("Clipdrop returned an empty or invalid image");
  }
  return `data:image/png;base64,${buf.toString("base64")}`;
}
