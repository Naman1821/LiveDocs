"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { useUser } from "@clerk/nextjs";
import { RoomProvider, useRoom } from "@liveblocks/react";
import { LiveblocksYjsProvider } from "@liveblocks/yjs";
import * as Y from "yjs";
import Collaboration from "@tiptap/extension-collaboration";
import CharacterCount from "@tiptap/extension-character-count";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Superscript from "@tiptap/extension-superscript";
import Subscript from "@tiptap/extension-subscript";
import Underline from "@tiptap/extension-underline";
import { FontFamily, TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { TextAlignInlineImageSafe } from "@/lib/tiptap/text-align-inline-image-safe";
import { Table, TableHeader, TableRow } from "@tiptap/extension-table";
import TiptapLink from "@tiptap/extension-link";
import {
  AlignLeft,
  ArrowUp,
  Bell,
  BriefcaseBusiness,
  ChevronDown,
  Eye,
  EyeOff,
  FileText,
  ImagePlus,
  Key,
  List,
  Loader2,
  MessageSquarePlus,
  PanelLeftOpen,
  Pencil,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import { FontSize } from "@/lib/tiptap/font-size";
import { LineHeight } from "@/lib/tiptap/line-height";
import { AlignableImage } from "@/lib/tiptap/alignable-image";
import { BlockIndent } from "@/lib/tiptap/block-indent";
import { PageBreak } from "@/lib/tiptap/page-break";
import { AutoPagination } from "@/lib/tiptap/auto-pagination";
import { PageChrome } from "@/lib/tiptap/page-chrome";
import { CommentHoverHighlight } from "@/lib/tiptap/comment-hover-highlight";
import { TwoColumnSection } from "@/lib/tiptap/two-columns";
import { TableCellWithBg } from "@/lib/tiptap/table-cell-bg";
import { useToolbarStore } from "@/lib/editor-toolbar-store";
import { useShallow } from "zustand/react/shallow";
import {
  DocumentCommentsPanel,
  daySeparatorLabel,
  formatCommentTime,
} from "@/components/editor/comments-panel";
import { DocumentRuler } from "@/components/editor/document-ruler";
import { DocumentTabsSidebar } from "@/components/editor/document-tabs-sidebar";
import { DocumentEditorHeader } from "@/components/editor/document-editor-header";
import { EditorProvider } from "@/components/editor/editor-context";
import { MenubarActionsProvider } from "@/components/editor/menubar-actions-context";
import { FormattingToolbar } from "@/components/editor/formatting-toolbar";
import { APP_LOG_TAG, APP_STORAGE_PREFIX } from "@/lib/app-identity";
import { liveblocksRoomId } from "@/lib/liveblocks-room";
import { useUiStore } from "@/lib/store/use-ui-store";
import { cn } from "@/lib/utils";
import { docxToHtml, getDocxPageHeightPx } from "@/lib/docx-import";
import { isValidGeminiApiKeyShape } from "@/lib/gemini-api-key";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Persist “seen” comment alerts per doc + user (survives refresh).
 * Uses threadId → acknowledged **visible comment count** (stable; unlike timestamps / Liveblocks
 * comment ids which can change shape across loads and falsely re-trigger unread).
 */
const COMMENT_THREADS_SEEN_PREFIX = `${APP_STORAGE_PREFIX}:seenCommentThreads:v4:`;

function loadSeenThreadCountsFromStorage(key: string | null): Record<string, number> {
  if (!key || typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const next: Record<string, number> = {};
    for (const [tid, val] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof tid !== "string" || tid.length === 0) continue;
      const n = typeof val === "number" ? val : Number(val);
      if (Number.isFinite(n) && n >= 0) next[tid] = Math.floor(n);
    }
    return next;
  } catch {
    return {};
  }
}

function saveSeenThreadCountsToStorage(key: string | null, map: Record<string, number>) {
  if (!key || typeof window === "undefined") return;
  try {
    const entries = Object.entries(map);
    const capped =
      entries.length > 400 ? entries.slice(entries.length - 400) : entries;
    localStorage.setItem(key, JSON.stringify(Object.fromEntries(capped)));
  } catch {
    /* ignore quota / private mode */
  }
}

function useSyncToolbar() {
  const syncFn = useToolbarStore((s) => s.syncFromEditor);
  const rafId = useRef<number | null>(null);

  const schedule = useCallback(
    (editor: Parameters<typeof syncFn>[0]) => {
      if (rafId.current != null) cancelAnimationFrame(rafId.current);
      rafId.current = requestAnimationFrame(() => {
        rafId.current = null;
        syncFn(editor);
      });
    },
    [syncFn],
  );

  useEffect(() => () => {
    if (rafId.current != null) cancelAnimationFrame(rafId.current);
  }, []);

  return schedule;
}

const ALLOWED_PASTE_TAGS = new Set([
  "p",
  "br",
  "b",
  "strong",
  "i",
  "em",
  "u",
  "s",
  "strike",
  "del",
  "a",
  "ul",
  "ol",
  "li",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "blockquote",
  "code",
  "pre",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "img",
  "span",
  "hr",
]);

function sanitizePasteHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");

  function walk(node: Node): Node | null {
    if (node.nodeType === Node.TEXT_NODE) return node.cloneNode();
    if (node.nodeType !== Node.ELEMENT_NODE) return null;

    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();

    if (!ALLOWED_PASTE_TAGS.has(tag)) {
      const frag = document.createDocumentFragment();
      el.childNodes.forEach((child) => {
        const cleaned = walk(child);
        if (cleaned) frag.appendChild(cleaned);
      });
      return frag;
    }

    const clone = document.createElement(tag);
    if (tag === "a" && el.getAttribute("href")) {
      clone.setAttribute("href", el.getAttribute("href")!);
      clone.setAttribute("target", "_blank");
      clone.setAttribute("rel", "noopener noreferrer");
    }
    if (tag === "img" && el.getAttribute("src")) {
      clone.setAttribute("src", el.getAttribute("src")!);
      if (el.getAttribute("alt")) clone.setAttribute("alt", el.getAttribute("alt")!);
    }

    el.childNodes.forEach((child) => {
      const cleaned = walk(child);
      if (cleaned) clone.appendChild(cleaned);
    });
    return clone;
  }

  const result = document.createElement("div");
  doc.body.childNodes.forEach((child) => {
    const cleaned = walk(child);
    if (cleaned) result.appendChild(cleaned);
  });
  return result.innerHTML;
}

function findTextRangeInDoc(
  doc: Editor["state"]["doc"],
  query: string,
): { from: number; to: number } | null {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return null;

  let found: { from: number; to: number } | null = null;
  doc.descendants((node, pos) => {
    if (found) return false;
    if (!node.isText || !node.text) return true;
    const idx = node.text.toLocaleLowerCase().indexOf(needle);
    if (idx < 0) return true;
    found = { from: pos + idx, to: pos + idx + needle.length };
    return false;
  });
  return found;
}

/**
 * Blob URLs die after refresh. We store JPEG data URLs in HTML, but Convex
 * limits one field to ~1 MiB — compress so saves succeed.
 */
const RAW_IMAGE_FILE_MAX_BYTES = 15 * 1024 * 1024;
/** ~680k chars base64 keeps `content` under Convex 1 MiB with normal HTML around it. */
const MAX_IMAGE_DATA_URL_CHARS = 680_000;
/** ProseMirror page surface width from globals.css (`.tiptap.ProseMirror`). */
const PAGE_SURFACE_WIDTH_PX = 816;

type TextSelectionAnchor = {
  from: number;
  to: number;
  selectedText: string;
  left: number;
  top: number;
};

type AiIntent = "rewrite" | "format" | "mixed";
type AiAction = {
  op: string;
  value?: string | number | boolean;
  targetText?: string;
};

const SMART_COLOR_MAP: Record<string, string> = {
  red: "#dc2626",
  blue: "#2563eb",
  green: "#16a34a",
  yellow: "#ca8a04",
  orange: "#ea580c",
  purple: "#7c3aed",
  pink: "#db2777",
  black: "#111827",
  gray: "#4b5563",
  grey: "#4b5563",
  brown: "#92400e",
};

function extractColorName(input: string): string | null {
  const lower = input.toLowerCase();
  for (const name of Object.keys(SMART_COLOR_MAP)) {
    if (new RegExp(`\\b${name}\\b`, "i").test(lower)) return name;
  }
  return null;
}

function normalizeAiActions(raw: unknown): AiAction[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (x): x is { op: unknown; value?: unknown; targetText?: unknown } =>
        !!x && typeof x === "object",
    )
    .map((x) => ({
      op: typeof x.op === "string" ? x.op.trim() : "",
      value:
        typeof x.value === "string" ||
        typeof x.value === "number" ||
        typeof x.value === "boolean"
          ? x.value
          : undefined,
      targetText:
        typeof x.targetText === "string" && x.targetText.trim()
          ? x.targetText.trim()
          : undefined,
    }))
    .filter((x) => x.op.length > 0);
}

