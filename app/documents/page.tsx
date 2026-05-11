"use client";

import Image from "next/image";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import {
  ChevronDown,
  LayoutGrid,
  List,
  MoreVertical,
  Search,
  Settings,
  Star,
} from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import mammoth from "mammoth";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserButton, useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import {
  documentTemplates,
  type DocumentTemplateKey,
} from "@/lib/templates";
import { BROCHURE_GEOMETRIC_GALLERY_SRC } from "@/lib/brochure-geometric-template-html";
import { LETTER_SPEARMINT_GALLERY_SRC } from "@/lib/letter-spearmint-template-html";
import { replaceDataImageUrlsInHtml } from "@/lib/upload-html-data-images";
import { useUiStore } from "@/lib/store/use-ui-store";
import { DocumentCardContentPreview } from "@/components/documents/document-card-content-preview";

function ThumbnailBlank() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-white">
      <div className="relative h-[52px] w-[52px] shrink-0">
        <span className="absolute left-1/2 top-0 h-[22px] w-[14px] -translate-x-1/2 rounded-[3px] bg-[#FBBC04]" />
        <span className="absolute bottom-0 left-1/2 h-[22px] w-[14px] -translate-x-1/2 rounded-[3px] bg-[#4285F4]" />
        <span className="absolute left-0 top-1/2 h-[14px] w-[22px] -translate-y-1/2 rounded-[3px] bg-[#EA4335]" />
        <span className="absolute right-0 top-1/2 h-[14px] w-[22px] -translate-y-1/2 rounded-[3px] bg-[#34A853]" />
      </div>
    </div>
  );
}

/** Full-bleed PNG preview for gallery cards (`public/*.png`). */
function GalleryThumbnailPng({
  src,
  alt,
  unoptimized,
}: {
  src: string;
  alt: string;
  /** Use when replacing the file often so Next image cache does not stick to an old bitmap. */
  unoptimized?: boolean;
}) {
  return (
    <div className="relative h-full w-full bg-gray-100">
      <Image
        src={src}
        alt={alt}
        fill
        className="object-cover object-top"
        sizes="150px"
        draggable={false}
        unoptimized={unoptimized}
      />
    </div>
  );
}

type GalleryTemplate = {
  id: string;
  /** Maps to `documentTemplates` HTML layouts */
  engineKey: DocumentTemplateKey;
  title: string;
  subtitle?: string;
  thumbnail: ReactNode;
};

function galleryDocumentTitle(t: GalleryTemplate): string {
  if (!t.subtitle) return t.title;
  return `${t.title} (${t.subtitle})`;
}

const galleryTemplates: GalleryTemplate[] = [
  {
    id: "blank",
    engineKey: "blank",
    title: "Blank document",
    thumbnail: <ThumbnailBlank />,
  },
  {
    id: "resume-coral",
    engineKey: "resumeCoral",
    title: "Resume",
    subtitle: "Coral",
    thumbnail: (
      <GalleryThumbnailPng src="/coral.png" alt="Resume Coral template preview" />
    ),
  },
  {
    id: "letter-spearmint",
    engineKey: "letterSpearmint",
    title: "Letter",
    subtitle: "Spearmint",
    thumbnail: (
      <GalleryThumbnailPng
        src={LETTER_SPEARMINT_GALLERY_SRC}
        alt="Letter Spearmint template preview"
        unoptimized
      />
    ),
  },
  {
    id: "brochure-geometric",
    engineKey: "brochureGeometric",
    title: "Brochure",
    subtitle: "Geometric",
    thumbnail: (
      <GalleryThumbnailPng
        src={BROCHURE_GEOMETRIC_GALLERY_SRC}
        alt="Brochure Geometric template preview"
        unoptimized
      />
    ),
  },
];

/** Stay clearly under Convex’s 1 MiB field limit (encoding / overhead margin). */
const CONVEX_CONTENT_SOFT_LIMIT_BYTES = 820 * 1024;

function byteLengthUtf8(value: string): number {
  return new TextEncoder().encode(value).length;
}

