"use client";

import { useCallback, useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useUiStore } from "@/lib/store/use-ui-store";
import { cn } from "@/lib/utils";

const OWNER_PUBLIC =
  (process.env.NEXT_PUBLIC_OWNER_EMAIL ?? "").trim() || "";

export function GlobalFeedbackDialog() {
  const open = useUiStore((s) => s.feedbackDialogOpen);
  const setOpen = useUiStore((s) => s.setFeedbackDialogOpen);
  const { user, isLoaded } = useUser();

  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [step, setStep] = useState<"form" | "success">("form");
  const [validationHint, setValidationHint] = useState<string | null>(null);

  const primaryEmail = user?.primaryEmailAddress?.emailAddress?.trim() ?? "";

  const reset = useCallback(() => {
    setMessage("");
    setEmail("");
    setSending(false);
    setStep("form");
    setValidationHint(null);
  }, []);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) reset();
  };

  useEffect(() => {
    if (step !== "success" || !open) return;
    const t = window.setTimeout(() => {
      setOpen(false);
      reset();
    }, 2800);
    return () => window.clearTimeout(t);
  }, [step, open, setOpen, reset]);

  const submit = async () => {
    setValidationHint(null);
    const trimmed = message.trim();
    if (!trimmed) {
      setValidationHint("Please enter a message before sending.");
      return;
    }
    const contact = (primaryEmail || email).trim();
    if (!contact || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) {
      setValidationHint("Please enter a valid email address so we can reach you if needed.");
      return;
    }

    setSending(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, email: contact }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        detail?: string;
      };

      if (res.status === 503 && data.error === "email_not_configured") {
        if (OWNER_PUBLIC) {
          const subject = encodeURIComponent("LiveDocs feedback");
          const body = encodeURIComponent(
            `My email: ${contact}\n\n${trimmed}`,
          );
          window.open(
            `mailto:${encodeURIComponent(OWNER_PUBLIC)}?subject=${subject}&body=${body}`,
            "_blank",
            "noopener,noreferrer",
          );
          setStep("success");
        }
        return;
      }

      if (!res.ok) {
        console.warn("[feedback] send failed", res.status, data);
        return;
      }

      if (data.error) {
        console.warn("[feedback] unexpected body", data);
        return;
      }

      setStep("success");
    } catch (e) {
      console.error("[feedback] network", e);
    } finally {
      setSending(false);
    }
  };

  const signedIn = isLoaded && !!user;
  const showEmailField = !primaryEmail;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        {step === "success" ? (
          <div
            className={cn(
              "flex flex-col items-center justify-center gap-4 py-8 text-center",
              "animate-in fade-in zoom-in-95 duration-300",
            )}
            role="status"
            aria-live="polite"
          >
            <div
              className={cn(
                "flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-700",
                "animate-in zoom-in-50 duration-500",
              )}
            >
              <Check
                className="size-9 stroke-[2.5] animate-in zoom-in-95 duration-400"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </div>
            <div className="space-y-2">
              <p className="text-lg font-semibold text-gray-900">
                Thank you
              </p>
              <p className="text-sm leading-relaxed text-gray-600">
                We have received your message and appreciate you taking the time
                to write. Your feedback helps us improve LiveDocs.
              </p>
            </div>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Share feedback</DialogTitle>
              <DialogDescription>
                Let us know what we can improve, what is not working as expected,
                or what you would like to see next. We read every message and use
                it to prioritize improvements to LiveDocs.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3">
              {signedIn && primaryEmail ? (
                <p className="text-sm text-gray-600">
                  We will use your account email for any follow-up:{" "}
                  <span className="font-medium text-gray-900">{primaryEmail}</span>
                </p>
              ) : null}
              {showEmailField ? (
                <label className="grid gap-1.5 text-sm">
                  <span className="font-medium text-gray-800">Email address</span>
                  <Input
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setValidationHint(null);
                    }}
                    disabled={sending}
                  />
                </label>
              ) : null}
              <label className="grid gap-1.5 text-sm">
                <span className="font-medium text-gray-800">Message</span>
                <textarea
                  className="min-h-[120px] w-full resize-y rounded-md border border-gray-200 bg-white px-3 py-2 text-sm outline-none ring-blue-500/30 focus:ring-2"
                  placeholder="Describe your suggestion, issue, or question."
                  value={message}
                  onChange={(e) => {
                    setMessage(e.target.value);
                    setValidationHint(null);
                  }}
                  disabled={sending}
                />
              </label>
              {validationHint ? (
                <p className="text-sm text-amber-800">{validationHint}</p>
              ) : null}
              <div className="flex justify-end gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleOpenChange(false)}
                  disabled={sending}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={() => void submit()}
                  disabled={sending}
                >
                  {sending ? "Sending…" : "Send"}
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