function findTargetRangeInSelection(
  selection: { from: number; to: number; selectedText: string },
  targetText?: string,
): { from: number; to: number } {
  if (!targetText) return { from: selection.from, to: selection.to };
  const normalizedTarget = targetText.trim().replace(/^["']|["']$/g, "");
  if (!normalizedTarget) return { from: selection.from, to: selection.to };
  const idx = selection.selectedText.toLocaleLowerCase().indexOf(normalizedTarget.toLocaleLowerCase());
  if (idx < 0) return { from: selection.from, to: selection.to };
  return {
    from: selection.from + idx,
    to: selection.from + idx + normalizedTarget.length,
  };
}

function applyAiActions(
  editor: Editor,
  selection: { from: number; to: number; selectedText: string },
  actions: AiAction[],
): boolean {
  if (actions.length === 0) return false;
  let touched = false;

  for (const action of actions) {
    const op = action.op.trim();
    const range = findTargetRangeInSelection(selection, action.targetText);
    const chain = editor
      .chain()
      .focus()
      .setTextSelection({ from: range.from, to: range.to });
    switch (op) {
      case "setColor":
        if (typeof action.value === "string" && action.value.trim()) {
          chain.setColor(action.value.trim());
          chain.run();
          touched = true;
        }
        break;
      case "unsetColor":
        chain.unsetColor();
        chain.run();
        touched = true;
        break;
      case "setHighlight":
        if (typeof action.value === "string" && action.value.trim()) {
          chain.setHighlight({ color: action.value.trim() });
        } else {
          chain.setHighlight();
        }
        chain.run();
        touched = true;
        break;
      case "unsetHighlight":
        chain.unsetHighlight();
        chain.run();
        touched = true;
        break;
      case "setTextAlign":
        if (
          action.value === "left" ||
          action.value === "center" ||
          action.value === "right" ||
          action.value === "justify"
        ) {
          chain.setTextAlign(action.value);
          chain.run();
          touched = true;
        }
        break;
      case "setFontSize":
        if (typeof action.value === "number" && action.value >= 8 && action.value <= 96) {
          chain.setFontSize(`${Math.round(action.value)}px`);
          chain.run();
          touched = true;
        } else if (typeof action.value === "string" && action.value.trim()) {
          const n = Number(action.value.replace(/[^0-9.]/g, ""));
          if (Number.isFinite(n) && n >= 8 && n <= 96) {
            chain.setFontSize(`${Math.round(n)}px`);
            chain.run();
            touched = true;
          }
        }
        break;
      case "setFontFamily":
        if (typeof action.value === "string" && action.value.trim()) {
          chain.setFontFamily(action.value.trim());
          chain.run();
          touched = true;
        }
        break;
      case "setLineHeight":
        if (typeof action.value === "number" && action.value >= 1 && action.value <= 3) {
          chain.setLineHeight(String(action.value));
          chain.run();
          touched = true;
        } else if (typeof action.value === "string" && action.value.trim()) {
          const n = Number(action.value);
          if (Number.isFinite(n) && n >= 1 && n <= 3) {
            chain.setLineHeight(String(n));
            chain.run();
            touched = true;
          }
        }
        break;
      case "toggleBold":
        chain.toggleBold();
        chain.run();
        touched = true;
        break;
      case "toggleItalic":
        chain.toggleItalic();
        chain.run();
        touched = true;
        break;
      case "toggleUnderline":
        chain.toggleUnderline();
        chain.run();
        touched = true;
        break;
      case "toggleStrike":
        chain.toggleStrike();
        chain.run();
        touched = true;
        break;
      case "toggleSuperscript":
        chain.toggleSuperscript();
        chain.run();
        touched = true;
        break;
      case "toggleSubscript":
        chain.toggleSubscript();
        chain.run();
        touched = true;
        break;
      case "toggleBulletList":
        chain.toggleBulletList();
        chain.run();
        touched = true;
        break;
      case "toggleOrderedList":
        chain.toggleOrderedList();
        chain.run();
        touched = true;
        break;
      case "toggleTaskList":
        chain.toggleTaskList();
        chain.run();
        touched = true;
        break;
      case "toggleBlockquote":
        chain.toggleBlockquote();
        chain.run();
        touched = true;
        break;
      case "toggleCodeBlock":
        chain.toggleCodeBlock();
        chain.run();
        touched = true;
        break;
      case "toggleCode":
        chain.toggleCode();
        chain.run();
        touched = true;
        break;
      case "setHeading":
        if (typeof action.value === "number" && action.value >= 1 && action.value <= 6) {
          chain.setHeading({ level: action.value as 1 | 2 | 3 | 4 | 5 | 6 });
          chain.run();
          touched = true;
        }
        break;
      case "setParagraph":
        chain.setParagraph();
        chain.run();
        touched = true;
        break;
      case "clearFormatting":
        chain.unsetAllMarks();
        chain.run();
        touched = true;
        break;
      case "uppercase":
        {
          const selected = editor.state.doc.textBetween(range.from, range.to, " ");
          if (!selected) break;
          editor
            .chain()
            .focus()
            .insertContentAt({ from: range.from, to: range.to }, selected.toUpperCase())
            .run();
          touched = true;
        }
        break;
      case "lowercase":
        {
          const selected = editor.state.doc.textBetween(range.from, range.to, " ");
          if (!selected) break;
          editor
            .chain()
            .focus()
            .insertContentAt({ from: range.from, to: range.to }, selected.toLowerCase())
            .run();
          touched = true;
        }
        break;
      default:
        break;
    }
  }

  return touched;
}

function tryApplySmartSelectionAction(
  editor: Editor,
  selection: { from: number; to: number; selectedText: string },
  instruction: string,
): boolean {
  const lower = instruction.toLowerCase().trim();
  if (!lower) return false;

  // Text transform actions that should replace selected text directly.
  if (/\b(uppercase|upper case|all caps)\b/.test(lower)) {
    editor
      .chain()
      .focus()
      .insertContentAt(
        { from: selection.from, to: selection.to },
        selection.selectedText.toUpperCase(),
      )
      .run();
    return true;
  }
  if (/\b(lowercase|lower case)\b/.test(lower)) {
    editor
      .chain()
      .focus()
      .insertContentAt(
        { from: selection.from, to: selection.to },
        selection.selectedText.toLowerCase(),
      )
      .run();
    return true;
  }

  const chain = editor
    .chain()
    .focus()
    .setTextSelection({ from: selection.from, to: selection.to });
  let touched = false;

  if (/\b(clear|remove|reset)\b.*\b(format|formatting)\b/.test(lower)) {
    chain.unsetAllMarks();
    touched = true;
  }
  if (/\b(clear|remove|reset)\b.*\bhighlight\b/.test(lower)) {
    chain.unsetHighlight();
    touched = true;
  }
  if (/\b(clear|remove|reset)\b.*\b(color|colour)\b/.test(lower)) {
    chain.unsetColor();
    touched = true;
  }

  if (/\b(bold|strong)\b/.test(lower)) {
    chain.toggleBold();
    touched = true;
  }
  if (/\bitalic\b/.test(lower)) {
    chain.toggleItalic();
    touched = true;
  }
  if (/\bunderline\b/.test(lower)) {
    chain.toggleUnderline();
    touched = true;
  }
  if (/\b(strike|strikethrough)\b/.test(lower)) {
    chain.toggleStrike();
    touched = true;
  }
  if (/\bsuperscript\b/.test(lower)) {
    chain.toggleSuperscript();
    touched = true;
  }
  if (/\bsubscript\b/.test(lower)) {
    chain.toggleSubscript();
    touched = true;
  }

  if (/\bjustify\b/.test(lower)) {
    chain.setTextAlign("justify");
    touched = true;
  } else if (/\b(center|centre)\b/.test(lower)) {
    chain.setTextAlign("center");
    touched = true;
  } else if (/\bright\b/.test(lower)) {
    chain.setTextAlign("right");
    touched = true;
  } else if (/\bleft\b/.test(lower)) {
    chain.setTextAlign("left");
    touched = true;
  }

  if (/\bbullet(s| list)?\b/.test(lower)) {
    chain.toggleBulletList();
    touched = true;
  }
  if (/\b(numbered|numbering|ordered)\b.*\blist\b|\bnumbered\b/.test(lower)) {
    chain.toggleOrderedList();
    touched = true;
  }
  if (/\b(task|todo|checklist|check list)\b/.test(lower)) {
    chain.toggleTaskList();
    touched = true;
  }

  if (/\bblockquote|quote block|as quote|in quote\b/.test(lower)) {
    chain.toggleBlockquote();
    touched = true;
  }
  if (/\bcode block\b/.test(lower)) {
    chain.toggleCodeBlock();
    touched = true;
  } else if (/\binline code\b/.test(lower)) {
    chain.toggleCode();
    touched = true;
  }

  const headingMatch = lower.match(/\b(?:heading|h)\s*([1-6])\b/);
  if (headingMatch) {
    const level = Number(headingMatch[1]) as 1 | 2 | 3 | 4 | 5 | 6;
    chain.setHeading({ level });
    touched = true;
  } else if (/\b(paragraph|normal text|body text)\b/.test(lower)) {
    chain.setParagraph();
    touched = true;
  }

  const familyMap: Array<{ pattern: RegExp; family: string }> = [
    { pattern: /\barial\b/, family: "Arial" },
    { pattern: /\b(times new roman|times)\b/, family: "Times New Roman" },
    { pattern: /\bgeorgia\b/, family: "Georgia" },
    { pattern: /\bverdana\b/, family: "Verdana" },
    { pattern: /\binter\b/, family: "Inter" },
    { pattern: /\broboto\b/, family: "Roboto" },
    { pattern: /\bmono|monospace\b/, family: "monospace" },
  ];
  const familyHit = familyMap.find((x) => x.pattern.test(lower));
  if (familyHit && /\b(font|typeface|family)\b/.test(lower)) {
    chain.setFontFamily(familyHit.family);
    touched = true;
  }

  const sizeMatch =
    lower.match(/\b(?:font\s*size|size)\s*(?:to)?\s*(\d{1,2})\b/) ||
    lower.match(/\b(\d{1,2})\s*(?:px|pt)?\s*(?:font\s*size|size)\b/);
  if (sizeMatch) {
    const size = Number(sizeMatch[1]);
    if (size >= 8 && size <= 96) {
      chain.setFontSize(`${size}px`);
      touched = true;
    }
  }

  const lineHeightMatch =
    lower.match(/\bline\s*height\s*(?:to)?\s*([0-9]+(?:\.[0-9]+)?)\b/) ||
    lower.match(/\bspacing\s*(?:to)?\s*([0-9]+(?:\.[0-9]+)?)\b/);
  if (lineHeightMatch) {
    const lh = Number(lineHeightMatch[1]);
    if (lh >= 1 && lh <= 3) {
      chain.setLineHeight(String(lh));
      touched = true;
    }
  }

  const colorName = extractColorName(lower);
  if (colorName) {
    if (/\bhighlight\b/.test(lower)) {
      chain.setHighlight({ color: SMART_COLOR_MAP[colorName] });
      touched = true;
    } else if (
      /\b(color|colour|font|text|make|turn|change)\b/i.test(lower) ||
      lower.length <= 32
    ) {
      chain.setColor(SMART_COLOR_MAP[colorName]);
      touched = true;
    }
  }

  if (!touched) return false;
  chain.run();
  return true;
}

function scaleToMaxSide(
  width: number,
  height: number,
  maxSide: number,
): [number, number] {
  if (width <= maxSide && height <= maxSide) return [width, height];
  if (width >= height) {
    return [maxSide, Math.max(1, Math.round((height * maxSide) / width))];
  }
  return [Math.max(1, Math.round((width * maxSide) / height)), maxSide];
}

async function imageFileToCompressedDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not supported");

    for (const maxSide of [1600, 1280, 960, 720, 560, 448, 360]) {
      const [w, h] = scaleToMaxSide(bitmap.width, bitmap.height, maxSide);
      canvas.width = w;
      canvas.height = h;
      ctx.drawImage(bitmap, 0, 0, w, h);
      for (let q = 0.88; q >= 0.42; q -= 0.05) {
        const dataUrl = canvas.toDataURL("image/jpeg", q);
        if (dataUrl.length <= MAX_IMAGE_DATA_URL_CHARS) {
          return dataUrl;
        }
      }
    }
    for (const maxSide of [280, 220, 180, 140]) {
      const [w, h] = scaleToMaxSide(bitmap.width, bitmap.height, maxSide);
      canvas.width = w;
      canvas.height = h;
      ctx.drawImage(bitmap, 0, 0, w, h);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.32);
      if (dataUrl.length <= MAX_IMAGE_DATA_URL_CHARS) {
        return dataUrl;
      }
    }
    return canvas.toDataURL("image/jpeg", 0.28);
  } finally {
    bitmap.close();
  }
}

/** Debounce after last edit before Convex snapshot (collab stays on Liveblocks/Yjs). */
const AUTOSAVE_MS = 3_000;
/** Briefly wait after Yjs sync, then do one-time Convex seed if doc is still empty-ish. */
const CONVEX_SEED_DELAY_MS = 120;
/** Structural blocks — empty collaborative docs rarely contain these. */
const NON_PLACEHOLDER_NODE_TYPES = new Set([
  "image",
  "table",
  "blockquote",
  "codeBlock",
  "horizontalRule",
  "pageBreak",
  "twoColumnSection",
]);

function approximatePlainTextLen(html: string): number {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim().length;
}

function normalizedHtmlLen(html: string): number {
  return html.replace(/\s+/g, "").length;
}

/** True when Yjs/TipTap still looks like the default empty doc (not real collaboration). */
function collaborativeDocLooksPlaceholder(editor: Editor): boolean {
  let significant = false;
  editor.state.doc.descendants((node) => {
    if (node.type.name === "text") {
      const t = node.text ?? "";
      if (t.replace(/\u00a0/g, " ").trim().length > 0) {
        significant = true;
        return false;
      }
      return true;
    }
    if (NON_PLACEHOLDER_NODE_TYPES.has(node.type.name)) {
      significant = true;
      return false;
    }
    if (
      node.type.name === "heading" &&
      node.textContent.replace(/\u00a0/g, " ").trim().length > 0
    ) {
      significant = true;
      return false;
    }
    return true;
  });
  return !significant;
}

function shouldHydrateConvexIntoYjs(
  editor: Editor,
  convexHtml: string,
  yXmlFragmentLength: number,
): boolean {
  if (yXmlFragmentLength === 0) return true;

  if (collaborativeDocLooksPlaceholder(editor)) return true;

  const convexPlain = approximatePlainTextLen(convexHtml);
  const editorPlain = editor.getText().trim().length;
  const plainGap = 120;
  if (
    convexPlain >= plainGap &&
    convexPlain > editorPlain + plainGap
  ) {
    return true;
  }

  const convexNorm = normalizedHtmlLen(convexHtml);
  const editorNorm = normalizedHtmlLen(editor.getHTML());
  const htmlGap = 800;
  return convexNorm > editorNorm + htmlGap;
}

function DocumentRoomShell({
  document,
  accessRole,
}: {
  document: Doc<"documents">;
  accessRole: "owner" | "editor" | "viewer";
}) {
  const activeTabId = useUiStore((s) => s.activeTabId);
  const setActiveTabId = useUiStore((s) => s.setActiveTabId);
  const ensureInitialTab = useMutation(api.documentTabs.ensureInitialTab);
  const tabs = useQuery(api.documentTabs.listTabsForDocument, {
    documentId: document._id,
  });

  useEffect(() => {
    setActiveTabId("main");
  }, [document._id, setActiveTabId]);

  useEffect(() => {
    if (accessRole === "viewer") return;
    if (tabs === undefined || tabs.length > 0) return;
    void ensureInitialTab({ documentId: document._id }).catch((err: unknown) => {
      console.warn(
        `[${APP_LOG_TAG}] ensureInitialTab failed — Convex deployment missing \`documentTabs\`. Deploy with \`npm run convex:deploy\` (confirm prod), or run \`npm run convex:dev\` and set NEXT_PUBLIC_CONVEX_URL to that dev URL.`,
        err,
      );
    });
  }, [accessRole, document._id, ensureInitialTab, tabs]);

  useEffect(() => {
    if (!tabs || tabs.length === 0) return;
    if (!tabs.some((t) => t.tabKey === activeTabId)) {
      setActiveTabId(tabs[0]!.tabKey);
    }
  }, [tabs, activeTabId, setActiveTabId]);

  if (tabs === undefined) {
    return (
      <div className="document-print-root flex h-screen flex-col items-center justify-center bg-[#F6EFD9] text-[#1F1F1F]">
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <p className="text-sm text-gray-500">Loading document...</p>
        </div>
      </div>
    );
  }

  const roomId = liveblocksRoomId(String(document._id), activeTabId);

  return (
    <RoomProvider key={roomId} id={roomId} initialPresence={{}}>
      <div className="document-print-root flex h-screen flex-col overflow-hidden bg-[#F6EFD9] text-[#1F1F1F]">
        <CollaborativeEditor
          key={`${document._id}_${activeTabId}`}
          document={document}
          roomId={roomId}
          tabKey={activeTabId}
          accessRole={accessRole}
        />
      </div>
    </RoomProvider>
  );
}

