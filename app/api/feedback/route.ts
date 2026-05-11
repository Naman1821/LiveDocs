import { auth, currentUser } from "@clerk/nextjs/server";
import { Resend } from "resend";

const jsonHeaders = { "Content-Type": "application/json" } as const;

/**
 * Transactional feedback mail (Resend).
 *
 * Env (server):
 * - RESEND_API_KEY — from https://resend.com/api-keys
 * - FEEDBACK_FROM_EMAIL — verified sender in Resend (e.g. feedback@yourdomain.com).
 *   For Resend trial you can use onboarding@resend.dev but it only delivers to your own signup email.
 * - FEEDBACK_TO_EMAIL — inbox that receives feedback (defaults to OWNER_EMAIL).
 *
 * The visitor’s address is never used as From (SPF); it is set as reply_to so you can hit Reply in Gmail.
 *
 * Auto thank-you to the submitter is disabled until a verified sending domain is used.
 */

const MAX_MESSAGE = 8000;

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export async function POST(req: Request) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.FEEDBACK_FROM_EMAIL?.trim();
  const to =
    process.env.FEEDBACK_TO_EMAIL?.trim() ||
    process.env.OWNER_EMAIL?.trim() ||
    "";

  if (!apiKey || !from || !to) {
    return Response.json(
      { error: "email_not_configured" },
      { status: 503, headers: jsonHeaders },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400, headers: jsonHeaders });
  }

  const rawMessage =
    typeof body === "object" && body !== null && "message" in body
      ? String((body as { message: unknown }).message ?? "")
      : "";
  const message = rawMessage.trim().slice(0, MAX_MESSAGE);
  if (!message) {
    return Response.json({ error: "message_required" }, { status: 400, headers: jsonHeaders });
  }

  const { userId } = await auth();
  const clerkUser = userId ? await currentUser() : null;
  const clerkEmail =
    clerkUser?.primaryEmailAddress?.emailAddress?.trim() ?? "";

  const rawContact =
    typeof body === "object" && body !== null && "email" in body
      ? String((body as { email: unknown }).email ?? "").trim()
      : "";
  const contactEmail = (clerkEmail || rawContact).trim();

  if (!contactEmail || !isValidEmail(contactEmail)) {
    return Response.json(
      { error: "valid_email_required" },
      { status: 400, headers: jsonHeaders },
    );
  }

  const displayName =
    clerkUser?.fullName?.trim() ||
    [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(" ").trim() ||
    contactEmail.split("@")[0] ||
    "User";

  const resend = new Resend(apiKey);

  const metaLines = [
    `From (reply-to): ${contactEmail}`,
    `Name: ${displayName}`,
    userId ? `Clerk user id: ${userId}` : "Signed out (email from form)",
    "",
    "---",
    "",
    message,
  ].join("\n");

  const ownerResult = await resend.emails.send({
    from: `LiveDocs <${from}>`,
    to: [to],
    replyTo: contactEmail,
    subject: `[LiveDocs feedback] ${displayName}`,
    text: metaLines,
  });

  if (ownerResult.error) {
    console.error("[feedback] owner email failed:", ownerResult.error);
    return Response.json(
      { error: "send_failed", detail: ownerResult.error.message },
      { status: 502, headers: jsonHeaders },
    );
  }

  // Auto thank-you to the submitter is intentionally disabled for now (Resend
  // onboarding sender cannot reach arbitrary inboxes). Re-enable when using a
  // verified domain + FEEDBACK_FROM_EMAIL on that domain.

  return Response.json({ ok: true }, { status: 200, headers: jsonHeaders });
}
