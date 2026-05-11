"use client";

import { useCallback, useEffect, useState } from "react";
import { Globe, Lock, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function ShareDocumentModal({
  open,
  onOpenChange,
  documentUrl,
  visibility = "private",
  isOwner = false,
  onVisibilityChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentUrl: string;
  /** Effective visibility (`undefined` on older docs = private). */
  visibility?: "private" | "public";
  isOwner?: boolean;
  onVisibilityChange?: (next: "private" | "public") => void;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset label when dialog closes
      setCopied(false);
    }
  }, [open]);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(documentUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link:", documentUrl);
    }
  }, [documentUrl]);

  if (!open) return null;

  const isPublic = visibility === "public";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
        aria-label="Close share dialog"
        onClick={() => onOpenChange(false)}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-doc-title"
        className={cn(
          "relative z-[101] w-full max-w-md rounded-xl border border-gray-200 bg-white p-5 shadow-lg",
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2
              id="share-doc-title"
              className="text-lg font-semibold text-[#1F1F1F]"
            >
              Share document
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              {isPublic
                ? "Anyone signed in with this link can open the document. New visitors get view-only until you promote them in the People menu."
                : "Only people you add or approve can open this link. Others can request access."}
            </p>
          </div>
          <button
            type="button"
            className="rounded-full p-2 text-gray-500 hover:bg-gray-100"
            aria-label="Close"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {isOwner && onVisibilityChange ? (
          <div className="mt-4">
            <p className="mb-2 text-xs font-medium text-gray-500">Who can open</p>
            <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-1">
              <button
                type="button"
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-md py-2 text-sm font-medium transition-colors",
                  !isPublic ? "bg-white text-[#1F1F1F] shadow-sm" : "text-gray-600 hover:text-gray-900",
                )}
                onClick={() => onVisibilityChange("private")}
              >
                <Lock className="h-3.5 w-3.5" aria-hidden />
                Private
              </button>
              <button
                type="button"
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-md py-2 text-sm font-medium transition-colors",
                  isPublic ? "bg-white text-[#1F1F1F] shadow-sm" : "text-gray-600 hover:text-gray-900",
                )}
                onClick={() => onVisibilityChange("public")}
              >
                <Globe className="h-3.5 w-3.5" aria-hidden />
                Public
              </button>
            </div>
          </div>
        ) : null}

        <div className="mt-4 flex gap-2">
          <Input readOnly value={documentUrl} className="flex-1 font-mono text-xs" />
          <Button
            type="button"
            className="shrink-0 rounded-full bg-[#C2E7FF] px-5 font-medium text-[#001D35] hover:bg-[#A8D4FF]"
            onClick={() => void copy()}
          >
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </div>
    </div>
  );
}
