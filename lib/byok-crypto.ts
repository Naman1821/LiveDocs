import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

function deriveKey(secret: string): Buffer {
  return scryptSync(secret, "livedocs-byok-v1", 32);
}

/** Encrypt a Gemini API key for storage (Convex). Requires BYOK_ENCRYPTION_SECRET on the server. */
export function encryptByokApiKey(plain: string, secret: string): string {
  const key = deriveKey(secret);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain.trim(), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decryptByokApiKey(payload: string, secret: string): string {
  const key = deriveKey(secret);
  const buf = Buffer.from(payload, "base64");
  if (buf.length < 28) throw new Error("Invalid payload");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
