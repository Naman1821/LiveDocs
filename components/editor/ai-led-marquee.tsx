"use client";

import { cn } from "@/lib/utils";

/**
 * Shop-style horizontal scrolling ticker (duplicated segment + translate -50%).
 */
export function AiLedMarquee({
  text,
  variant = "default",
}: {
  text: string;
  /** Narrower bar + faster scroll (AI disabled welcome message). */
  variant?: "default" | "aiOff";
}) {
  /** Gap only (no middle dot — it looked like an extra “.” after sentences ending with a period). */
  const segment = `${text.replace(/\s+/g, " ").trim()}     `;
  if (!segment.trim()) return null;

  return (
    <div className="pointer-events-none w-full min-w-0 overflow-hidden rounded-full border border-[#B6CCFF] bg-[#D3E3FD] py-1.5 shadow-sm">
      <div
        className={cn(
          "ai-led-marquee-track",
          variant === "aiOff" && "ai-led-marquee-track--ai-off",
        )}
      >
        <span className="inline-block shrink-0 whitespace-nowrap px-3 text-xs font-bold leading-snug tracking-tight text-[#202124] sm:text-sm">
          {segment}
        </span>
        <span
          className="inline-block shrink-0 whitespace-nowrap px-3 text-xs font-bold leading-snug tracking-tight text-[#202124] sm:text-sm"
          aria-hidden
        >
          {segment}
        </span>
      </div>
    </div>
  );
}
