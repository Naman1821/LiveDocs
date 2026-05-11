/** Google AI Studio / Gemini API keys are opaque strings; typical length ~39 and start with `AIza`. */
const GEMINI_API_KEY_RE = /^AIza[0-9A-Za-z_-]{32,200}$/;

export function isValidGeminiApiKeyShape(key: string): boolean {
  const t = key.trim();
  return GEMINI_API_KEY_RE.test(t);
}

/** Non-secret preview for UI (prefix + bullets + suffix). */
export function buildByokKeyPreview(plainKey: string): string {
  const t = plainKey.trim();
  if (!t) return "";
  if (t.length <= 10) {
    return `${t.slice(0, 3)}${"•".repeat(Math.max(6, t.length - 3))}`;
  }
  const head = t.slice(0, 8);
  const tail = t.length > 14 ? t.slice(-4) : "";
  const mid = "•".repeat(8);
  return tail ? `${head}${mid}…${tail}` : `${head}${mid}`;
}