function CollaborativeEditor({
  document,
  roomId,
  tabKey,
  accessRole,
}: {
  document: Doc<"documents">;
  roomId: string;
  tabKey: string;
  accessRole: "owner" | "editor" | "viewer";
}) {
  const { user } = useUser();
  const commentSeenStorageKey = user?.id
    ? `${COMMENT_THREADS_SEEN_PREFIX}${document._id}:${user.id}`
    : null;
  const hiddenThreadsStorageKey = user?.id
    ? `${APP_STORAGE_PREFIX}:hiddenCommentThreads:v1:${document._id}:${roomId}:${user.id}`
    : null;

  const room = useRoom();
  const yDoc = useMemo(() => {
    void roomId;
    return new Y.Doc();
  }, [roomId]);
  const seededFromConvexRef = useRef(false);
  const [ySynced, setYSynced] = useState(false);
  const [hydrationDone, setHydrationDone] = useState(false);

  /** Only opening a different document should blank the shell — not tab switches (same room tree remounts separately). */
  useEffect(() => {
    seededFromConvexRef.current = false;
    setHydrationDone(false);
  }, [document._id]);
  const updateDocument = useMutation(api.documents.updateDocument);
  const generateImageUploadUrl = useMutation(api.files.generateImageUploadUrl);
  const finalizeImageUpload = useMutation(api.files.finalizeImageUpload);

  const wordCountDialogOpen = useUiStore((s) => s.wordCountDialogOpen);
  const setWordCountDialogOpen = useUiStore((s) => s.setWordCountDialogOpen);
  const tablePropertiesDialogOpen = useUiStore(
    (s) => s.tablePropertiesDialogOpen,
  );
  const setTablePropertiesDialogOpen = useUiStore(
    (s) => s.setTablePropertiesDialogOpen,
  );
  const editorViewMode = useUiStore((s) => s.editorViewMode);

  const [tableCellColor, setTableCellColor] = useState("#f4f4f5");
  const [, setChromeTick] = useState(0);

  useEffect(() => {
    const provider = new LiveblocksYjsProvider(room, yDoc);
    const onSynced = () => {
      setYSynced(provider.synced);
    };
    provider.on("synced", onSynced);
    onSynced();
    return () => {
      provider.off("synced", onSynced);
      provider.destroy();
    };
  }, [room, yDoc]);

  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const lastSavedRef = useRef<string>("");
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const docxInputRef = useRef<HTMLInputElement | null>(null);
  const [commentsTab, setCommentsTab] = useState<"mine" | "foryou" | "all">("mine");
  const [commentsTypeFilter, setCommentsTypeFilter] = useState("all-types");
  const [commentsTabsFilter, setCommentsTabsFilter] = useState("all-tabs");
  const [commentsComposerFocusNonce, setCommentsComposerFocusNonce] = useState(0);
  const [commentsSelectionPrefill, setCommentsSelectionPrefill] = useState("");
  /** Bumped to force DocumentCommentsPanel to wipe new-thread + reply drafts. */
  const [commentsDraftResetKey, setCommentsDraftResetKey] = useState(0);
  /** Bumped to ask DocumentCommentsPanel to delete/hide every thread currently visible. */
  const [commentsClearAllNonce, setCommentsClearAllNonce] = useState(0);
  /**
   * Tab scope for the last Clear all (parent switches to "mine" in the same batch, so the panel
   * must still clear threads from the tab the user was on — e.g. "For you").
   */
  const [clearAllScopeTab, setClearAllScopeTab] = useState<
    "mine" | "foryou" | "all" | null
  >(null);
  const [commentsNotifications, setCommentsNotifications] = useState<
    Array<{
      notificationId: string;
      threadId: string;
      threadTotalCommentCount: number;
      anchorText: string;
      targetText: string;
      message: string;
      createdAt: number;
    }>
  >([]);
  /** threadId → visible comment count last acknowledged (v4 localStorage) */
  const [seenThreadCommentCounts, setSeenThreadCommentCounts] = useState<
    Record<string, number>
  >({});
  const [commentsNotifOpen, setCommentsNotifOpen] = useState(false);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextSeenPersistRef = useRef(true);
  const [selectionAnchor, setSelectionAnchor] = useState<TextSelectionAnchor | null>(
    null,
  );
  const [aiPromptOpen, setAiPromptOpen] = useState(false);
  const [aiMode, setAiMode] = useState<"rewrite" | "image">("rewrite");
  const [aiTextMode, setAiTextMode] = useState<"ai" | "smart">("smart");
  const [aiInstruction, setAiInstruction] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiImageBusy, setAiImageBusy] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiMoreMenuOpen, setAiMoreMenuOpen] = useState(false);
  const [aiToolsMenuOpen, setAiToolsMenuOpen] = useState(false);
  const aiPromptRef = useRef<HTMLDivElement | null>(null);
  const [aiSelection, setAiSelection] = useState<{
    from: number;
    to: number;
    selectedText: string;
  } | null>(null);
  const [aiCandidate, setAiCandidate] = useState<{
    from: number;
    to: number;
    selectedText: string;
    rewrittenText: string;
  } | null>(null);
  const [aiCandidateActions, setAiCandidateActions] = useState<AiAction[] | null>(null);
  const [aiCandidateAnchor, setAiCandidateAnchor] = useState<{
    left: number;
    top: number;
  } | null>(null);

  const aiRuntime = useQuery(api.platformSettings.getAiRuntime);
  const aiProvider = aiRuntime?.aiProvider ?? "gemini";
  const groqClipdropImages = !!(aiRuntime?.groqClipdropImages);
  const siteAiEnabled = aiRuntime?.aiEnabled !== false;
  const siteImportFromComputerEnabled =
    aiRuntime?.importFromComputerEnabled !== false;
  const allowAiImage = aiProvider !== "groq" || groqClipdropImages;
  const rewriteToolbarTitle =
    aiProvider === "groq"
      ? "Rewrite with Groq"
      : aiProvider === "byok"
        ? "Rewrite with your Gemini key"
        : "Rewrite with Gemini";

  const showImageAiUI = siteAiEnabled && allowAiImage && aiMode === "image";

  const aiMarqueeText = useMemo(() => {
    if (aiRuntime !== undefined && aiRuntime.aiEnabled === false) {
      return "Namaste! Welcome — thank you for visiting.";
    }
    if (accessRole === "viewer") return null;
    if (aiProvider === "byok") {
      if (!aiRuntime?.hasUserByok) {
        return "Namaste! Please add your Gemini API key to use AI suggestions.";
      }
      return "Namaste! AI suggestions use your Gemini key — select text and open the AI panel.";
    }
    if (aiProvider === "groq") {
      return "Namaste! Try AI suggestions for your help — Groq powers rewrites in this project.";
    }
    return "Namaste! Try AI suggestions for your help — powered by Gemini.";
  }, [accessRole, aiProvider, aiRuntime, aiRuntime?.hasUserByok]);

  const openByokKeyDialog = useCallback(() => {
    setAiByokFormError("");
    setAiByokDraft("");
    setByokNewKeyVisible(false);
    setByokStoredReveal(false);
    setByokStoredFullKey(null);
    if (aiRuntime?.hasUserByok) {
      setAiByokManageOpen(true);
    } else {
      setAiByokSetupOpen(true);
    }
  }, [aiRuntime?.hasUserByok]);

  const [aiByokSetupOpen, setAiByokSetupOpen] = useState(false);
  const [aiByokManageOpen, setAiByokManageOpen] = useState(false);
  const [aiByokDraft, setAiByokDraft] = useState("");
  const [aiByokBusy, setAiByokBusy] = useState(false);
  const [aiByokFormError, setAiByokFormError] = useState("");
  const [byokNewKeyVisible, setByokNewKeyVisible] = useState(false);
  const [byokStoredReveal, setByokStoredReveal] = useState(false);
  const [byokStoredFullKey, setByokStoredFullKey] = useState<string | null>(null);
  const [byokStoredRevealBusy, setByokStoredRevealBusy] = useState(false);

  useEffect(() => {
    skipNextSeenPersistRef.current = true;
    setSeenThreadCommentCounts(loadSeenThreadCountsFromStorage(commentSeenStorageKey));
  }, [commentSeenStorageKey]);

  useEffect(() => {
    if (skipNextSeenPersistRef.current) {
      skipNextSeenPersistRef.current = false;
      return;
    }
    saveSeenThreadCountsToStorage(commentSeenStorageKey, seenThreadCommentCounts);
  }, [commentSeenStorageKey, seenThreadCommentCounts]);

  const handleNotificationsChange = useCallback(
    (
      items: Array<{
        notificationId: string;
        threadId: string;
        threadTotalCommentCount: number;
        anchorText: string;
        targetText: string;
        message: string;
        createdAt: number;
      }>,
    ) => {
      setCommentsNotifications((prev) => {
        if (prev.length === items.length) {
          let same = true;
          for (let i = 0; i < prev.length; i += 1) {
            const a = prev[i]!;
            const b = items[i]!;
            if (
              a.notificationId !== b.notificationId ||
              a.threadId !== b.threadId ||
              a.threadTotalCommentCount !== b.threadTotalCommentCount ||
              a.anchorText !== b.anchorText ||
              a.targetText !== b.targetText ||
              a.message !== b.message ||
              a.createdAt !== b.createdAt
            ) {
              same = false;
              break;
            }
          }
          if (same) return prev;
        }
        return items;
      });
    },
    [],
  );
  const unseenNotificationCount = useMemo(
    () =>
      commentsNotifications.filter((n) => {
        const ack = seenThreadCommentCounts[n.threadId] ?? 0;
        return n.threadTotalCommentCount > ack;
      }).length,
    [commentsNotifications, seenThreadCommentCounts],
  );

  /**
   * Mark “for you” alert threads read when the user opens the **For you** tab (not just the
   * comments sidebar). Restores the old bell/header clear-on-review behaviour without wiping
   * unread the moment the sidebar opens on Mine / All.
   */
  useEffect(() => {
    if (commentsTab !== "foryou" || !commentSeenStorageKey) return;
    if (commentsNotifications.length === 0) return;
    setSeenThreadCommentCounts((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const n of commentsNotifications) {
        const merged = Math.max(prev[n.threadId] ?? 0, n.threadTotalCommentCount);
        if (next[n.threadId] !== merged) {
          changed = true;
          next[n.threadId] = merged;
        }
      }
      return changed ? next : prev;
    });
  }, [commentsTab, commentSeenStorageKey, commentsNotifications]);

  const knownUserEmails = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of document.collaborators ?? []) {
      map[c.userId] = c.email;
    }
    return map;
  }, [document.collaborators]);
  const moderatedCommentKeys = useMemo(() => {
    const set = new Set<string>();
    for (const m of document.moderatedComments ?? []) {
      set.add(`${m.threadId}:${m.commentId}`);
    }
    return set;
  }, [document.moderatedComments]);

  const zoomLevel = useUiStore((s) => s.zoomLevel);
  const isLeftSidebarOpen = useUiStore((s) => s.isLeftSidebarOpen);
  const setLeftSidebarOpen = useUiStore((s) => s.setLeftSidebarOpen);
  const isRightSidebarOpen = useUiStore((s) => s.isRightSidebarOpen);
  const setRightSidebarOpen = useUiStore((s) => s.setRightSidebarOpen);
  useEffect(() => {
    if (clearAllScopeTab === null) return;
    setClearAllScopeTab(null);
  }, [clearAllScopeTab]);
  const isRulerVisible = useUiStore((s) => s.isRulerVisible);
  const zoomScale = Math.max(0.25, zoomLevel / 100);
  const editorContainerRef = useRef<HTMLDivElement | null>(null);
  const imageDragActiveRef = useRef(false);
  const [showImageCenterGuide, setShowImageCenterGuide] = useState(false);
  /** Document-space margins (816px width); ruler converts mouse ↔ doc coords so markers align with text at any zoom. */
  const [docLeftMarginPx, setDocLeftMarginPx] = useState(64);
  const [docRightMarginPx, setDocRightMarginPx] = useState(64);

  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const menubarActionsValue = useMemo(
    () => ({
      focusTitleForRename: () => {
        titleInputRef.current?.focus();
        queueMicrotask(() => titleInputRef.current?.select());
      },
      triggerImageUpload: () => imageInputRef.current?.click(),
    }),
    [],
  );

  const scheduleToolbarSync = useSyncToolbar();
  const toolbarSyncRef = useRef(scheduleToolbarSync);
  useEffect(() => {
    toolbarSyncRef.current = scheduleToolbarSync;
  }, [scheduleToolbarSync]);

  const editor = useEditor(
    {
    extensions: [
      StarterKit.configure({
        undoRedo: false,
        link: false,
        underline: false,
      }),
      /**
       * `@tiptap/extension-collaboration` has its own history handling.
       * Keep StarterKit undo/redo OFF to avoid command conflicts.
       */
      Collaboration.configure({
        document: yDoc,
        field: "default",
      }),
      Underline,
      Superscript,
      Subscript,
      TextStyle,
      FontFamily,
      FontSize,
      LineHeight,
      Color,
      Highlight.configure({ multicolor: true }),
      CharacterCount.configure({ limit: null }),
      TaskList,
      TaskItem.configure({ nested: true }),
      TextAlignInlineImageSafe.configure({
        types: ["heading", "paragraph"],
        alignments: ["left", "center", "right", "justify"],
      }),
      BlockIndent,
      Table.configure({
        resizable: true,
        HTMLAttributes: { class: "doc-table" },
      }),
      TableRow,
      TableHeader,
      TableCellWithBg,
      PageBreak,
      AutoPagination.configure({ pageHeightPx: getDocxPageHeightPx() }),
      TwoColumnSection,
      PageChrome,
      CommentHoverHighlight,
      TiptapLink.configure({
        openOnClick: true,
        autolink: true,
        defaultProtocol: "https",
        HTMLAttributes: {
          target: "_blank",
          rel: "noopener noreferrer",
        },
      }),
      AlignableImage.configure({
        inline: true,
        allowBase64: true,
        resize: {
          enabled: true,
          minWidth: 50,
          minHeight: 50,
        },
      }),
    ],
    shouldRerenderOnTransaction: false,
    content: "<p></p>",
    immediatelyRender: false,
    editorProps: {
      attributes: {
        /* Paper sizing / padding come from globals.css `.tiptap.ProseMirror` */
        class:
          "tiptap ProseMirror min-w-0 outline-none focus-visible:ring-0",
        spellcheck: "false",
        autocorrect: "off",
        autocomplete: "off",
        autocapitalize: "off",
        "data-gramm": "false",
        "data-gramm_editor": "false",
        "data-enable-grammarly": "false",
      },
      handlePaste: (_view, event) => {
        const html = event.clipboardData?.getData("text/html");
        if (!html) return false;
        const clean = sanitizePasteHtml(html);
        editor?.commands.insertContent(clean, {
          parseOptions: { preserveWhitespace: false },
        });
        return true;
      },
    },
    onSelectionUpdate: ({ editor: e }) => toolbarSyncRef.current(e),
    },
    [yDoc],
  );

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(accessRole !== "viewer" && editorViewMode !== "viewing");
  }, [accessRole, editor, editorViewMode]);

  const refreshSelectionAnchor = useCallback(() => {
    if (!editor || accessRole === "viewer" || editorViewMode === "viewing") {
      setSelectionAnchor(null);
      return;
    }
    const { from, to } = editor.state.selection;
    if (from === to) {
      setSelectionAnchor(null);
      return;
    }

    const selectedText = editor.state.doc.textBetween(from, to, " ").trim();
    if (!selectedText || selectedText.length > 4000) {
      setSelectionAnchor(null);
      return;
    }

    try {
      const start = editor.view.coordsAtPos(from);
      const end = editor.view.coordsAtPos(to);
      const left = Math.round((start.left + end.right) / 2);
      const top = Math.round(Math.min(start.top, end.top) - 10);
      setSelectionAnchor({ from, to, selectedText, left, top });
    } catch {
      setSelectionAnchor(null);
    }
  }, [accessRole, editor, editorViewMode]);

  useEffect(() => {
    if (!editor) return;
    const onSelectionUpdate = () => refreshSelectionAnchor();
    const onBlur = () => {
      setSelectionAnchor(null);
    };
    editor.on("selectionUpdate", onSelectionUpdate);
    editor.on("blur", onBlur);
    refreshSelectionAnchor();
    return () => {
      editor.off("selectionUpdate", onSelectionUpdate);
      editor.off("blur", onBlur);
    };
  }, [editor, refreshSelectionAnchor]);

  useEffect(() => {
    if (!aiPromptOpen || !editor) return;
    const syncPromptVisibility = () => {
      const { from, to } = editor.state.selection;
      if (from !== to) return;
      setAiPromptOpen(false);
      setAiInstruction("");
      setAiError("");
      setAiSelection(null);
    };
    editor.on("selectionUpdate", syncPromptVisibility);
    editor.on("blur", syncPromptVisibility);
    return () => {
      editor.off("selectionUpdate", syncPromptVisibility);
      editor.off("blur", syncPromptVisibility);
    };
  }, [aiPromptOpen, editor]);

  useEffect(() => {
    if (!selectionAnchor) return;
    const onWindowMove = () => refreshSelectionAnchor();
    window.addEventListener("resize", onWindowMove);
    window.addEventListener("scroll", onWindowMove, true);
    return () => {
      window.removeEventListener("resize", onWindowMove);
      window.removeEventListener("scroll", onWindowMove, true);
    };
  }, [refreshSelectionAnchor, selectionAnchor]);

  const previewCommentAnchor = useCallback(
    (anchorText: string | null) => {
      if (!editor) return;
      if (!anchorText?.trim()) {
        editor.commands.clearCommentHoverRange();
        return;
      }
      const range = findTextRangeInDoc(editor.state.doc, anchorText);
      if (!range) {
        editor.commands.clearCommentHoverRange();
        return;
      }
      editor.commands.setCommentHoverRange(range.from, range.to);
    },
    [editor],
  );

  const jumpToCommentAnchor = useCallback(
    (anchorText: string) => {
      if (!editor) return;
      const range = findTextRangeInDoc(editor.state.doc, anchorText);
      if (!range) return;
      editor.commands.clearCommentHoverRange();
      editor.chain().focus().setTextSelection(range).scrollIntoView().run();
    },
    [editor],
  );

  const flashCommentTarget = useCallback(
    (targetText: string, fallbackAnchorText: string) => {
      if (!editor) return;
      const primary = targetText.trim();
      const fallback = fallbackAnchorText.trim();
      const range =
        (primary && findTextRangeInDoc(editor.state.doc, primary)) ||
        (fallback && findTextRangeInDoc(editor.state.doc, fallback));
      if (!range) return;
      editor.chain().focus().setTextSelection(range).scrollIntoView().run();
      editor.commands.setCommentHoverRange(range.from, range.to);
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
      flashTimerRef.current = setTimeout(() => {
        editor.commands.clearCommentHoverRange();
      }, 1000);
    },
    [editor],
  );

  useEffect(() => {
    if (!editor || isRightSidebarOpen) return;
    editor.commands.clearCommentHoverRange();
  }, [editor, isRightSidebarOpen]);

  useEffect(
    () => () => {
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    if (!editor) return;
    const onTx = () => setChromeTick((n) => n + 1);
    editor.on("transaction", onTx);
    return () => {
      editor.off("transaction", onTx);
    };
  }, [editor]);

  const uploadImageFile = useCallback(
    async (file: File): Promise<string | null> => {
      try {
        const postUrl = await generateImageUploadUrl();
        const res = await fetch(postUrl, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!res.ok) throw new Error("upload failed");
        const json = (await res.json()) as { storageId: string };
        return await finalizeImageUpload({
          storageId: json.storageId as Id<"_storage">,
        });
      } catch {
        return null;
      }
    },
    [finalizeImageUpload, generateImageUploadUrl],
  );

  const handleImageUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file || !editor) return;
    if (file.size > RAW_IMAGE_FILE_MAX_BYTES) {
      window.alert("Image file is too large (max 15 MB).");
      event.target.value = "";
      return;
    }
    try {
      const url = await uploadImageFile(file);
      if (url) {
        editor.chain().focus().setImage({ src: url }).run();
      } else {
        const dataUrl = await imageFileToCompressedDataUrl(file);
        if (dataUrl.length > MAX_IMAGE_DATA_URL_CHARS) {
          window.alert(
            "Image is still too large after compressing. Try a smaller photo or use Image URL (https://…).",
          );
          event.target.value = "";
          return;
        }
        editor.chain().focus().setImage({ src: dataUrl }).run();
      }
    } catch {
      window.alert("Could not read this image file.");
    }
    event.target.value = "";
  };

  const handleEditorDragOver = (e: React.DragEvent) => {
    const hasFile = e.dataTransfer?.files && e.dataTransfer.files.length > 0;
    if (!hasFile) return;
    const hasImage = Array.from(e.dataTransfer.files).some((f) =>
      f.type.startsWith("image/"),
    );
    if (!hasImage) return;
    e.preventDefault();
  };

  const handleEditorDrop = async (e: React.DragEvent) => {
    if (!editor) return;
    const hasFile = e.dataTransfer?.files && e.dataTransfer.files.length > 0;
    if (!hasFile) return;
    const file = Array.from(e.dataTransfer.files).find((f) =>
      f.type.startsWith("image/"),
    );
    if (!file) return;
    e.preventDefault();
    if (file.size > RAW_IMAGE_FILE_MAX_BYTES) {
      window.alert("Image file is too large (max 15 MB).");
      return;
    }
    try {
      const url = await uploadImageFile(file);
      if (url) {
        editor.chain().focus().setImage({ src: url }).run();
        return;
      }
      const dataUrl = await imageFileToCompressedDataUrl(file);
      if (dataUrl.length > MAX_IMAGE_DATA_URL_CHARS) {
        window.alert(
          "Image is still too large after compressing. Try a smaller photo or use Image URL (https://…).",
        );
        return;
      }
      editor.chain().focus().setImage({ src: dataUrl }).run();
    } catch {
      window.alert("Could not read this image file.");
    }
  };

  const handleDocxImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    try {
      if (!siteImportFromComputerEnabled || !file || !editor) return;
      const html = await docxToHtml(file);
      editor.commands.setContent(html, { emitUpdate: true });
      editor.commands.focus("start");
    } catch (err) {
      console.error("[DocxImport] failed:", err);
      window.alert("Could not import this .docx file. Please try again.");
    } finally {
      event.target.value = "";
    }
  };

  const openCommentsFromSelection = useCallback(() => {
    if (!selectionAnchor) return;
    setRightSidebarOpen(true);
    setCommentsSelectionPrefill(selectionAnchor.selectedText);
    setCommentsComposerFocusNonce((n) => n + 1);
  }, [selectionAnchor, setRightSidebarOpen]);

  const openAiPromptUIPanel = useCallback(() => {
    if (!siteAiEnabled) return;
    if (!selectionAnchor) return;
    setAiMode("rewrite");
    setAiTextMode("ai");
    setAiError("");
    setAiInstruction("");
    setAiCandidate(null);
    setAiCandidateActions(null);
    setAiToolsMenuOpen(false);
    setAiSelection({
      from: selectionAnchor.from,
      to: selectionAnchor.to,
      selectedText: selectionAnchor.selectedText,
    });
    setAiPromptOpen(true);
    setAiMoreMenuOpen(false);
  }, [selectionAnchor, siteAiEnabled]);

  const openAiRewritePrompt = useCallback(() => {
    if (!siteAiEnabled) return;
    if (!selectionAnchor) return;
    if (aiProvider === "byok" && !aiRuntime?.hasUserByok) {
      setAiByokDraft("");
      setAiByokFormError("");
      setAiByokSetupOpen(true);
      return;
    }
    openAiPromptUIPanel();
  }, [
    aiProvider,
    aiRuntime?.hasUserByok,
    openAiPromptUIPanel,
    selectionAnchor,
    siteAiEnabled,
  ]);

  useEffect(() => {
    if (aiRuntime === undefined) return;
    if (aiRuntime.aiEnabled !== false) return;
    setAiPromptOpen(false);
    setAiToolsMenuOpen(false);
    setAiMoreMenuOpen(false);
    setAiSelection(null);
    setAiInstruction("");
    setAiError("");
    setAiCandidate(null);
    setAiCandidateActions(null);
    setAiCandidateAnchor(null);
    setAiMode("rewrite");
  }, [aiRuntime]);

  const submitAiRewrite = useCallback(async () => {
    if (!siteAiEnabled) return;
    if (!aiSelection) return;
    const instruction = aiInstruction.trim();
    if (!instruction) {
      setAiError("Please describe what you want the AI to do.");
      return;
    }

    if (
      aiTextMode === "smart" &&
      editor &&
      tryApplySmartSelectionAction(editor, aiSelection, instruction)
    ) {
      setAiPromptOpen(false);
      setAiInstruction("");
      setAiError("");
      setAiMoreMenuOpen(false);
      setAiToolsMenuOpen(false);
      setAiSelection(null);
      setSelectionAnchor(null);
      setAiCandidateActions(null);
      return;
    }

    setAiBusy(true);
    setAiError("");
    try {
      const res = await fetch("/api/ai-rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selectedText: aiSelection.selectedText,
          instruction,
        }),
      });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || "Rewrite failed");
      }
      const data = (await res.json()) as {
        intent?: unknown;
        rewrittenText?: unknown;
        actions?: unknown;
      };
      const intent: AiIntent =
        data.intent === "format" || data.intent === "mixed" || data.intent === "rewrite"
          ? data.intent
          : "rewrite";
      const rewrittenText =
        typeof data.rewrittenText === "string" ? data.rewrittenText.trim() : "";
      const actions = normalizeAiActions(data.actions);

      if ((intent === "format" || (intent === "mixed" && !rewrittenText)) && actions.length) {
        if (!editor) throw new Error("Editor not ready");
        const applied = applyAiActions(editor, aiSelection, actions);
        if (!applied) throw new Error("AI returned unsupported format action");
        setAiPromptOpen(false);
        setAiInstruction("");
        setAiSelection(null);
        setSelectionAnchor(null);
        setAiCandidate(null);
        setAiCandidateActions(null);
        return;
      }

      if (!rewrittenText && actions.length && editor) {
        const applied = applyAiActions(editor, aiSelection, actions);
        if (applied) {
          setAiPromptOpen(false);
          setAiInstruction("");
          setAiSelection(null);
          setSelectionAnchor(null);
          setAiCandidate(null);
          setAiCandidateActions(null);
          return;
        }
      }

      if (!rewrittenText) throw new Error("AI returned no actionable result");
      setAiCandidate({
        from: aiSelection.from,
        to: aiSelection.to,
        selectedText: aiSelection.selectedText,
        rewrittenText,
      });
      setAiCandidateActions(actions.length ? actions : null);
      setAiPromptOpen(false);
      setAiInstruction("");
      setAiSelection(null);
      setSelectionAnchor(null);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "Rewrite failed");
    } finally {
      setAiBusy(false);
    }
  }, [aiInstruction, aiSelection, editor, aiTextMode, siteAiEnabled]);

  const createImageWithGemini = useCallback(async () => {
    if (!siteAiEnabled) return;
    if (!editor || !allowAiImage) return;
    const inst = aiInstruction.trim();
    const sel = (aiSelection?.selectedText ?? "").trim();
    /** Groq + Clipdrop: empty box → selected text only; if you typed anything, that alone is the prompt. */
    const clipdropImage = aiProvider === "groq" && groqClipdropImages;
    const prompt = clipdropImage ? (inst ? inst : sel) : inst || sel || "";
    if (!prompt) {
      setAiError(
        clipdropImage
          ? "Select text in the document, or describe the image below, then send."
          : "Type text (or keep text selected) to create image.",
      );
      return;
    }
    setAiImageBusy(true);
    setAiError("");
    setAiToolsMenuOpen(false);
    try {
      const res = await fetch("/api/ai-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || "Image generation failed");
      }
      const data = (await res.json()) as { imageDataUrl?: string };
      if (!data.imageDataUrl) throw new Error("No image returned");
      editor.chain().focus().setImage({ src: data.imageDataUrl }).run();
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "Image generation failed");
    } finally {
      setAiImageBusy(false);
    }
  }, [
    aiInstruction,
    aiProvider,
    aiSelection?.selectedText,
    allowAiImage,
    editor,
    groqClipdropImages,
    siteAiEnabled,
  ]);

  const activateImageMode = useCallback(() => {
    if (!siteAiEnabled || !allowAiImage) return;
    setAiMode("image");
    setAiError("");
    setAiCandidate(null);
    setAiMoreMenuOpen(false);
    setAiToolsMenuOpen(false);
    if (aiProvider === "groq" && groqClipdropImages) {
      setAiInstruction("");
    }
  }, [allowAiImage, aiProvider, groqClipdropImages, siteAiEnabled]);

  const persistByokKey = useCallback(async (key: string) => {
    const k = key.trim();
    if (!k) {
      setAiByokFormError("Paste your Gemini API key from Google AI Studio.");
      return false;
    }
    if (!isValidGeminiApiKeyShape(k)) {
      setAiByokFormError(
        'Invalid Gemini API key. Keys from Google AI Studio start with "AIza" or "AQ." and are about 39 characters.',
      );
      return false;
    }
    setAiByokBusy(true);
    setAiByokFormError("");
    try {
      const res = await fetch("/api/user-byok", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ geminiApiKey: k }),
      });
      if (!res.ok) throw new Error((await res.text()) || "Save failed");
      return true;
    } catch (e) {
      setAiByokFormError(e instanceof Error ? e.message : "Save failed");
      return false;
    } finally {
      setAiByokBusy(false);
    }
  }, []);

  const toggleStoredKeyReveal = useCallback(async () => {
    if (byokStoredReveal) {
      setByokStoredReveal(false);
      setByokStoredFullKey(null);
      return;
    }
    setByokStoredRevealBusy(true);
    setAiByokFormError("");
    try {
      const res = await fetch("/api/user-byok");
      if (!res.ok) throw new Error((await res.text()) || "Could not load key");
      const data = (await res.json()) as { geminiApiKey?: string };
      setByokStoredFullKey(data.geminiApiKey ?? "");
      setByokStoredReveal(true);
    } catch (e) {
      setAiByokFormError(e instanceof Error ? e.message : "Could not load key");
    } finally {
      setByokStoredRevealBusy(false);
    }
  }, [byokStoredReveal]);

  const submitByokSetupAndOpenAi = useCallback(async () => {
    const ok = await persistByokKey(aiByokDraft);
    if (!ok) return;
    setAiByokSetupOpen(false);
    setAiByokDraft("");
    setByokNewKeyVisible(false);
    openAiPromptUIPanel();
  }, [aiByokDraft, openAiPromptUIPanel, persistByokKey]);

  const saveByokFromManage = useCallback(async () => {
    const ok = await persistByokKey(aiByokDraft);
    if (!ok) return;
    setAiByokManageOpen(false);
    setAiByokDraft("");
    setByokNewKeyVisible(false);
    setByokStoredReveal(false);
    setByokStoredFullKey(null);
  }, [aiByokDraft, persistByokKey]);

  const removeByokKey = useCallback(async () => {
    setAiByokBusy(true);
    setAiByokFormError("");
    try {
      const res = await fetch("/api/user-byok", { method: "DELETE" });
      if (!res.ok) throw new Error((await res.text()) || "Remove failed");
      setAiByokManageOpen(false);
      setAiByokDraft("");
      setByokStoredReveal(false);
      setByokStoredFullKey(null);
      setByokNewKeyVisible(false);
    } catch (e) {
      setAiByokFormError(e instanceof Error ? e.message : "Remove failed");
    } finally {
      setAiByokBusy(false);
    }
  }, []);

  const handleAiSubmit = useCallback(async () => {
    if (!siteAiEnabled) return;
    if (allowAiImage && aiMode === "image") {
      await createImageWithGemini();
      return;
    }
    await submitAiRewrite();
  }, [aiMode, allowAiImage, createImageWithGemini, siteAiEnabled, submitAiRewrite]);

  const reopenAiPromptForRange = useCallback(
    (from: number, to: number) => {
      if (!siteAiEnabled) return;
      if (!editor) return;
      const max = editor.state.doc.content.size;
      const safeFrom = Math.max(1, Math.min(from, max));
      const safeTo = Math.max(safeFrom, Math.min(to, max));
      const selectedText = editor.state.doc.textBetween(safeFrom, safeTo, " ").trim();
      if (!selectedText) return;
      editor.chain().focus().setTextSelection({ from: safeFrom, to: safeTo }).run();
      setAiSelection({ from: safeFrom, to: safeTo, selectedText });
      setAiPromptOpen(true);
      setAiInstruction("");
      setAiError("");
      setAiMoreMenuOpen(false);
      setAiToolsMenuOpen(false);
    },
    [editor, siteAiEnabled],
  );

  const acceptAiRewrite = useCallback(() => {
    if (!editor || !aiCandidate) return;
    const nextFrom = aiCandidate.from;
    const nextTo = aiCandidate.from + aiCandidate.rewrittenText.length;
    editor
      .chain()
      .focus()
      .insertContentAt(
        { from: aiCandidate.from, to: aiCandidate.to },
        aiCandidate.rewrittenText,
      )
      .run();
    if (aiCandidateActions && aiCandidateActions.length > 0) {
      applyAiActions(
        editor,
        { from: nextFrom, to: nextTo, selectedText: aiCandidate.rewrittenText },
        aiCandidateActions,
      );
    }
    setAiCandidate(null);
    setAiCandidateActions(null);
    setSelectionAnchor(null);
    reopenAiPromptForRange(nextFrom, nextTo);
  }, [aiCandidate, aiCandidateActions, editor, reopenAiPromptForRange]);

  const rejectAiRewrite = useCallback(() => {
    if (!aiCandidate) return;
    setAiMode("rewrite");
    setAiCandidate(null);
    setAiCandidateActions(null);
    setSelectionAnchor(null);
    reopenAiPromptForRange(aiCandidate.from, aiCandidate.to);
  }, [aiCandidate, reopenAiPromptForRange]);

  useEffect(() => {
    if (!editor || !aiPromptOpen || !aiSelection) return;
    editor.commands.setCommentHoverRange(aiSelection.from, aiSelection.to);
    return () => {
      editor.commands.clearCommentHoverRange();
    };
  }, [aiPromptOpen, aiSelection, editor]);

  useEffect(() => {
    if (!editor) return;

    const editorDom = editor.view.dom as HTMLElement;
    const isImageTarget = (target: EventTarget | null): boolean => {
      if (!(target instanceof Element)) return false;
      return !!target.closest(".ProseMirror img");
    };

    const stopGuide = () => {
      imageDragActiveRef.current = false;
      setShowImageCenterGuide(false);
    };

    const onDragStart = (event: DragEvent) => {
      if (!isImageTarget(event.target)) return;
      imageDragActiveRef.current = true;
      setShowImageCenterGuide(false);
    };

    const onDragOver = (event: DragEvent) => {
      if (!imageDragActiveRef.current) return;
      const rect = editorContainerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const centerX = rect.left + rect.width / 2;
      const nearCenter = Math.abs(event.clientX - centerX) <= 4;
      setShowImageCenterGuide(nearCenter);
    };

    editorDom.addEventListener("dragstart", onDragStart);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", stopGuide);
    window.addEventListener("dragend", stopGuide);
    window.addEventListener("mouseup", stopGuide);

    return () => {
      editorDom.removeEventListener("dragstart", onDragStart);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", stopGuide);
      window.removeEventListener("dragend", stopGuide);
      window.removeEventListener("mouseup", stopGuide);
      stopGuide();
    };
  }, [editor]);

  useEffect(() => {
    if (!editor || !aiCandidate || !editorContainerRef.current) return;

    const updateAnchor = () => {
      try {
        const start = editor.view.coordsAtPos(aiCandidate.from);
        const hostRect = editorContainerRef.current?.getBoundingClientRect();
        const pageRect = (editor.view.dom as HTMLElement).getBoundingClientRect();
        if (!hostRect) return;
        const boxWidth = Math.min(520, Math.max(280, pageRect.width - 24));
        const minLeft = Math.max(12, pageRect.left - hostRect.left + 8);
        const maxLeft = Math.max(minLeft, pageRect.right - hostRect.left - boxWidth - 8);
        const rawLeft = start.left - hostRect.left;
        const left = Math.min(maxLeft, Math.max(minLeft, rawLeft));
        const top = Math.max(12, start.top - hostRect.top - 8);
        setAiCandidateAnchor({ left, top });
      } catch {
        setAiCandidateAnchor(null);
      }
    };

    updateAnchor();
    window.addEventListener("resize", updateAnchor);
    window.addEventListener("scroll", updateAnchor, true);
    return () => {
      window.removeEventListener("resize", updateAnchor);
      window.removeEventListener("scroll", updateAnchor, true);
    };
  }, [editor, aiCandidate]);

  useEffect(() => {
    if (!aiPromptOpen) return;
    const onDown = (event: MouseEvent) => {
      if (!aiPromptRef.current) return;
      if (aiPromptRef.current.contains(event.target as Node)) return;
      setAiMoreMenuOpen(false);
      setAiToolsMenuOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("mousedown", onDown);
    };
  }, [aiPromptOpen]);

  /** Non-main tabs: show the editor as soon as Yjs is synced (no artificial delay). */
  useLayoutEffect(() => {
    if (!editor || !ySynced) return;
    if (tabKey === "main") return;
    if (seededFromConvexRef.current) return;
    seededFromConvexRef.current = true;
    setHydrationDone(true);
  }, [editor, ySynced, tabKey]);

  /** Main tab: optional one-shot Convex HTML seed; delay only when Yjs might still be empty. */
  useEffect(() => {
    if (!editor || !ySynced) return;
    if (tabKey !== "main") return;
    if (seededFromConvexRef.current) return;

    const fragmentLen = yDoc.getXmlFragment("default").length;
    const seedDelayMs = fragmentLen > 0 ? 0 : CONVEX_SEED_DELAY_MS;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled || !editor) return;
      if (seededFromConvexRef.current) return;

      const fragment = yDoc.getXmlFragment("default");

      const html = document.content?.trim();
      const meaningful =
        html &&
        html !== "<p></p>" &&
        html !== "<p>Loading...</p>" &&
        html !== "<p>Start writing...</p>";

      const shouldHydrate =
        editor.isEmpty ||
        shouldHydrateConvexIntoYjs(editor, html ?? "", fragment.length);

      if (meaningful && shouldHydrate) {
        editor.commands.setContent(html, { emitUpdate: true });
        lastSavedRef.current = html;
        editor.chain().focus("end").run();
      }
      seededFromConvexRef.current = true;
      setHydrationDone(true);
    }, seedDelayMs);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [editor, ySynced, document.content, document._id, yDoc, tabKey]);

  useEffect(() => {
    if (!editor || tabKey !== "main" || accessRole === "viewer") return;

    let timeout: ReturnType<typeof setTimeout> | null = null;

    const onUpdate = () => {
      if (timeout) clearTimeout(timeout);

      timeout = setTimeout(async () => {
        const html = editor.getHTML();
        if (html === lastSavedRef.current) return;

        if (new Blob([html]).size > 900_000) {
          setSaveStatus("error");
          return;
        }

        try {
          setSaveStatus("saving");
          await updateDocument({
            id: document._id,
            content: html,
          });
          lastSavedRef.current = html;
          setSaveStatus("saved");
        } catch {
          setSaveStatus("error");
        }
      }, AUTOSAVE_MS);
    };

    editor.on("update", onUpdate);

    return () => {
      editor.off("update", onUpdate);
      if (timeout) clearTimeout(timeout);
    };
  }, [accessRole, editor, document._id, updateDocument, tabKey]);

  useEffect(() => {
    if (!editor || tabKey !== "main" || accessRole === "viewer") return;
    const flushToConvex = () => {
      if (typeof window === "undefined") return;
      if (window.document.visibilityState === "visible") return;
      const html = editor.getHTML();
      if (html === lastSavedRef.current) return;
      if (new Blob([html]).size > 900_000) return;
      void updateDocument({ id: document._id, content: html }).then(() => {
        lastSavedRef.current = html;
      });
    };
    window.addEventListener("pagehide", flushToConvex);
    window.addEventListener("visibilitychange", flushToConvex);
    return () => {
      window.removeEventListener("pagehide", flushToConvex);
      window.removeEventListener("visibilitychange", flushToConvex);
    };
  }, [accessRole, editor, document._id, updateDocument, tabKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const docEl = () => window.document?.documentElement;
    const removePrintLayout = () => {
      docEl()?.classList.remove("print-layout");
    };

    const onBeforePrint = () => {
      docEl()?.classList.add("print-layout");
    };
    const onAfterPrint = () => {
      removePrintLayout();
    };
    const onFocus = () => removePrintLayout();
    const onVisibility = () => {
      if (window.document.visibilityState === "visible") removePrintLayout();
    };

    // Safety: if print is canceled and afterprint isn't fired, recover theme.
    removePrintLayout();
    window.addEventListener("beforeprint", onBeforePrint);
    window.addEventListener("afterprint", onAfterPrint);
    window.addEventListener("focus", onFocus);
    window.addEventListener("visibilitychange", onVisibility);

    const media = window.matchMedia?.("print");
    const onMediaChange = (e: MediaQueryListEvent) => {
      if (!e.matches) removePrintLayout();
    };
    media?.addEventListener?.("change", onMediaChange);

    return () => {
      window.removeEventListener("beforeprint", onBeforePrint);
      window.removeEventListener("afterprint", onAfterPrint);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("visibilitychange", onVisibility);
      media?.removeEventListener?.("change", onMediaChange);
      removePrintLayout();
    };
  }, []);

  const tb = useToolbarStore(
    useShallow((s) => ({
      bold: s.bold,
      italic: s.italic,
      underline: s.underline,
      strike: s.strike,
      highlight: s.highlight,
      bulletList: s.bulletList,
      orderedList: s.orderedList,
      taskList: s.taskList,
      link: s.link,
      superscript: s.superscript,
      subscript: s.subscript,
      heading: s.heading,
      fontFamily: s.fontFamily,
      fontSize: s.fontSize,
      lineHeight: s.lineHeight,
      textAlign: s.textAlign,
    })),
  );

  return (
    <MenubarActionsProvider value={menubarActionsValue}>
      <EditorProvider editor={editor}>
        <DocumentEditorHeader
          document={document}
          titleInputRef={titleInputRef}
          saveStatus={saveStatus}
          accessRole={accessRole}
          commentUnreadCount={unseenNotificationCount}
          aiMarqueeText={aiMarqueeText}
          aiMarqueeVariant={siteAiEnabled ? "default" : "aiOff"}
          byokApiKeySlot={
            siteAiEnabled && aiProvider === "byok" && accessRole !== "viewer" ? (
              <button
                type="button"
                className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[#d9dee6] bg-white px-2 py-0.5 text-[11px] font-medium text-[#3c4043] shadow-sm hover:bg-gray-50 sm:gap-1.5 sm:px-2.5 sm:py-1 sm:text-xs"
                onClick={() => openByokKeyDialog()}
              >
                <Key className="size-3 text-[#0b57d0] sm:size-3.5" strokeWidth={2} />
                API key
              </button>
            ) : null
          }
        />

        <Dialog
          open={aiByokSetupOpen}
          onOpenChange={(open) => {
            setAiByokSetupOpen(open);
            if (!open) {
              setAiByokDraft("");
              setAiByokFormError("");
              setByokNewKeyVisible(false);
            }
          }}
        >
          <DialogContent className="max-w-md" onOpenAutoFocus={(e) => e.preventDefault()}>
            <DialogHeader>
              <DialogTitle>Gemini API key (BYOK)</DialogTitle>
              <DialogDescription>
                This project uses bring-your-own-key mode. Paste a key from{" "}
                <a
                  href="https://aistudio.google.com/apikey"
                  className="text-blue-600 underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  Google AI Studio
                </a>
                . It is encrypted on the server before storage.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <div className="relative">
                <Input
                  className="pr-10 font-mono text-sm"
                  type={byokNewKeyVisible ? "text" : "password"}
                  autoComplete="off"
                  placeholder="AIza… or AQ..."
                  value={aiByokDraft}
                  onChange={(e) => setAiByokDraft(e.target.value)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0.5 top-1/2 h-8 w-8 -translate-y-1/2 text-muted-foreground"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setByokNewKeyVisible((v) => !v)}
                  aria-label={byokNewKeyVisible ? "Hide key" : "Show key"}
                >
                  {byokNewKeyVisible ? (
                    <EyeOff className="size-4" strokeWidth={2} />
                  ) : (
                    <Eye className="size-4" strokeWidth={2} />
                  )}
                </Button>
              </div>
              {aiByokFormError ? (
                <p className="text-xs text-red-600">{aiByokFormError}</p>
              ) : null}
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setAiByokSetupOpen(false);
                    setAiByokDraft("");
                    setAiByokFormError("");
                    setByokNewKeyVisible(false);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={aiByokBusy}
                  onClick={() => void submitByokSetupAndOpenAi()}
                >
                  {aiByokBusy ? "Saving…" : "Save & continue"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog
          open={aiByokManageOpen}
          onOpenChange={(open) => {
            setAiByokManageOpen(open);
            if (!open) {
              setAiByokDraft("");
              setAiByokFormError("");
              setByokNewKeyVisible(false);
              setByokStoredReveal(false);
              setByokStoredFullKey(null);
            }
          }}
        >
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Your Gemini API key</DialogTitle>
              <DialogDescription>
                Enter a new key to replace the stored one, or remove it to enter again next time you
                use AI. Clipdrop is only for project-wide Groq + images — set{" "}
                <code className="rounded bg-muted px-1">CLIPDROP_API_KEY</code> in{" "}
                <code className="rounded bg-muted px-1">.env.local</code> on the Next.js server (not
                here).
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3">
              {aiRuntime?.hasUserByok ? (
                <div className="grid gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">Stored key</span>
                  <div className="relative flex gap-2">
                    <Input
                      readOnly
                      className="font-mono text-sm"
                      type="text"
                      autoComplete="off"
                      value={
                        byokStoredReveal && byokStoredFullKey != null
                          ? byokStoredFullKey
                          : (aiRuntime?.byokKeyPreview ?? "••••••••••••••••")
                      }
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="shrink-0"
                      disabled={aiByokBusy || byokStoredRevealBusy}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => void toggleStoredKeyReveal()}
                      aria-label={byokStoredReveal ? "Mask key" : "Show full key"}
                    >
                      {byokStoredReveal ? (
                        <EyeOff className="size-4" strokeWidth={2} />
                      ) : (
                        <Eye className="size-4" strokeWidth={2} />
                      )}
                    </Button>
                  </div>
                </div>
              ) : null}
              <div className="grid gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  Replace with new key (optional)
                </span>
                <div className="relative">
                  <Input
                    className="pr-10 font-mono text-sm"
                    type={byokNewKeyVisible ? "text" : "password"}
                    autoComplete="off"
                    placeholder="AIza… or AQ..."
                    value={aiByokDraft}
                    onChange={(e) => setAiByokDraft(e.target.value)}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0.5 top-1/2 h-8 w-8 -translate-y-1/2 text-muted-foreground"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setByokNewKeyVisible((v) => !v)}
                    aria-label={byokNewKeyVisible ? "Hide new key" : "Show new key"}
                  >
                    {byokNewKeyVisible ? (
                      <EyeOff className="size-4" strokeWidth={2} />
                    ) : (
                      <Eye className="size-4" strokeWidth={2} />
                    )}
                  </Button>
                </div>
              </div>
              {aiByokFormError ? (
                <p className="text-xs text-red-600">{aiByokFormError}</p>
              ) : null}
              <div className="flex flex-wrap justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="destructive"
                  disabled={aiByokBusy}
                  onClick={() => void removeByokKey()}
                >
                  Remove key
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setAiByokManageOpen(false);
                    setAiByokDraft("");
                    setAiByokFormError("");
                    setByokNewKeyVisible(false);
                    setByokStoredReveal(false);
                    setByokStoredFullKey(null);
                  }}
                >
                  Close
                </Button>
                <Button
                  type="button"
                  disabled={aiByokBusy || !aiByokDraft.trim()}
                  onClick={() => void saveByokFromManage()}
                >
                  {aiByokBusy ? "Saving…" : "Save new key"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

      {!editor ? (
        <div className="flex flex-1 items-center justify-center bg-[#F6EFD9] text-sm text-gray-500">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
            <span>Initializing editor...</span>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageUpload}
          />
          {siteImportFromComputerEnabled ? (
            <input
              ref={docxInputRef}
              type="file"
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="hidden"
              onChange={handleDocxImport}
            />
          ) : null}

          {accessRole === "viewer" ? (
            <div className="flex h-11 items-center border-t border-gray-200 bg-[#D3E3FD] px-4 text-sm text-[#444746]">
              View only mode
            </div>
          ) : (
            <FormattingToolbar
              editor={editor}
              tb={tb}
              imageInputRef={imageInputRef}
              docxInputRef={docxInputRef}
              importFromComputerEnabled={siteImportFromComputerEnabled}
              aiUsageHintsEnabled={siteAiEnabled}
              onOpenComments={(selectedText) => {
                setRightSidebarOpen(true);
                setCommentsSelectionPrefill(selectedText);
                setCommentsComposerFocusNonce((n) => n + 1);
              }}
            />
          )}

            <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden border-t border-[#dadce0] bg-[#f8fafc]">
              {isLeftSidebarOpen ? (
                <DocumentTabsSidebar
                  document={document}
                  editor={editor}
                  accessRole={accessRole}
                />
              ) : (
                <div className="flex w-[44px] shrink-0 justify-center border-r border-[#dadce0] bg-white pt-3 no-print">
                  <button
                    type="button"
                    className="rounded-full border border-gray-200 bg-white p-2 text-gray-700 shadow-sm hover:bg-gray-100"
                    title="Show tabs sidebar"
                    aria-label="Show tabs sidebar"
                    onClick={() => setLeftSidebarOpen(true)}
                  >
                    <PanelLeftOpen className="h-5 w-5" strokeWidth={2} />
                  </button>
                </div>
              )}

              <div className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-[#f0f4f9]">
                {!hydrationDone ? (
                  <div className="pointer-events-auto absolute inset-0 z-40 flex flex-col items-center justify-center gap-2 bg-[#f0f4f9]/90 text-sm text-gray-500">
                    <Loader2 className="h-7 w-7 animate-spin text-blue-600" />
                    <span>Loading tab…</span>
                  </div>
                ) : null}
                {/* Ruler lives inside the scroll container so horizontal centering matches the page
                    (otherwise a layout scrollbar shifts only the editor, not the ruler strip). */}
                <div
                  ref={editorContainerRef}
                  className="editor-container relative flex min-h-0 flex-1 flex-col items-center overflow-y-auto overflow-x-hidden bg-[#f0f4f9]"
                >
                  {aiCandidate && aiCandidateAnchor ? (
                    <div
                      className="pointer-events-none absolute z-20 w-[min(520px,calc(100%-24px))] rounded-md border border-[#d9dee6] bg-white px-3 py-2 shadow-sm"
                      style={{ left: aiCandidateAnchor.left, top: aiCandidateAnchor.top }}
                    >
                      <p className="whitespace-pre-wrap break-words text-sm text-[#5f6368] line-through decoration-[#5f6368]">
                        {aiCandidate.selectedText}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap break-words text-sm text-[#0b57d0]">
                        {aiCandidate.rewrittenText}
                      </p>
                    </div>
                  ) : null}
                  {showImageCenterGuide ? (
                    <div
                      className="pointer-events-none absolute inset-y-0 z-20 w-px bg-[#0B57D0]/60"
                      style={{ left: "50%", transform: "translateX(-0.5px)" }}
                      aria-hidden
                    />
                  ) : null}
                  {isRulerVisible && editor ? (
                    <div className="sticky top-0 z-10 flex h-[24px] w-full shrink-0 items-end justify-center border-b border-[#dadce0] bg-[#f0f4f9] no-print">
                      <div
                        className="h-full"
                        style={{
                          width: `${Math.round(PAGE_SURFACE_WIDTH_PX * zoomScale)}px`,
                          minWidth: `${Math.round(PAGE_SURFACE_WIDTH_PX * zoomScale)}px`,
                        }}
                      >
                        <DocumentRuler
                          pageWidthPx={PAGE_SURFACE_WIDTH_PX}
                          docLeftMarginPx={docLeftMarginPx}
                          docRightMarginPx={docRightMarginPx}
                          onBoundariesChange={({
                            docLeftMarginPx: L,
                            docRightMarginPx: R,
                          }) => {
                            setDocLeftMarginPx(L);
                            setDocRightMarginPx(R);
                          }}
                          className="h-full"
                        />
                      </div>
                    </div>
                  ) : null}

                  <div
                    className="mx-auto -mt-6 mb-20 min-h-min shrink-0 overflow-visible"
                    onDragOver={handleEditorDragOver}
                    onDrop={handleEditorDrop}
                  >
                    <div
                      className="editor-zoom-shell transition-[width] duration-150 ease-out"
                      style={{
                        width: `${Math.round(PAGE_SURFACE_WIDTH_PX * zoomScale)}px`,
                        minWidth: `${Math.round(PAGE_SURFACE_WIDTH_PX * zoomScale)}px`,
                      }}
                    >
                      <div
                        className="editor-zoom-root transition-[transform] duration-150 ease-out"
                        style={{
                          width: `${PAGE_SURFACE_WIDTH_PX}px`,
                          transform: `scale(${zoomScale})`,
                          transformOrigin: "top left",
                              ["--doc-left-boundary" as string]: `${Math.round(docLeftMarginPx)}px`,
                              ["--doc-right-boundary" as string]: `${Math.round(docRightMarginPx)}px`,
                        }}
                      >
                        <EditorContent editor={editor} />
                      </div>
                    </div>
                  </div>
                  <p className="mb-8 max-w-[816px] text-center text-xs text-gray-500 no-print">
                    {saveStatus === "saving" && "Saving…"}
                    {saveStatus === "saved" && "Saved"}
                    {saveStatus === "error" &&
                      "Save failed — try editing again"}
                    {saveStatus === "idle" &&
                      "Saves ~3s after you stop typing · Live typing uses Liveblocks"}
                  </p>
                </div>
              </div>

              <aside
                className={cn(
                  "no-print flex min-h-0 shrink-0 flex-col border-l border-[#dadce0] bg-white shadow-[inset_1px_0_0_#f1f3f4] transition-[width,padding,border-color] duration-200 ease-out",
                  isRightSidebarOpen
                    ? "w-[min(100%,340px)] min-w-[280px] max-w-[340px] p-0 sm:min-w-[300px]"
                    : "w-0 min-w-0 max-w-0 overflow-hidden border-transparent p-0 shadow-none",
                )}
                aria-hidden={!isRightSidebarOpen}
              >
              <div
                className={cn(
                  "flex min-h-0 w-full min-w-0 flex-1 flex-col",
                  !isRightSidebarOpen && "pointer-events-none invisible opacity-0",
                )}
              >
                <div className="relative flex w-full min-w-0 items-center gap-2 border-b border-[#e8eaed] px-4 py-3">
                  <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-[#202124]">
                    Comments
                  </span>
                  <button
                    type="button"
                    className="relative shrink-0 rounded-full p-2 text-[#444746] hover:bg-[#f1f3f4]"
                    title="Notifications"
                    aria-label="Notifications"
                    onClick={() => {
                      setSeenThreadCommentCounts((prev) => {
                        const next = { ...prev };
                        for (const n of commentsNotifications)
                          next[n.threadId] = Math.max(
                            prev[n.threadId] ?? 0,
                            n.threadTotalCommentCount,
                          );
                        return next;
                      });
                      setCommentsNotifOpen((v) => !v);
                    }}
                  >
                    <Bell className="h-5 w-5" strokeWidth={2} />
                    {unseenNotificationCount > 0 ? (
                      <span className="absolute -right-0.5 -top-0.5 min-w-[16px] rounded-full bg-red-500 px-1 text-center text-[10px] font-semibold leading-4 text-white">
                        {unseenNotificationCount > 99 ? "99+" : unseenNotificationCount}
                      </span>
                    ) : null}
                  </button>
                  <button
                    type="button"
                    className="shrink-0 rounded-full p-2 text-[#444746] hover:bg-[#f1f3f4]"
                    title="Close comments"
                    aria-label="Close comments"
                    onClick={() => setRightSidebarOpen(false)}
                  >
                    <X className="h-5 w-5" strokeWidth={2} />
                  </button>
                  {commentsNotifOpen ? (
                    <div className="absolute right-0 top-full z-50 mt-1 w-72 max-w-full rounded-lg border border-gray-200 bg-white p-2 shadow-lg">
                      <div className="px-1 pb-1 text-xs font-medium text-gray-500">
                        Notifications
                      </div>
                      {commentsNotifications.length === 0 ? (
                        <div className="px-1 py-2 text-xs text-gray-500">
                          No new comment notifications.
                        </div>
                      ) : (
                        commentsNotifications.map((n) => {
                          const dayLabel = daySeparatorLabel(n.createdAt);
                          const timeLabel = formatCommentTime(n.createdAt);
                          return (
                            <button
                              key={`${n.threadId}:${n.notificationId}`}
                              type="button"
                              className="mb-1 flex w-full min-w-0 gap-2 rounded-md px-2 py-2 text-left hover:bg-gray-50"
                              onClick={() => {
                                setCommentsTab("foryou");
                                setCommentsTypeFilter("all-types");
                                setSeenThreadCommentCounts((prev) => ({
                                  ...prev,
                                  [n.threadId]: Math.max(
                                    prev[n.threadId] ?? 0,
                                    n.threadTotalCommentCount,
                                  ),
                                }));
                                flashCommentTarget(n.targetText, n.anchorText);
                                setCommentsNotifOpen(false);
                              }}
                            >
                              <span className="min-w-0 flex-1 break-words text-xs text-[#1F1F1F]">
                                {n.message}
                              </span>
                              {dayLabel || timeLabel ? (
                                <div className="flex shrink-0 flex-col items-end gap-0.5 self-start text-right leading-tight">
                                  {dayLabel ? (
                                    <span className="text-[10px] font-medium text-gray-600">
                                      {dayLabel}
                                    </span>
                                  ) : null}
                                  {timeLabel ? (
                                    <span className="text-[10px] tabular-nums text-gray-400">
                                      {timeLabel}
                                    </span>
                                  ) : null}
                                </div>
                              ) : null}
                            </button>
                          );
                        })
                      )}
                    </div>
                  ) : null}
                </div>

                <div className="flex min-h-0 min-w-0 flex-1 flex-col px-4 pb-4">
                <div
                  className="mt-2 flex flex-wrap gap-x-2 gap-y-1 border-b border-transparent"
                  role="tablist"
                  aria-label="Comments scope"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={commentsTab === "mine"}
                    onClick={() => setCommentsTab("mine")}
                    className={cn(
                      "pb-2 px-1 text-sm font-medium",
                      commentsTab === "mine"
                        ? "border-b-2 border-blue-600 text-blue-600"
                        : "border-b-2 border-transparent text-gray-600 hover:text-gray-900",
                    )}
                  >
                    My comments
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={commentsTab === "foryou"}
                    onClick={() => setCommentsTab("foryou")}
                    className={cn(
                      "pb-2 px-1 text-sm font-medium",
                      commentsTab === "foryou"
                        ? "border-b-2 border-blue-600 text-blue-600"
                        : "border-b-2 border-transparent text-gray-600 hover:text-gray-900",
                    )}
                  >
                    For you
                    {unseenNotificationCount > 0 ? ` (${unseenNotificationCount})` : ""}
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={commentsTab === "all"}
                    onClick={() => setCommentsTab("all")}
                    className={cn(
                      "pb-2 px-1 text-sm font-medium",
                      commentsTab === "all"
                        ? "border-b-2 border-blue-600 text-blue-600"
                        : "border-b-2 border-transparent text-gray-600 hover:text-gray-900",
                    )}
                  >
                    All comments
                  </button>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <select
                      className="appearance-none rounded-lg border border-gray-300 bg-white py-1.5 pl-3 pr-9 text-sm text-gray-700 hover:bg-gray-50"
                      aria-label="Comment types filter"
                      value={commentsTypeFilter}
                      onChange={(e) => setCommentsTypeFilter(e.target.value)}
                    >
                      <option value="all-types">All types</option>
                      <option value="resolved">Resolved</option>
                      <option value="open">Open</option>
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-gray-500" />
                  </div>
                  <div className="relative">
                    <select
                      className="appearance-none rounded-lg border border-gray-300 bg-white py-1.5 pl-3 pr-9 text-sm text-gray-700 hover:bg-gray-50"
                      aria-label="Tabs filter"
                      value={commentsTabsFilter}
                      onChange={(e) => setCommentsTabsFilter(e.target.value)}
                    >
                      <option value="all-tabs">All tabs</option>
                      <option value="current">Current tab</option>
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-gray-500" />
                  </div>
                  <div className="ml-auto flex items-center">
                    <button
                      type="button"
                      className="cursor-pointer text-xs font-medium text-gray-600 underline decoration-gray-400 underline-offset-2 hover:text-gray-900"
                      onClick={() => {
                        const ok = window.confirm(
                          "Clear all comments from this view? Threads you created will be deleted; threads created by others will be hidden for you only.",
                        );
                        if (!ok) return;
                        setClearAllScopeTab(commentsTab);
                        setCommentsClearAllNonce((k) => k + 1);
                        setCommentsTab("mine");
                        setCommentsTypeFilter("all-types");
                        setCommentsTabsFilter("all-tabs");
                        setCommentsSelectionPrefill("");
                        setCommentsDraftResetKey((k) => k + 1);
                      }}
                    >
                      Clear all
                    </button>
                  </div>
                </div>

                <div className="mt-4 flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden">
                  <DocumentCommentsPanel
                    tabKey={tabKey}
                    roomId={roomId}
                    ownerUserId={document.ownerId}
                    knownUserEmails={knownUserEmails}
                    moderatedCommentKeys={moderatedCommentKeys}
                    commentsTab={commentsTab}
                    commentsTypeFilter={commentsTypeFilter}
                    commentsTabsFilter={commentsTabsFilter}
                    autoFocusComposerNonce={commentsComposerFocusNonce}
                    selectedTextPrefill={commentsSelectionPrefill}
                    draftResetKey={commentsDraftResetKey}
                    clearAllNonce={commentsClearAllNonce}
                    clearAllScopeTab={clearAllScopeTab}
                    hiddenThreadsStorageKey={hiddenThreadsStorageKey}
                    onThreadAnchorHover={previewCommentAnchor}
                    onThreadAnchorClick={jumpToCommentAnchor}
                    onNotificationsChange={handleNotificationsChange}
                  />
                </div>
                <p className="mt-3 shrink-0 text-center text-xs text-gray-500">
                  Threads sync via Liveblocks for everyone in this room.
                </p>
                </div>
              </div>
              </aside>
            </div>
        </div>
      )}

      {selectionAnchor && !aiPromptOpen ? (
        <div
          className="fixed z-[130] -translate-x-1/2 -translate-y-full rounded-full border border-gray-200 bg-white p-1 shadow-lg no-print"
          style={{ left: selectionAnchor.left, top: selectionAnchor.top }}
        >
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              title="Add comment"
              aria-label="Add comment"
              onMouseDown={(e) => e.preventDefault()}
              onClick={openCommentsFromSelection}
            >
              <MessageSquarePlus className="size-4" strokeWidth={2} />
            </Button>
            {siteAiEnabled ? (
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                title={rewriteToolbarTitle}
                aria-label={rewriteToolbarTitle}
                onMouseDown={(e) => e.preventDefault()}
                onClick={openAiRewritePrompt}
              >
                <Sparkles className="size-4" strokeWidth={2} />
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {aiPromptOpen && aiSelection && siteAiEnabled ? (
        <div
          ref={aiPromptRef}
          className="fixed bottom-6 left-1/2 z-[131] w-[min(500px,calc(100vw-2rem))] -translate-x-1/2 overflow-visible rounded-2xl no-print"
        >
          <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
            <div className="absolute -inset-[160%] animate-[spin_5.8s_linear_infinite] bg-[conic-gradient(from_0deg,transparent_0deg,rgba(56,189,248,0.0)_36deg,rgba(56,189,248,0.65)_85deg,rgba(99,102,241,0.65)_155deg,rgba(236,72,153,0.45)_215deg,rgba(56,189,248,0.0)_300deg,transparent_360deg)]" />
          </div>
          <div className="relative m-px rounded-[15px] border border-[#d9dee6] bg-[#f8f9fa]/95 shadow-[0_6px_20px_rgba(15,23,42,0.12)] backdrop-blur-[1.5px]">
          <>
              <div className="flex items-center gap-1 border-b border-[#d9dee6] px-3 py-2">
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[15px] leading-none text-gray-700 hover:bg-gray-200/70"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setAiInstruction("Rephrase this text clearly.");
                    setAiMoreMenuOpen(false);
                  }}
                >
                  <Pencil className="size-3.5" strokeWidth={2} />
                  Rephrase
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[15px] leading-none text-gray-700 hover:bg-gray-200/70"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setAiInstruction("Shorten this text while keeping meaning.");
                    setAiMoreMenuOpen(false);
                  }}
                >
                  <AlignLeft className="size-3.5" strokeWidth={2} />
                  Shorten
                </button>
                <div className="relative">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[15px] leading-none text-gray-700 hover:bg-gray-200/70"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setAiMoreMenuOpen((v) => !v)}
                  >
                    More
                    <ChevronDown className="size-3.5" strokeWidth={2} />
                  </button>
                  {aiMoreMenuOpen ? (
                    <div className="absolute bottom-[calc(100%+8px)] left-0 w-52 overflow-hidden rounded-xl border border-[#d9dee6] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.2)]">
                      {[
                        {
                          label: "Elaborate",
                          icon: AlignLeft,
                          instruction: "Elaborate this text with more detail and clarity.",
                        },
                        {
                          label: "More formal",
                          icon: BriefcaseBusiness,
                          instruction: "Rewrite this text in a more formal professional tone.",
                        },
                        {
                          label: "Bulletize",
                          icon: List,
                          instruction: "Convert this text into concise bullet points.",
                        },
                        {
                          label: "Summarize",
                          icon: FileText,
                          instruction: "Summarize this text while preserving key points.",
                        },
                      ].map((item) => (
                        <button
                          key={item.label}
                          type="button"
                          className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-[15px] text-[#3c4043] hover:bg-gray-100"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setAiInstruction(item.instruction);
                            setAiMoreMenuOpen(false);
                          }}
                        >
                          <item.icon className="size-4 text-[#0f2940]" strokeWidth={2} />
                          {item.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="ml-auto flex items-center gap-1">
                  <button
                    type="button"
                    className={cn(
                      "rounded-full px-2 py-1 text-[13px] leading-none",
                      aiTextMode === "ai"
                        ? "border border-gray-300/70 bg-gray-300/40 text-[#1f2937]"
                        : "text-gray-700 hover:bg-gray-200/70",
                    )}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setAiMode("rewrite");
                      setAiTextMode("ai");
                      setAiError("");
                    }}
                  >
                    AI
                  </button>
                  <button
                    type="button"
                    className={cn(
                      "rounded-full px-2 py-1 text-[13px] leading-none",
                      aiTextMode === "smart"
                        ? "border border-gray-300/70 bg-gray-300/40 text-[#1f2937]"
                        : "text-gray-700 hover:bg-gray-200/70",
                    )}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setAiMode("rewrite");
                      setAiTextMode("smart");
                      setAiError("");
                      setAiToolsMenuOpen(false);
                    }}
                  >
                    SMART COMMAND (W/O AI)
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2 px-3 py-2">
                {aiTextMode === "ai" || showImageAiUI ? (
                  <button
                    type="button"
                    className={cn(
                      "rounded-full p-1 hover:bg-gray-200/60",
                      showImageAiUI ? "bg-[#eef3fd] text-[#0b57d0]" : "",
                    )}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setAiMoreMenuOpen(false);
                      setAiToolsMenuOpen((v) => !v);
                    }}
                    aria-label="Tools"
                  >
                    {showImageAiUI ? (
                      <Sparkles className="size-4 text-[#0b57d0]" strokeWidth={2} />
                    ) : (
                      <SlidersHorizontal className="size-4 text-[#3c4043]" strokeWidth={2} />
                    )}
                  </button>
                ) : null}
                {showImageAiUI ? (
                  <button
                    type="button"
                    className="rounded-full p-1 text-[#6f7377] hover:bg-gray-200/60 hover:text-[#3c4043]"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setAiMode("rewrite");
                      setAiError("");
                    }}
                    aria-label="Exit image mode"
                    title="Exit image mode"
                  >
                    <X className="size-3.5" strokeWidth={2.1} />
                  </button>
                ) : null}
                <textarea
                  value={aiInstruction}
                  onChange={(e) => setAiInstruction(e.target.value)}
                  spellCheck={false}
                  autoCorrect="off"
                  autoCapitalize="off"
                  autoComplete="off"
                  data-gramm="false"
                  data-gramm_editor="false"
                  data-enable-grammarly="false"
                  placeholder={
                    showImageAiUI
                      ? aiProvider === "groq" && groqClipdropImages
                        ? "Describe image, or leave empty to use selected text and press done"
                        : "Describe your image"
                      : aiTextMode === "smart"
                        ? "Smart Command"
                        : aiProvider === "groq"
                          ? "Ask Groq to edit selected text"
                          : "Ask Gemini to edit selected text"
                  }
                  className="h-8 flex-1 resize-none bg-transparent px-1 py-1.5 text-[16px] text-[#3c4043] outline-none placeholder:text-[#6f7377]"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void handleAiSubmit();
                    }
                  }}
                />
                <Button
                  type="button"
                  size="icon"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => void handleAiSubmit()}
                  disabled={aiBusy || aiImageBusy}
                  title={
                    showImageAiUI
                      ? aiProvider === "groq" && groqClipdropImages
                        ? "Generate image with Clipdrop"
                        : "Generate image"
                      : aiProvider === "groq"
                        ? "Send to Groq"
                        : "Send to Gemini"
                  }
                  className="h-7 w-7 rounded-full bg-[#e8eaed] text-[#5f6368] hover:bg-[#dde1e5]"
                >
                  {aiBusy || aiImageBusy ? "..." : <ArrowUp className="size-4" strokeWidth={2.4} />}
                </Button>
              </div>
              {showImageAiUI && aiImageBusy ? (
                <p className="px-3 pb-2 text-xs text-[#0b57d0]">Generating image...</p>
              ) : null}
              {showImageAiUI && !aiImageBusy && aiError ? (
                <p className="px-3 pb-2 text-xs text-red-600">Failed. Please try again.</p>
              ) : null}
              {aiMode === "rewrite" && aiTextMode === "smart" ? (
                <p className="px-3 pb-2 text-xs text-[#6f7377]">
                  Use actions keyword to get more accurate.
                </p>
              ) : null}
              {aiToolsMenuOpen ? (
                <div className="absolute bottom-[calc(100%+8px)] left-16 z-[140] w-[260px] overflow-hidden rounded-2xl border border-[#d9dee6] bg-white shadow-[0_10px_30px_rgba(15,23,42,0.18)]">
                  <div className="px-4 pt-3 text-sm font-semibold text-[#3c4043]">Tools</div>
                  {allowAiImage ? (
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 px-4 py-3 text-left text-[18px] leading-none text-[#202124] hover:bg-gray-100"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        activateImageMode();
                      }}
                      disabled={aiImageBusy}
                    >
                      <Sparkles className="size-5 text-[#efb726]" strokeWidth={2.2} />
                      {aiProvider === "groq" && groqClipdropImages
                        ? "Create with Clipdrop"
                        : "Create images"}
                      <ImagePlus className="ml-auto size-5 text-[#4d5156]" strokeWidth={2} />
                    </button>
                  ) : (
                    <p className="px-4 pb-3 pt-1 text-xs text-[#6f7377]">
                      Image generation is unavailable while this project uses Groq for text.
                    </p>
                  )}
                </div>
              ) : null}
              {aiError && !showImageAiUI ? (
                <p className="px-3 pb-2 text-xs text-red-600">{aiError}</p>
              ) : null}
          </>
          </div>
        </div>
      ) : null}

      {aiCandidate && siteAiEnabled ? (
        <div className="fixed bottom-6 left-1/2 z-[132] w-[min(500px,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-2xl border border-[#d9dee6] bg-white/95 p-3 shadow-[0_8px_20px_rgba(15,23,42,0.14)] no-print">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-xs text-[#3c4043]">
              Review change and choose.
            </p>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-7 rounded-full px-3 text-xs"
                onMouseDown={(e) => e.preventDefault()}
                onClick={rejectAiRewrite}
              >
                Reject
              </Button>
              <Button
                type="button"
                className="h-7 rounded-full px-3 text-xs"
                onMouseDown={(e) => e.preventDefault()}
                onClick={acceptAiRewrite}
              >
                Accept
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <Dialog open={wordCountDialogOpen} onOpenChange={setWordCountDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Word count</DialogTitle>
            <DialogDescription>
              Statistics from the TipTap character count extension.
            </DialogDescription>
          </DialogHeader>
          {editor ? (
            <div className="space-y-2 text-sm text-[#1F1F1F]">
              <p>
                Words:{" "}
                {(
                  editor.storage.characterCount as {
                    words?: () => number;
                  }
                ).words?.() ?? 0}
              </p>
              <p>
                Characters (with spaces):{" "}
                {(
                  editor.storage.characterCount as {
                    characters?: () => number;
                  }
                ).characters?.() ?? 0}
              </p>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={tablePropertiesDialogOpen}
        onOpenChange={setTablePropertiesDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Table cell color</DialogTitle>
            <DialogDescription>
              Select a table cell, pick a color, then apply.
            </DialogDescription>
          </DialogHeader>
          <label className="flex flex-col gap-2 text-sm">
            Cell background
            <input
              type="color"
              className="h-10 w-full cursor-pointer rounded border border-gray-200"
              value={tableCellColor}
              onChange={(e) => setTableCellColor(e.target.value)}
            />
          </label>
          <Button
            type="button"
            className="w-full rounded-full bg-[#0B57D0] text-white hover:bg-[#0842a0]"
            onClick={() => {
              if (!editor) return;
              editor
                .chain()
                .focus()
                .setCellAttribute("backgroundColor", tableCellColor)
                .run();
              setTablePropertiesDialogOpen(false);
            }}
          >
            Apply to selected cell
          </Button>
        </DialogContent>
      </Dialog>
      </EditorProvider>
    </MenubarActionsProvider>
  );
}

export default function DocumentEditorPage() {
  const params = useParams();
  const id = useMemo(() => params?.id as string, [params]);
  const requestAccess = useMutation(api.documents.requestAccess);
  const syncMyAccessIdentity = useMutation(api.documents.syncMyAccessIdentity);
  const recordPublicDocumentJoin = useMutation(api.documents.recordPublicDocumentJoin);
  const { user } = useUser();
  /** Prevents re-recording join when Convex refetches after owner clears join notifications. */
  const recordedPublicJoinDocIdRef = useRef<string | null>(null);

  const document = useQuery(
    api.documents.getDocumentById,
    id ? ({ id: id as Id<"documents"> }) : "skip",
  );
  const access = useQuery(
    api.documents.getMyDocumentAccess,
    id ? ({ id: id as Id<"documents"> }) : "skip",
  );

  useEffect(() => {
    if (!id || !access?.hasAccess) return;
    const email = user?.primaryEmailAddress?.emailAddress ?? undefined;
    const displayName = user?.fullName ?? undefined;
    void syncMyAccessIdentity({
      id: id as Id<"documents">,
      email,
      displayName,
    });
  }, [
    access?.hasAccess,
    id,
    syncMyAccessIdentity,
    user?.fullName,
    user?.primaryEmailAddress?.emailAddress,
  ]);

  useEffect(() => {
    recordedPublicJoinDocIdRef.current = null;
  }, [id]);

  useEffect(() => {
    if (access?.hasAccess === false) {
      recordedPublicJoinDocIdRef.current = null;
    }
  }, [access?.hasAccess]);

  useEffect(() => {
    if (!id || document === undefined || document === null) return;
    if (document.visibility !== "public") return;
    if (!access?.hasAccess || access.role === "owner") return;
    if (recordedPublicJoinDocIdRef.current === id) return;
    recordedPublicJoinDocIdRef.current = id;
    void recordPublicDocumentJoin({
      id: id as Id<"documents">,
      clientEmail: user?.primaryEmailAddress?.emailAddress ?? undefined,
      clientName: user?.fullName ?? undefined,
    });
  }, [
    access?.hasAccess,
    access?.role,
    document?._id,
    document?.visibility,
    id,
    recordPublicDocumentJoin,
    user?.fullName,
    user?.primaryEmailAddress?.emailAddress,
  ]);

  if (document === undefined || access === undefined) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#F6EFD9]">
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <p className="text-sm text-gray-500">Loading document...</p>
        </div>
      </div>
    );
  }
  if (access?.exists && !access.hasAccess) {
    const pending = access.requestStatus === "pending";
    const denied = access.requestStatus === "denied";
    return (
      <div className="flex h-screen items-center justify-center bg-[#F6EFD9] p-4 text-[#1F1F1F]">
        <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-semibold">Need permission</h1>
          <p className="mt-2 text-sm text-gray-600">
            You do not have access to this document yet. Send a request to the owner.
          </p>
          <Button
            type="button"
            className="mt-5 w-full rounded-full bg-[#1a73e8] text-white hover:bg-[#155bc4]"
            disabled={pending}
            onClick={() =>
              void requestAccess({
                id: id as Id<"documents">,
                requesterEmail: user?.primaryEmailAddress?.emailAddress ?? undefined,
                requesterName: user?.fullName ?? undefined,
              })
            }
          >
            {pending ? "Request sent" : denied ? "Request again" : "Request access"}
          </Button>
        </div>
      </div>
    );
  }
  if (!document) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#F6EFD9] text-[#1F1F1F]">
        Document not found.
      </div>
    );
  }

  const role = access?.role ?? "viewer";
  return <DocumentRoomShell document={document} accessRole={role} />;
}