/** Last resort only — never strips images (those should already be hosted URLs). */
function truncateHtmlToConvexLimit(content: string): {
  content: string;
  truncated: boolean;
} {
  if (byteLengthUtf8(content) <= CONVEX_CONTENT_SOFT_LIMIT_BYTES) {
    return { content, truncated: false };
  }

  if (typeof window === "undefined") {
    // SSR fallback: keep previous logic shape, but close with suffix.
    let low = 0;
    let high = content.length;
    const suffix = "<p><em>[Import truncated due to size limit]</em></p>";
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      const candidate = `${content.slice(0, mid)}${suffix}`;
      if (byteLengthUtf8(candidate) <= CONVEX_CONTENT_SOFT_LIMIT_BYTES) {
        low = mid;
      } else {
        high = mid - 1;
      }
    }
    return { content: `${content.slice(0, low)}${suffix}`, truncated: true };
  }

  // Client path: trim whole top-level nodes so HTML remains valid for TipTap parsing.
  const wrapped = `<div id="__import_truncate_root">${content}</div>`;
  const doc = new DOMParser().parseFromString(wrapped, "text/html");
  const root = doc.getElementById("__import_truncate_root");
  if (!root) {
    return { content: "<p><em>[Import truncated due to size limit]</em></p>", truncated: true };
  }

  const note = doc.createElement("p");
  const em = doc.createElement("em");
  em.textContent = "[Import truncated due to size limit]";
  note.appendChild(em);

  const withinLimit = () =>
    byteLengthUtf8(`${root.innerHTML}${note.outerHTML}`) <= CONVEX_CONTENT_SOFT_LIMIT_BYTES;

  while (root.childNodes.length > 0 && !withinLimit()) {
    root.removeChild(root.lastChild!);
  }

  const safe = `${root.innerHTML}${note.outerHTML}`;
  if (byteLengthUtf8(safe) <= CONVEX_CONTENT_SOFT_LIMIT_BYTES) {
    return { content: safe, truncated: true };
  }

  // Worst case, return note only.
  return { content: note.outerHTML, truncated: true };
}

function isStylePageBreak(style: string | null): boolean {
  if (!style) return false;
  const s = style.toLowerCase();
  return (
    s.includes("page-break-before") ||
    s.includes("page-break-after") ||
    s.includes("break-before: page") ||
    s.includes("break-after: page")
  );
}

function makePageBreakElement(doc: Document): HTMLElement {
  const el = doc.createElement("div");
  el.setAttribute("data-type", "page-break");
  el.className = "tiptap-page-break";
  return el;
}

/**
 * Normalizes Mammoth HTML for TipTap:
 * - Converts Word page-break artifacts to explicit `pageBreak` nodes.
 * - Keeps side-by-side signature lines by turning tab-separated runs into 2-cell tables.
 */
function normalizeImportedDocxHtml(html: string): string {
  if (!html.trim()) return html;

  const wrapped = `<div id="__docx_import_root">${html}</div>`;
  const doc = new DOMParser().parseFromString(wrapped, "text/html");
  const root = doc.getElementById("__docx_import_root");
  if (!root) return html;

  const pageBreakSelectors = [
    "hr",
    "br",
    "p",
    "div",
    "span",
    'w\\:br[type="page"]',
    '[style*="page-break"]',
    '[style*="break-before"]',
    '[style*="break-after"]',
    '[data-type="page-break"]',
    ".page-break",
  ];

  const maybeBreakNodes = Array.from(
    root.querySelectorAll(pageBreakSelectors.join(",")),
  ) as HTMLElement[];

  for (const el of maybeBreakNodes) {
    const tag = el.tagName.toLowerCase();
    const style = el.getAttribute("style");
    const hasExplicitBreakMarker =
      el.getAttribute("data-type") === "page-break" ||
      el.classList.contains("page-break") ||
      el.classList.contains("tiptap-page-break");
    const hasBreakStyle = isStylePageBreak(style);
    const isHrOrBr = tag === "hr" || tag === "br";

    if (!hasExplicitBreakMarker && !hasBreakStyle && !isHrOrBr) continue;

    const pageBreak = makePageBreakElement(doc);

    if (
      hasBreakStyle &&
      (style?.toLowerCase().includes("before") ||
        style?.toLowerCase().includes("break-before"))
    ) {
      el.parentNode?.insertBefore(pageBreak, el);
      continue;
    }

    el.parentNode?.insertBefore(pageBreak, el.nextSibling);
    if (isHrOrBr || hasExplicitBreakMarker) {
      el.remove();
    } else if (tag === "p" || tag === "div" || tag === "span") {
      const text = el.textContent?.trim() ?? "";
      if (!text) el.remove();
      else el.removeAttribute("style");
    }
  }

  // Signature-block fallback: tab-separated text should remain side-by-side.
  const paragraphs = Array.from(root.querySelectorAll("p"));
  for (const p of paragraphs) {
    const raw = p.textContent ?? "";
    if (!raw.includes("\t")) continue;
    const parts = raw
      .split(/\t+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length < 2) continue;
    const compact = raw.replace(/\s+/g, " ").trim();
    if (compact.length > 180) continue;

    const table = doc.createElement("table");
    table.setAttribute("data-import-layout", "signature-row");
    const tbody = doc.createElement("tbody");
    const tr = doc.createElement("tr");
    const left = doc.createElement("td");
    const right = doc.createElement("td");
    left.textContent = parts[0] ?? "";
    right.textContent = parts[parts.length - 1] ?? "";
    tr.append(left, right);
    tbody.appendChild(tr);
    table.appendChild(tbody);
    p.parentNode?.replaceChild(table, p);
  }

  return root.innerHTML;
}

