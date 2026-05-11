"use client";

import { useMutation, useQuery } from "convex/react";
import { ArrowLeft, FileText, ListTree, MoreVertical, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { useUiStore } from "@/lib/store/use-ui-store";
import { cn } from "@/lib/utils";

type TabRow = { tabKey: string; title: string };

type OutlineItem = { pos: number; level: number; text: string };

function collectHeadingOutline(editor: Editor): OutlineItem[] {
  const out: OutlineItem[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== "heading") return;
    const text = node.textContent.trim();
    if (!text) return;
    const level = typeof node.attrs.level === "number" ? node.attrs.level : 1;
    out.push({
      pos,
      level,
      text: text.length > 120 ? `${text.slice(0, 117)}…` : text,
    });
  });
  return out;
}

export function DocumentTabsSidebar({
  document,
  editor = null,
  accessRole,
}: {
  document: Doc<"documents">;
  editor?: Editor | null;
  accessRole: "owner" | "editor" | "viewer";
}) {
  const activeTabId = useUiStore((s) => s.activeTabId);
  const setActiveTabId = useUiStore((s) => s.setActiveTabId);
  const setLeftSidebarOpen = useUiStore((s) => s.setLeftSidebarOpen);

  const tabs = useQuery(api.documentTabs.listTabsForDocument, {
    documentId: document._id,
  });
  const ensureInitialTab = useMutation(api.documentTabs.ensureInitialTab);
  /** `documentTabs` mutations stay deploy-compatible with older Convex bundles. */
  const addTab = useMutation(api.documentTabs.addDocumentTab);
  const renameTab = useMutation(api.documentTabs.renameTab);
  const deleteTab = useMutation(api.documentTabs.deleteTab);

  const [adding, setAdding] = useState(false);
  const [outlineTick, setOutlineTick] = useState(0);
  const [pendingDelete, setPendingDelete] = useState<{
    tabKey: string;
    title: string;
  } | null>(null);
  const pendingDeleteRef = useRef(pendingDelete);
  pendingDeleteRef.current = pendingDelete;
  const deleteConfirmButtonRef = useRef<HTMLButtonElement | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  useEffect(() => {
    if (!editor) return;
    const bump = () => setOutlineTick((t) => t + 1);
    editor.on("update", bump);
    editor.on("selectionUpdate", bump);
    return () => {
      editor.off("update", bump);
      editor.off("selectionUpdate", bump);
    };
  }, [editor]);

  const headingOutline = useMemo(() => {
    if (!editor) return [];
    void outlineTick;
    return collectHeadingOutline(editor);
  }, [editor, outlineTick]);

  /**
   * While the query is loading, show the denormalized snapshot. After load: use Convex rows
   * so delete targets real `documentTabs` rows. Viewers can still see snapshot if the table is
   * empty (they cannot run `ensureInitialTab`).
   */
  const displayTabs: TabRow[] = useMemo(() => {
    if (tabs === undefined) {
      const snap = document.tabs;
      if (snap && snap.length > 0) {
        return snap.map((t) => ({ tabKey: t.id, title: t.title }));
      }
      return [];
    }
    if (tabs.length > 0) {
      return tabs.map((t) => ({ tabKey: t.tabKey, title: t.title }));
    }
    if (accessRole === "viewer") {
      const snap = document.tabs;
      if (snap?.length) {
        return snap.map((t) => ({ tabKey: t.id, title: t.title }));
      }
    }
    return [];
  }, [tabs, document.tabs, accessRole]);

  const handleAdd = useCallback(async () => {
    if (adding || tabs === undefined) return;
    setAdding(true);
    try {
      if (tabs.length === 0) {
        const key = await ensureInitialTab({ documentId: document._id });
        setActiveTabId(key);
        return;
      }
      const key = await addTab({ documentId: document._id });
      setActiveTabId(key);
    } catch (e) {
      console.error(e);
      window.alert(e instanceof Error ? e.message : "Could not add a tab.");
    } finally {
      setAdding(false);
    }
  }, [addTab, adding, document._id, ensureInitialTab, setActiveTabId, tabs]);

  const handleRename = useCallback(
    async (tabKey: string, current: string) => {
      const next = window.prompt("Tab name", current);
      if (next === null) return;
      try {
        await renameTab({
          documentId: document._id,
          tabKey,
          title: next,
        });
      } catch (e) {
        console.error(e);
        window.alert(e instanceof Error ? e.message : "Could not rename tab.");
      }
    },
    [document._id, renameTab],
  );

  const confirmDeleteTab = useCallback(async () => {
    const target = pendingDeleteRef.current;
    if (!target) return;
    const { tabKey } = target;
    setDeleteBusy(true);
    try {
      const nextActive = await deleteTab({
        documentId: document._id,
        tabKey,
      });
      setPendingDelete(null);
      pendingDeleteRef.current = null;
      if (activeTabId === tabKey) {
        setActiveTabId(nextActive);
      }
    } catch (e) {
      console.error(e);
      window.alert(e instanceof Error ? e.message : "Could not delete tab.");
    } finally {
      setDeleteBusy(false);
    }
  }, [activeTabId, deleteTab, document._id, setActiveTabId]);

  return (
    <aside className="flex h-full min-h-0 w-[260px] shrink-0 flex-col border-r border-[#dadce0] bg-white no-print">
      <div className="flex shrink-0 items-center gap-1 border-b border-[#e8eaed] px-2 py-3">
        <button
          type="button"
          onClick={() => setLeftSidebarOpen(false)}
          className="rounded-full p-2 text-[#444746] hover:bg-[#f1f3f4]"
          title="Collapse sidebar"
        >
          <span className="sr-only">Collapse sidebar</span>
          <ArrowLeft className="h-5 w-5" aria-hidden />
        </button>
        <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-[#202124]">
          Document tabs
        </span>
        {accessRole !== "viewer" ? (
          <button
            type="button"
            className="rounded-full p-2 text-[#444746] hover:bg-[#f1f3f4] disabled:opacity-40"
            title="New tab"
            disabled={adding || tabs === undefined}
            onClick={() => void handleAdd()}
          >
            <Plus className="h-5 w-5" />
          </button>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="max-h-[min(240px,38vh)] shrink-0 overflow-y-auto px-2 py-3">
          {tabs === undefined && displayTabs.length === 0 && (
            <p className="px-2 text-xs text-gray-500">Loading tabs…</p>
          )}
          {tabs !== undefined && tabs.length === 0 && (
            <p className="px-2 text-xs text-gray-500">Preparing tabs…</p>
          )}
          {displayTabs.map((tab) => {
            const active = tab.tabKey === activeTabId;
            return (
              <div
                key={tab.tabKey}
                className={cn(
                  "mb-0.5 flex items-center justify-between gap-1 rounded-lg px-2 py-2 text-sm",
                  active
                    ? "bg-[#e8f0fe] text-[#041E49]"
                    : "text-[#202124] hover:bg-[#f1f3f4]",
                )}
              >
                <button
                  type="button"
                  title="Switch to this tab"
                  onClick={() => setActiveTabId(tab.tabKey)}
                  className={cn(
                    "flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md py-0.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-[#0B57D0]/35",
                    active ? "text-[#041E49]" : "text-[#202124]",
                  )}
                >
                  <FileText className="size-[18px] shrink-0 opacity-80" strokeWidth={2} />
                  <span className="truncate font-medium">{tab.title}</span>
                </button>
                {accessRole !== "viewer" ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className={cn(
                          "rounded-full p-1 shrink-0",
                          active ? "hover:bg-[#041E49]/10" : "hover:bg-gray-200",
                        )}
                        title="Tab options"
                        aria-label="Tab options"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreVertical className="size-4" strokeWidth={2} />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="z-50 w-44">
                      <DropdownMenuItem
                        className="cursor-pointer"
                        onSelect={() => void handleRename(tab.tabKey, tab.title)}
                      >
                        Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="cursor-pointer text-red-600 focus:text-red-600"
                        onSelect={(e) => {
                          e.preventDefault();
                          setPendingDelete({
                            tabKey: tab.tabKey,
                            title: tab.title,
                          });
                        }}
                      >
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
              </div>
            );
          })}
        </div>

        {editor && headingOutline.length > 0 ? (
          <div className="flex min-h-0 flex-1 flex-col border-t border-[#e8eaed] px-1 pt-2">
            <div className="flex shrink-0 items-center gap-1.5 px-2 pb-2 text-[11px] font-medium uppercase tracking-wide text-[#5f6368]">
              <ListTree className="size-3.5 shrink-0 opacity-80" strokeWidth={2} />
              Outline
            </div>
            <nav
              className="min-h-0 flex-1 overflow-y-auto px-1 pb-3"
              aria-label="Document outline"
            >
              {headingOutline.map((item, idx) => (
                <button
                  key={`h-${item.pos}-${idx}`}
                  type="button"
                  className="flex w-full min-w-0 cursor-pointer rounded-md py-1.5 text-left text-[13px] leading-snug text-[#202124] hover:bg-[#f1f3f4]"
                  style={{ paddingLeft: `${8 + (item.level - 1) * 12}px` }}
                  title={item.text}
                  onClick={() => {
                    editor
                      .chain()
                      .focus()
                      .setTextSelection(item.pos + 1)
                      .scrollIntoView()
                      .run();
                  }}
                >
                  <span className="line-clamp-2 break-words">{item.text}</span>
                </button>
              ))}
            </nav>
          </div>
        ) : (
          <p className="shrink-0 border-t border-[#e8eaed] px-3 py-3 text-xs leading-relaxed text-[#5f6368]">
            Add headings in the document to see an outline here.
          </p>
        )}
      </div>

      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open && !deleteBusy) setPendingDelete(null);
        }}
      >
        <DialogContent
          className="max-w-md sm:rounded-xl"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            requestAnimationFrame(() => {
              deleteConfirmButtonRef.current?.focus();
            });
          }}
          onPointerDownOutside={(e) => {
            if (deleteBusy) e.preventDefault();
          }}
          onEscapeKeyDown={(e) => {
            if (deleteBusy) e.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>Delete this tab?</DialogTitle>
            <DialogDescription>
              {pendingDelete ? (
                <>
                  <span className="font-medium text-gray-900">
                    “{pendingDelete.title}”
                  </span>{" "}
                  will be removed. Its Liveblocks room and tab data will be deleted. This
                  can’t be undone.
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              disabled={deleteBusy}
              onClick={() => setPendingDelete(null)}
            >
              Cancel
            </Button>
            <button
              ref={deleteConfirmButtonRef}
              type="button"
              disabled={deleteBusy}
              className={cn(buttonVariants({ variant: "destructive", size: "default" }))}
              onClick={() => void confirmDeleteTab()}
            >
              {deleteBusy ? "Deleting…" : "OK"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </aside>
  );
}
