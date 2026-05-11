/** Convex / Clerk `subject` and stored ids can differ by prefix (e.g. `oauth|…` vs `user_…`). */
export function convexUserKey(userId: string): string {
  const t = userId.trim();
  return (t.split("|").pop() ?? t).trim().toLowerCase();
}

export function sameConvexUser(a: string, b: string): boolean {
  const ka = convexUserKey(a);
  const kb = convexUserKey(b);
  return ka.length > 0 && ka === kb;
}

/** Clerk REST `GET /v1/users/{id}` expects `user_…`; find it even when `subject` is not a bare id. */
const CLERK_USER_ID_IN_STRING = /user_[a-zA-Z0-9_]{8,}/;

/** Convex + Clerk often set `tokenIdentifier` to `https://…clerk…|user_…` while `subject` varies. */
function clerkUserIdFromTokenIdentifier(tokenIdentifier: string): string | null {
  const t = tokenIdentifier.trim();
  if (!t) return null;
  const pipe = t.lastIndexOf("|");
  const tail = (pipe >= 0 ? t.slice(pipe + 1) : t).trim().toLowerCase();
  if (tail.startsWith("user_")) return tail;
  const m = t.match(CLERK_USER_ID_IN_STRING);
  return m ? m[0].toLowerCase() : null;
}

export function clerkUserIdForClerkRestApi(
  subject: string,
  tokenIdentifier: string,
): string | null {
  const k = convexUserKey(subject);
  if (k.startsWith("user_")) return k;
  const fromToken = clerkUserIdFromTokenIdentifier(tokenIdentifier);
  if (fromToken) return fromToken;
  const hay = `${subject} ${tokenIdentifier}`;
  const m = hay.match(CLERK_USER_ID_IN_STRING);
  return m ? m[0].toLowerCase() : null;
}
