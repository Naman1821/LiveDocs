/**
 * Stable app identifiers — never derived from the repository folder name.
 * Override with env when several deployments share one origin (localStorage).
 */

function normalizePrefix(raw: string | undefined): string {
  const s = raw?.trim() ?? "";
  return s.replace(/:+$/, "");
}

/** Prefix for localStorage keys (default unchanged so existing browsers keep state). */
export const APP_STORAGE_PREFIX =
  normalizePrefix(process.env.NEXT_PUBLIC_APP_STORAGE_PREFIX) || "live-docs";

/** Short tag for dev / error messages (not shown to end users). */
export const APP_LOG_TAG =
  normalizePrefix(process.env.NEXT_PUBLIC_APP_LOG_TAG) || "doc-editor";
