"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/** Horizontal ruler: margins are in document px (same space as page width, before CSS zoom). */
export function DocumentRuler({
  pageWidthPx,
  docLeftMarginPx,
  docRightMarginPx,
  onBoundariesChange,
  className,
}: {
  pageWidthPx: number;
  docLeftMarginPx: number;
  docRightMarginPx: number;
  onBoundariesChange: (next: {
    docLeftMarginPx: number;
    docRightMarginPx: number;
  }) => void;
  className?: string;
}) {
  const innerTrackRef = useRef<HTMLDivElement>(null);
  const [leftDoc, setLeftDoc] = useState(docLeftMarginPx);
  const [rightMarginDoc, setRightMarginDoc] = useState(docRightMarginPx);
  const [isDragging, setIsDragging] = useState(false);
  const [dragKind, setDragKind] = useState<"left" | "right" | null>(null);
  const dragRef = useRef<{
    kind: "left" | "right";
    startLeftDoc: number;
    startRightMarginDoc: number;
  } | null>(null);

  useEffect(() => setLeftDoc(docLeftMarginPx), [docLeftMarginPx]);
  useEffect(() => setRightMarginDoc(docRightMarginPx), [docRightMarginPx]);

  const docFromClientX = useCallback((clientX: number) => {
    const el = innerTrackRef.current;
    if (!el) return leftDoc;
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left;
    const t = Math.min(Math.max(x / Math.max(1, rect.width), 0), 1);
    return t * pageWidthPx;
  }, [leftDoc, pageWidthPx]);

  const onMove = useCallback(
    (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d || !innerTrackRef.current) return;

      const minGapDoc = 12;
      const docX = docFromClientX(e.clientX);

      if (d.kind === "left") {
        const maxLeft = pageWidthPx - d.startRightMarginDoc - minGapDoc;
        const next = Math.min(Math.max(0, docX), Math.max(0, maxLeft));
        setLeftDoc(next);
        onBoundariesChange({ docLeftMarginPx: next, docRightMarginPx: d.startRightMarginDoc });
        return;
      }

      const minRightEdge = d.startLeftDoc + minGapDoc;
      const edge = Math.min(Math.max(minRightEdge, docX), pageWidthPx);
      const nextRm = pageWidthPx - edge;
      setRightMarginDoc(nextRm);
      onBoundariesChange({ docLeftMarginPx: d.startLeftDoc, docRightMarginPx: nextRm });
    },
    [docFromClientX, onBoundariesChange, pageWidthPx],
  );

  const onUp = useCallback(() => {
    dragRef.current = null;
    setIsDragging(false);
    setDragKind(null);
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
  }, [onMove]);

  const startDrag = (kind: "left" | "right") => (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    setDragKind(kind);
    dragRef.current = {
      kind,
      startLeftDoc: leftDoc,
      startRightMarginDoc: rightMarginDoc,
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const leftPct = (leftDoc / pageWidthPx) * 100;
  const rightEdgeDoc = pageWidthPx - rightMarginDoc;
  const rightPct = (rightEdgeDoc / pageWidthPx) * 100;

  const activeDoc = dragKind === "right" ? rightEdgeDoc : leftDoc;
  const rulerUnits = (activeDoc / pageWidthPx) * 7;

  return (
    <div className={cn("relative h-full w-full", className)}>
      {/* Full bleed track so marker % maps to the same 816px width as the page strip (no side inset skew). */}
      <div ref={innerTrackRef} className="absolute inset-x-0 bottom-0 top-0">
        <div className="pointer-events-none absolute inset-0 bottom-0">
          {Array.from({ length: 56 }, (_, i) => {
            const step = i + 1;
            const left = `${(step / 56) * 100}%`;
            const isMajor = step % 8 === 0;
            const isMedium = !isMajor && step % 4 === 0;
            return (
              <div
                key={step}
                className="absolute bottom-0"
                style={{ left, transform: "translateX(-50%)" }}
              >
                <span
                  className={cn(
                    "block w-px bg-gray-300",
                    isMajor ? "h-3" : isMedium ? "h-2.5" : "h-1.5",
                  )}
                />
              </div>
            );
          })}
        </div>

        <div className="pointer-events-none absolute inset-x-0 top-0">
          {Array.from({ length: 7 }, (_, i) => i + 1).map((n) => (
            <span
              key={n}
              className="absolute -translate-x-1/2 text-[10px] tabular-nums text-gray-500"
              style={{ left: `${(n / 7) * 100}%` }}
            >
              {n}
            </span>
          ))}
        </div>

        <button
          type="button"
          className="absolute top-0 flex cursor-ew-resize flex-col items-center touch-none"
          style={{ left: `${leftPct}%`, transform: "translateX(-50%)" }}
          aria-label="Adjust left margin"
          onMouseDown={startDrag("left")}
        >
          {isDragging && dragKind === "left" ? (
            <span className="mb-1 rounded bg-[#1a73e8] px-1.5 py-0.5 text-[10px] font-medium text-white shadow">
              {rulerUnits.toFixed(2)}
            </span>
          ) : null}
          <span className="h-0 w-0 border-l-[5px] border-r-[5px] border-t-[6px] border-transparent border-t-[#0B57D0]" />
          <span className="mt-0.5 h-[4px] w-[10px] bg-[#0B57D0]" />
          {isDragging && dragKind === "left" ? (
            <span
              className="pointer-events-none absolute left-1/2 top-full h-[120vh] w-px -translate-x-1/2 bg-[#0B57D0]/60"
              aria-hidden
            />
          ) : null}
        </button>

        <button
          type="button"
          className="absolute top-0 flex cursor-ew-resize flex-col items-center touch-none"
          style={{ left: `${rightPct}%`, transform: "translateX(-50%)" }}
          aria-label="Adjust right margin"
          onMouseDown={startDrag("right")}
        >
          {isDragging && dragKind === "right" ? (
            <span className="mb-1 rounded bg-[#1a73e8] px-1.5 py-0.5 text-[10px] font-medium text-white shadow">
              {(rightEdgeDoc / pageWidthPx * 7).toFixed(2)}
            </span>
          ) : null}
          <span className="h-0 w-0 border-l-[5px] border-r-[5px] border-t-[6px] border-transparent border-t-[#0B57D0]" />
          <span className="mt-0.5 h-[4px] w-[10px] bg-[#0B57D0]" />
          {isDragging && dragKind === "right" ? (
            <span
              className="pointer-events-none absolute left-1/2 top-full h-[120vh] w-px -translate-x-1/2 bg-[#0B57D0]/60"
              aria-hidden
            />
          ) : null}
        </button>
      </div>
    </div>
  );
}
