"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";

/** Match editor “paper” width so TipTap layouts scale predictably in the card. */
const REF_W = 816;
const REF_H = 1056;
const PREVIEW_MAX_BYTES = 24 * 1024;

function utf8ByteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}

function truncatePreviewHtml(html: string): string {
  const t = html.trim();
  if (!t) return "";
  if (utf8ByteLength(t) <= PREVIEW_MAX_BYTES) return t;
  let lo = 0;
  let hi = t.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (utf8ByteLength(t.slice(0, mid)) <= PREVIEW_MAX_BYTES) lo = mid;
    else hi = mid - 1;
  }
  let cut = t.slice(0, lo);
  const lastGt = cut.lastIndexOf(">");
  if (lastGt > cut.length - 800 && lastGt >= 0) cut = cut.slice(0, lastGt + 1);
  return cut;
}

function sanitizePreviewFragment(html: string): string {
  const stripped = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
  if (typeof document === "undefined") return stripped;
  const doc = new DOMParser().parseFromString(
    `<div id="__pv_root">${stripped}</div>`,
    "text/html",
  );
  const root = doc.getElementById("__pv_root");
  if (!root) return "";
  root.querySelectorAll("script").forEach((n) => n.remove());
  root.querySelectorAll("iframe").forEach((n) => n.remove());
  root.querySelectorAll("*").forEach((el) => {
    for (const attr of [...el.attributes]) {
      if (attr.name.toLowerCase().startsWith("on")) {
        el.removeAttribute(attr.name);
      }
    }
  });
  return root.innerHTML;
}

function isBlankContent(html: string): boolean {
  const t = html
    .replace(/\s|&nbsp;/gi, "")
    .replace(/<br\s*\/?>/gi, "")
    .toLowerCase();
  if (t === "" || t === "<p></p>") return true;
  if (t.includes("<p>loading...</p>")) return true;
  if (t.includes("<p>startwriting")) return true;
  return false;
}

function buildSrcDoc(innerBodyHtml: string, origin: string): string {
  const body = sanitizePreviewFragment(truncatePreviewHtml(innerBodyHtml));
  const base = origin ? `${origin}/` : "/";
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><base href="${base}"/></head><body style="margin:0;padding:0;background:#fff;overflow:hidden">${body}</body></html>`;
}

function DocumentCardContentPreviewInner({ content }: { content: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.22);

  const srcDoc = useMemo(() => {
    const raw = content?.trim() ?? "";
    if (!raw || isBlankContent(raw)) return null;
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return buildSrcDoc(raw, origin);
  }, [content]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w < 8 || h < 8) return;
      setScale(Math.min(w / REF_W, h / REF_H));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (!srcDoc) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-white">
        <div className="relative h-9 w-9 shrink-0 opacity-[0.18]">
          <span className="absolute left-1/2 top-0 h-4 w-2.5 -translate-x-1/2 rounded-[2px] bg-[#FBBC04]" />
          <span className="absolute bottom-0 left-1/2 h-4 w-2.5 -translate-x-1/2 rounded-[2px] bg-[#4285F4]" />
          <span className="absolute left-0 top-1/2 h-2.5 w-4 -translate-y-1/2 rounded-[2px] bg-[#EA4335]" />
          <span className="absolute right-0 top-1/2 h-2.5 w-4 -translate-y-1/2 rounded-[2px] bg-[#34A853]" />
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex h-full w-full items-center justify-center overflow-hidden bg-[#f8f9fa]"
    >
      <div
        className="pointer-events-none relative shrink-0 overflow-hidden will-change-transform"
        style={{
          width: REF_W * scale,
          height: REF_H * scale,
        }}
      >
        <iframe
          title="Document preview"
          className="absolute left-0 top-0 m-0 block border-0 p-0"
          width={REF_W}
          height={REF_H}
          style={{
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
          srcDoc={srcDoc}
          sandbox="allow-same-origin"
        />
      </div>
    </div>
  );
}

export const DocumentCardContentPreview = memo(DocumentCardContentPreviewInner);