export default function DocumentsPage() {
  const router = useRouter();
  const { user } = useUser();
  const setFeedbackDialogOpen = useUiStore((s) => s.setFeedbackDialogOpen);
  const ownerUserId = (process.env.NEXT_PUBLIC_OWNER_CLERK_USER_ID ?? "").trim();
  const isOwnerById = !!(ownerUserId && user?.id && ownerUserId === user.id);
  const ownerEmail = (process.env.NEXT_PUBLIC_OWNER_EMAIL ?? "").trim().toLowerCase();
  const userEmail = user?.primaryEmailAddress?.emailAddress?.trim().toLowerCase();
  const isOwnerByEmail = !!(ownerEmail && userEmail && ownerEmail === userEmail);
  const isOwner = isOwnerById || isOwnerByEmail;

  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [visibilityFilter, setVisibilityFilter] = useState<
    "all" | "public" | "private"
  >("all");
  const [sortFilter, setSortFilter] = useState("last-opened");
  const [templateCreatingId, setTemplateCreatingId] = useState<string | null>(
    null,
  );
  const [importingDocx, setImportingDocx] = useState(false);
  const deleteOkRef = useRef<HTMLButtonElement>(null);
  const docxInputRef = useRef<HTMLInputElement>(null);

  const recentDocsViewStorageKey = useMemo(
    () => `liveDocs.recentDocsView.${user?.id ?? "guest"}`,
    [user?.id],
  );
  const [recentDocsView, setRecentDocsView] = useState<"grid" | "list">(
    "grid",
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const v = window.localStorage.getItem(recentDocsViewStorageKey);
      if (v === "list" || v === "grid") setRecentDocsView(v);
    } catch {
      /* ignore */
    }
  }, [recentDocsViewStorageKey]);

  const persistRecentDocsView = useCallback(
    (next: "grid" | "list") => {
      setRecentDocsView(next);
      if (typeof window === "undefined") return;
      try {
        window.localStorage.setItem(recentDocsViewStorageKey, next);
      } catch {
        /* ignore */
      }
    },
    [recentDocsViewStorageKey],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash !== "#template-gallery") return;
    requestAnimationFrame(() => {
      document.getElementById("template-gallery")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }, []);

  const documents = useQuery(api.documents.getDocuments);
  const aiRuntime = useQuery(api.platformSettings.getAiRuntime);
  const siteImportFromComputerEnabled =
    aiRuntime?.importFromComputerEnabled !== false;
  const createDocument = useMutation(api.documents.createDocument);
  const updateDocument = useMutation(api.documents.updateDocument);
  const deleteDocument = useMutation(api.documents.deleteDocument);
  const setDocumentVisibility = useMutation(api.documents.setDocumentVisibility);
  const toggleFavorite = useMutation(api.documents.toggleFavorite);
  const generateImageUploadUrl = useMutation(api.files.generateImageUploadUrl);
  const finalizeImageUpload = useMutation(api.files.finalizeImageUpload);

  /** Works with deployments that only validate `{ title?, templateType? }` on create. */
  const createDocumentWithContent = async (title: string, content: string) => {
    const documentId = await createDocument({ title });
    try {
      await updateDocument({
        id: documentId as Id<"documents">,
        content,
      });
      return documentId;
    } catch (error) {
      // Prevent orphan empty docs if content patch fails for any reason.
      try {
        await deleteDocument({ id: documentId as Id<"documents"> });
      } catch (cleanupError) {
        console.error("Failed to cleanup partially created document:", cleanupError);
      }
      throw error;
    }
  };

  const filteredDocuments = useMemo(() => {
    const q = search.toLowerCase().trim();
    return (documents ?? []).filter((doc) => {
      if (!doc.title.toLowerCase().includes(q)) return false;
      if (visibilityFilter === "public") return doc.visibility === "public";
      if (visibilityFilter === "private") return doc.visibility !== "public";
      return true;
    });
  }, [documents, search, visibilityFilter]);

  const sortedDocuments = useMemo(() => {
    const list = [...filteredDocuments];
    if (sortFilter === "title") {
      list.sort((a, b) => a.title.localeCompare(b.title));
      return list;
    }
    list.sort((a, b) => b.updatedAt - a.updatedAt);
    return list;
  }, [filteredDocuments, sortFilter]);

  const uiLocked = importingDocx;

  const handleTemplateClick = async (
    templateKey: DocumentTemplateKey,
    cardId: string,
    title: string,
  ) => {
    if (templateCreatingId !== null || importingDocx) return;
    setTemplateCreatingId(cardId);
    try {
      const content = documentTemplates[templateKey];
      const documentId = await createDocumentWithContent(title, content);
      router.push(`/documents/${documentId}`);
    } catch (err) {
      console.error(err);
      window.alert(
        "Could not create the document. Sign in, run Convex (`npm run convex:dev`), and try again.",
      );
    } finally {
      setTemplateCreatingId(null);
    }
  };

  const handleImportDocx = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (
      !siteImportFromComputerEnabled ||
      !file ||
      importingDocx ||
      templateCreatingId !== null
    ) {
      return;
    }

    setImportingDocx(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const mammothAdvancedOptions = {
        styleMap: [
          "p[style-name='Page Break'] => div.page-break:fresh",
          "br[type='page'] => div.page-break:fresh",
          "p[style-name='center'] => p.center:fresh",
          "p[style-name='Center'] => p.center:fresh",
        ],
        transformDocument: (mammoth as unknown as {
          transforms: {
            paragraph: <T>(
              fn: (paragraph: T) => T,
            ) => (document: unknown) => unknown;
          };
        }).transforms.paragraph(
          (paragraph: {
            alignment?: string;
            styleId?: string;
            styleName?: string;
          }) => {
            if (paragraph.alignment === "center") {
              return { ...paragraph, styleId: "center", styleName: "center" };
            }
            return paragraph;
          },
        ),
      };

      let htmlContent: string;
      try {
        const result = await mammoth.convertToHtml(
          { arrayBuffer },
          mammothAdvancedOptions,
        );
        htmlContent = result.value;
      } catch (mammothErr) {
        console.warn(
          "Docx import: advanced Mammoth options failed, retrying basic:",
          mammothErr,
        );
        const fallback = await mammoth.convertToHtml({ arrayBuffer });
        htmlContent = fallback.value;
      }
      // Fallback path for generic line-break based exports.
      htmlContent = htmlContent.replace(
        /<div class="page-break"><\/div>/gi,
        '<div data-type="page-break" class="tiptap-page-break"></div>',
      );
      const normalized = normalizeImportedDocxHtml(htmlContent);
      const withHostedImages = await replaceDataImageUrlsInHtml(
        normalized,
        {
          generateUploadUrl: () => generateImageUploadUrl({}),
          finalizeUpload: ({ storageId }) =>
            finalizeImageUpload({ storageId }),
        },
      );
      const sized = truncateHtmlToConvexLimit(withHostedImages);
      const baseName = file.name.replace(/\.docx$/i, "").trim() || "Imported document";

      // Use create-then-patch path directly so older Convex deployments
      // (without `initialContent` in validator) don't throw noisy server errors.
      const documentId = (await createDocumentWithContent(
        baseName,
        sized.content,
      )) as Id<"documents">;
      await new Promise<void>((resolve) => setTimeout(resolve, 200));
      router.push(`/documents/${documentId}`);
      if (sized.truncated) {
        window.alert(
          "Some content was truncated so the document fits storage limits. Images were uploaded where possible.",
        );
      }
    } catch (error) {
      console.error("Error parsing docx:", error);
      const detail =
        error instanceof Error ? error.message : String(error ?? "Unknown error");
      window.alert(
        `Could not import this file.\n\n${detail}\n\nTips: compress photos in Word first, export without huge embedded objects, or split into smaller documents.`,
      );
    } finally {
      setImportingDocx(false);
    }
  };

  const openDocxPicker = () => {
    if (!siteImportFromComputerEnabled) return;
    const input = docxInputRef.current;
    if (!input) return;
    // Reset value so selecting the same file again still triggers onChange.
    input.value = "";
    input.click();
  };

  const startRename = (docId: string, currentTitle: string) => {
    setEditingId(docId);
    setEditTitle(currentTitle);
  };

  const handleRenameSave = async () => {
    const trimmed = editTitle.trim();
    if (!editingId || !trimmed) return;

    await updateDocument({
      id: editingId as Id<"documents">,
      title: trimmed,
    });

    setEditingId(null);
    setEditTitle("");
  };

  const requestDelete = (docId: string) => setDeleteConfirmId(docId);

  const closeDeleteModal = () => setDeleteConfirmId(null);

  const confirmDeleteInFlight = useRef(false);

  const confirmDelete = useCallback(async () => {
    if (!deleteConfirmId || confirmDeleteInFlight.current) return;
    confirmDeleteInFlight.current = true;
    const id = deleteConfirmId;
    setDeleteConfirmId(null);
    try {
      await deleteDocument({ id: id as Id<"documents"> });
    } finally {
      confirmDeleteInFlight.current = false;
    }
  }, [deleteConfirmId, deleteDocument]);

  useEffect(() => {
    if (!deleteConfirmId) return;

    const t = window.setTimeout(() => deleteOkRef.current?.focus(), 0);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        void confirmDelete();
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        closeDeleteModal();
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [deleteConfirmId, confirmDelete]);

  return (
    <div
      className="relative min-h-screen bg-[#F6EFD9]"
      aria-busy={uiLocked}
      aria-disabled={uiLocked}
    >
      {uiLocked ? (
        <div className="pointer-events-auto fixed inset-0 z-40 bg-black/5" />
      ) : null}
      <header className="sticky top-0 z-20 border-b border-gray-200/90 bg-[#F6EFD9] px-4 py-3 md:px-6">
        <div className="mx-auto flex max-w-[1000px] items-center gap-3 lg:px-0">
          <div className="flex shrink-0 items-center gap-2">
            <Image
              src="/logo.jpg"
              alt="LiveDocs"
              width={1448}
              height={729}
              className="h-8 w-auto max-w-[200px] object-contain object-left"
              priority
            />
          </div>

          <div className="relative mx-auto max-w-xl flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              className="h-10 w-full rounded-full border border-gray-200 bg-[#f1f3f4] pl-9 pr-3 text-sm outline-none ring-blue-500/30 placeholder:text-gray-500 focus:ring-2"
              placeholder="Search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search documents"
            />
          </div>

          <div className="flex shrink-0 items-center justify-end gap-2">
            {isOwner ? (
              <>
                <Button variant="outline" size="icon-sm" className="sm:hidden" asChild>
                  <Link href="/owner-dashboard" aria-label="Owner dashboard">
                    <Settings strokeWidth={2} />
                  </Link>
                </Button>
                <Button variant="outline" size="sm" className="hidden sm:inline-flex" asChild>
                  <Link href="/owner-dashboard">
                    <Settings className="mr-1.5 size-4" strokeWidth={2} />
                    Owner dashboard
                  </Link>
                </Button>
              </>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="shrink-0 text-gray-700 hover:bg-gray-200/80"
              onClick={() => setFeedbackDialogOpen(true)}
            >
              Feedback
            </Button>
            <UserButton />
          </div>
        </div>
      </header>

      <section
        id="template-gallery"
        className={`w-full scroll-mt-20 border-b border-[#B6CCFF] bg-[#D3E3FD] py-6 ${
          uiLocked ? "pointer-events-none select-none opacity-75" : ""
        }`}
      >
        <div className="mx-auto max-w-[1000px] px-4 lg:px-0">
          <div className="flex items-center justify-between gap-3">
            <h2 className="min-w-0 truncate text-base font-medium text-gray-700">
              Start a new document
            </h2>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-gray-600">
                Template gallery
              </span>
              {siteImportFromComputerEnabled ? (
                <>
                  <input
                    ref={docxInputRef}
                    type="file"
                    accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    className="hidden"
                    aria-hidden
                    onChange={(ev) => void handleImportDocx(ev)}
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="inline-flex items-center gap-2 rounded-full border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:cursor-wait disabled:opacity-60"
                      onClick={openDocxPicker}
                      disabled={importingDocx || templateCreatingId !== null}
                    >
                      Import from computer (.docx)
                    </button>
                    {importingDocx ? (
                      <span className="inline-flex items-center gap-1 text-xs text-gray-600">
                        <span className="h-3 w-3 animate-spin rounded-full border border-gray-400 border-t-transparent" />
                        Importing .docx…
                      </span>
                    ) : null}
                  </div>
                </>
              ) : null}
            </div>
          </div>

          <div className="scrollbar-hide mt-4 flex items-start gap-10 overflow-x-auto pb-4">
            {galleryTemplates.map((t) => (
              <button
                key={t.id}
                type="button"
                disabled={
                  templateCreatingId !== null || importingDocx
                }
                aria-busy={templateCreatingId === t.id}
                onClick={() =>
                  void handleTemplateClick(
                    t.engineKey,
                    t.id,
                    galleryDocumentTitle(t),
                  )
                }
                className="shrink-0 text-left disabled:cursor-wait disabled:opacity-60"
              >
                <div className="relative h-[195px] w-[150px] cursor-pointer overflow-hidden rounded-sm border border-gray-200 bg-white shadow-sm transition-colors hover:border-blue-500">
                  {t.thumbnail}
                </div>
                <p className="mt-2 text-sm font-medium text-gray-800">{t.title}</p>
                {t.subtitle ? (
                  <p className="text-xs text-gray-500">{t.subtitle}</p>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto mt-8 max-w-[1000px] px-4 pb-16 lg:px-0">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-base font-medium text-gray-800">
            Recent documents
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <select
                className="appearance-none rounded-lg border border-gray-300 bg-white py-1.5 pl-3 pr-9 text-sm text-gray-700 hover:bg-gray-50"
                aria-label="Filter by visibility"
                value={visibilityFilter}
                onChange={(e) =>
                  setVisibilityFilter(e.target.value as "all" | "public" | "private")
                }
              >
                <option value="all">All</option>
                <option value="public">Public</option>
                <option value="private">Private</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
            </div>
            <div className="relative">
              <select
                className="appearance-none rounded-lg border border-gray-300 bg-white py-1.5 pl-3 pr-9 text-sm text-gray-700 hover:bg-gray-50"
                aria-label="Sort"
                value={sortFilter === "modified" ? "last-opened" : sortFilter}
                onChange={(e) => setSortFilter(e.target.value)}
              >
                <option value="last-opened">Last opened</option>
                <option value="title">Title</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
            </div>
            <div
              className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5"
              role="group"
              aria-label="Recent documents layout"
            >
              <button
                type="button"
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  recentDocsView === "grid"
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-600 hover:text-gray-900"
                }`}
                aria-pressed={recentDocsView === "grid"}
                onClick={() => persistRecentDocsView("grid")}
              >
                <LayoutGrid className="h-3.5 w-3.5" strokeWidth={2} />
                Grid
              </button>
              <button
                type="button"
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  recentDocsView === "list"
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-600 hover:text-gray-900"
                }`}
                aria-pressed={recentDocsView === "list"}
                onClick={() => persistRecentDocsView("list")}
              >
                <List className="h-3.5 w-3.5" strokeWidth={2} />
                List
              </button>
            </div>
          </div>
        </div>

        <div
          className={
            recentDocsView === "list"
              ? "mt-6 flex flex-col gap-2"
              : "mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          }
        >
          {documents === undefined && (
            <div
              className={`rounded-lg border border-dashed border-gray-300 bg-white px-4 py-12 text-center text-sm text-gray-500 ${
                recentDocsView === "grid" ? "col-span-full" : "w-full"
              }`}
            >
              Loading documents…
            </div>
          )}

          {documents && documents.length === 0 && (
            <div
              className={`rounded-lg border border-dashed border-gray-300 bg-white px-4 py-12 text-center text-sm text-gray-500 ${
                recentDocsView === "grid" ? "col-span-full" : "w-full"
              }`}
            >
              No documents yet. Pick a template above to create your first file.
            </div>
          )}

          {documents &&
            documents.length > 0 &&
            filteredDocuments.length === 0 && (
              <div
                className={`rounded-lg border border-dashed border-gray-300 bg-white px-4 py-12 text-center text-sm text-gray-500 ${
                  recentDocsView === "grid" ? "col-span-full" : "w-full"
                }`}
              >
                No documents match your search or filters.
              </div>
            )}

          {sortedDocuments.map((doc) => {
            const isEditing = editingId === doc._id;

            if (recentDocsView === "list") {
              return (
                <div
                  key={doc._id}
                  role="button"
                  tabIndex={0}
                  className="group flex w-full flex-col gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-left shadow-sm transition hover:border-gray-300 hover:shadow-md sm:flex-row sm:items-center sm:justify-between sm:gap-3"
                  onClick={() => {
                    if (!isEditing) router.push(`/documents/${doc._id}`);
                  }}
                  onKeyDown={(e) => {
                    if (!isEditing && (e.key === "Enter" || e.key === " ")) {
                      e.preventDefault();
                      router.push(`/documents/${doc._id}`);
                    }
                  }}
                >
                  {isEditing ? (
                    <div
                      className="flex w-full flex-col gap-2"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                      role="presentation"
                    >
                      <input
                        className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleRenameSave();
                          }}
                        >
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingId(null);
                            setEditTitle("");
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <Image
                          src="/file.svg"
                          alt=""
                          width={36}
                          height={36}
                          className="h-9 w-9 shrink-0 opacity-45"
                        />
                        <div className="min-w-0 flex-1">
                          <span className="block truncate font-medium text-gray-900">
                            {doc.title}
                          </span>
                          <span className="block text-xs text-gray-500">
                            Updated{" "}
                            {new Date(doc.updatedAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        <button
                          type="button"
                          className={`inline-flex items-center justify-center rounded-full bg-white p-1.5 shadow-sm ring-1 ring-gray-200 transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                            doc.isFavorite === true
                              ? "text-amber-500"
                              : "text-gray-400 hover:text-gray-600"
                          }`}
                          title={
                            doc.isFavorite === true
                              ? "Remove from favorites"
                              : "Add to favorites"
                          }
                          aria-label={
                            doc.isFavorite === true
                              ? "Remove from favorites"
                              : "Add to favorites"
                          }
                          aria-pressed={doc.isFavorite === true}
                          onClick={(e) => {
                            e.stopPropagation();
                            void toggleFavorite({ id: doc._id });
                          }}
                          onKeyDown={(e) => e.stopPropagation()}
                        >
                          <Star
                            className="h-4 w-4"
                            strokeWidth={1.8}
                            fill={
                              doc.isFavorite === true ? "currentColor" : "none"
                            }
                          />
                        </button>
                        <div
                          className="flex rounded-lg border border-gray-200 bg-gray-50 p-0.5"
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                          role="presentation"
                        >
                          <button
                            type="button"
                            className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                              doc.visibility !== "public"
                                ? "bg-white text-gray-900 shadow-sm"
                                : "text-gray-500 hover:text-gray-800"
                            }`}
                            onClick={() =>
                              void setDocumentVisibility({
                                id: doc._id,
                                visibility: "private",
                              })
                            }
                          >
                            Private
                          </button>
                          <button
                            type="button"
                            className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                              doc.visibility === "public"
                                ? "bg-white text-gray-900 shadow-sm"
                                : "text-gray-500 hover:text-gray-800"
                            }`}
                            onClick={() =>
                              void setDocumentVisibility({
                                id: doc._id,
                                visibility: "public",
                              })
                            }
                          >
                            Public
                          </button>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            startRename(doc._id, doc.title);
                          }}
                        >
                          Rename
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            requestDelete(doc._id);
                          }}
                        >
                          Delete
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              );
            }

            return (
              <div
                key={doc._id}
                role="button"
                tabIndex={0}
                className="group flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-white text-left shadow-sm transition hover:border-gray-300 hover:shadow-md"
                onClick={() => {
                  if (!isEditing) router.push(`/documents/${doc._id}`);
                }}
                onKeyDown={(e) => {
                  if (!isEditing && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault();
                    router.push(`/documents/${doc._id}`);
                  }
                }}
              >
                <div className="relative aspect-[4/3] w-full bg-[#f1f3f4]">
                  <div className="absolute inset-4 overflow-hidden rounded-sm border border-gray-200 bg-white shadow-sm">
                    <DocumentCardContentPreview content={doc.content} />
                  </div>
                  <button
                    type="button"
                    className={`absolute right-3 top-3 z-10 inline-flex items-center justify-center rounded-full bg-white/95 p-1.5 shadow-sm ring-offset-2 transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                      doc.isFavorite === true
                        ? "text-amber-500"
                        : "text-gray-400 hover:text-gray-600"
                    }`}
                    title={
                      doc.isFavorite === true
                        ? "Remove from favorites"
                        : "Add to favorites"
                    }
                    aria-label={
                      doc.isFavorite === true
                        ? "Remove from favorites"
                        : "Add to favorites"
                    }
                    aria-pressed={doc.isFavorite === true}
                    onClick={(e) => {
                      e.stopPropagation();
                      void toggleFavorite({ id: doc._id });
                    }}
                    onKeyDown={(e) => {
                      // Keep Space/Enter from activating the card behind this control.
                      e.stopPropagation();
                    }}
                  >
                    <Star
                      className="h-4 w-4"
                      strokeWidth={1.8}
                      fill={doc.isFavorite === true ? "currentColor" : "none"}
                    />
                  </button>
                  <Image
                    src="/file.svg"
                    alt=""
                    width={24}
                    height={24}
                    className="pointer-events-none absolute bottom-3 left-3 z-10 h-6 w-6 opacity-40"
                  />
                </div>

                <div className="flex flex-1 flex-col gap-2 p-3">
                  {isEditing ? (
                    <div className="flex flex-col gap-2">
                      <input
                        className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={(e) => {
                          e.stopPropagation();
                          void handleRenameSave();
                        }}>
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingId(null);
                            setEditTitle("");
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <span className="truncate font-medium text-gray-900">
                        {doc.title}
                      </span>
                      <span className="text-xs text-gray-500">
                        Updated{" "}
                        {new Date(doc.updatedAt).toLocaleDateString()}
                      </span>
                      <div
                        className="mt-2 flex rounded-lg border border-gray-200 bg-gray-50 p-0.5"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                        role="presentation"
                      >
                        <button
                          type="button"
                          className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-colors ${
                            doc.visibility !== "public"
                              ? "bg-white text-gray-900 shadow-sm"
                              : "text-gray-500 hover:text-gray-800"
                          }`}
                          onClick={() =>
                            void setDocumentVisibility({
                              id: doc._id,
                              visibility: "private",
                            })
                          }
                        >
                          Private
                        </button>
                        <button
                          type="button"
                          className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-colors ${
                            doc.visibility === "public"
                              ? "bg-white text-gray-900 shadow-sm"
                              : "text-gray-500 hover:text-gray-800"
                          }`}
                          onClick={() =>
                            void setDocumentVisibility({
                              id: doc._id,
                              visibility: "public",
                            })
                          }
                        >
                          Public
                        </button>
                      </div>
                      <div className="mt-auto flex gap-1 pt-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            startRename(doc._id, doc.title);
                          }}
                        >
                          Rename
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="flex-1 text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            requestDelete(doc._id);
                          }}
                        >
                          Delete
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {deleteConfirmId && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 pt-[min(30vh,200px)]"
          role="presentation"
          onClick={closeDeleteModal}
        >
          <div
            className="w-full max-w-sm rounded-xl border bg-white p-5 shadow-lg"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-dialog-title"
            onClick={(e) => e.stopPropagation()}
          >
            <p
              id="delete-dialog-title"
              className="text-center text-sm font-medium text-zinc-800"
            >
              Delete this document?
            </p>
            <div className="mt-5 flex justify-end gap-6">
              <button
                type="button"
                className="text-sm font-medium text-blue-600 hover:underline"
                onClick={closeDeleteModal}
              >
                Cancel
              </button>
              <button
                ref={deleteOkRef}
                type="button"
                className="text-sm font-medium text-blue-600 hover:underline"
                onClick={() => void confirmDelete()}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
