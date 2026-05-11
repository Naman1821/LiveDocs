"use client";

import { useCallback } from "react";
import type { Editor } from "@tiptap/react";
import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";

import {
  Menubar,
  MenubarCheckboxItem,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarShortcut,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarTrigger,
} from "@/components/ui/menubar";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { useOptionalEditor } from "@/components/editor/editor-context";
import { useMenubarActions } from "@/components/editor/menubar-actions-context";
import { useUiStore } from "@/lib/store/use-ui-store";

function escapeHtmlAttr(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
}

function sanitizeFilename(s: string) {
  return s.replace(/[/\\?%*:|"<>]/g, "-").slice(0, 80) || "document";
}

function downloadHtmlDocument(editor: Editor, title: string) {
  const safeTitle = escapeHtmlAttr(title.trim() || "document");
  const body = editor.getHTML();
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><title>${safeTitle}</title></head><body>${body}</body></html>`;
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const a = document.createElement("a");
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = `${sanitizeFilename(title)}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

function insertLinkFromPrompt(editor: Editor) {
  const { from, to } = editor.state.selection;
  if (from === to) {
    window.alert("Select some text first, then choose Link.");
    return;
  }
  const prev = editor.getAttributes("link").href as string | undefined;
  const url = window.prompt("Link URL (include https://)", prev ?? "https://");
  if (url === null) return;
  const trimmed = url.trim();
  if (!trimmed) {
    editor.chain().focus().unsetLink().run();
    return;
  }
  editor.chain().focus().setLink({ href: trimmed }).run();
}

function insertDefaultTable(editor: Editor) {
  let ok = editor
    .chain()
    .focus()
    .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
    .run();
  if (!ok) {
    editor.chain().focus().createParagraphNear().run();
    ok = editor
      .chain()
      .focus()
      .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
      .run();
  }
  if (!ok) window.alert("Could not insert a table here.");
}

function insertSignatureTable(editor: Editor) {
  let ok = editor
    .chain()
    .focus()
    .insertTable({ rows: 1, cols: 2, withHeaderRow: false })
    .run();
  if (!ok) {
    editor.chain().focus().createParagraphNear().run();
    ok = editor
      .chain()
      .focus()
      .insertTable({ rows: 1, cols: 2, withHeaderRow: false })
      .run();
  }
  if (!ok) window.alert("Could not insert a 2-column table here.");
}

function execClipboard(editor: Editor, command: "cut" | "copy") {
  editor.chain().focus().run();
  editor.view.dom.focus();
  try {
    document.execCommand(command);
  } catch {
    window.alert(`Could not ${command}. Try the keyboard shortcut instead.`);
  }
}

function execPaste(editor: Editor) {
  editor.chain().focus().run();
  editor.view.dom.focus();
  try {
    const ok = document.execCommand("paste");
    if (!ok) {
      window.alert(
        "Paste was blocked — click in the document and press ⌘V (or Ctrl+V).",
      );
    }
  } catch {
    window.alert(
      "Paste was blocked — click in the document and press ⌘V (or Ctrl+V).",
    );
  }
}

async function pastePlain(editor: Editor) {
  try {
    const text = await navigator.clipboard.readText();
    editor.chain().focus().insertContent(text).run();
  } catch {
    window.alert("Could not read plain text from the clipboard.");
  }
}

async function downloadPdfFromEditor(editor: Editor, title: string) {
  const el =
    (editor.view.dom.closest(".tiptap") as HTMLElement | null) ??
    (editor.view.dom as HTMLElement);
  const { default: html2pdf } = await import("html2pdf.js");
  await html2pdf()
    .set({
      margin: [10, 10, 10, 10],
      filename: `${sanitizeFilename(title)}.pdf`,
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
    })
    .from(el)
    .save();
}

export function DocsEditorMenubar({ doc }: { doc: Doc<"documents"> }) {
  const router = useRouter();
  const editor = useOptionalEditor();
  const { focusTitleForRename, triggerImageUpload } = useMenubarActions();
  const setLeftOpen = useUiStore((s) => s.setLeftSidebarOpen);
  const setRightOpen = useUiStore((s) => s.setRightSidebarOpen);
  const leftOpen = useUiStore((s) => s.isLeftSidebarOpen);
  const isRulerVisible = useUiStore((s) => s.isRulerVisible);
  const setRulerVisible = useUiStore((s) => s.setRulerVisible);
  const setShareDialogOpen = useUiStore((s) => s.setShareDialogOpen);
  const setEditorViewMode = useUiStore((s) => s.setEditorViewMode);
  const editorViewMode = useUiStore((s) => s.editorViewMode);
  const setWordCountDialogOpen = useUiStore((s) => s.setWordCountDialogOpen);
  const setFeedbackDialogOpen = useUiStore((s) => s.setFeedbackDialogOpen);
  const setTablePropertiesDialogOpen = useUiStore(
    (s) => s.setTablePropertiesDialogOpen,
  );

  const duplicateDocument = useMutation(api.documents.duplicateDocument);
  const moveDocumentToBin = useMutation(api.documents.moveDocumentToBin);

  const withEditor = useCallback(
    (fn: (ed: Editor) => void) => {
      if (!editor) {
        window.alert("Editor is still loading.");
        return;
      }
      fn(editor);
    },
    [editor],
  );

  const handleDuplicate = async () => {
    try {
      const newId = await duplicateDocument({ id: doc._id });
      router.push(`/documents/${newId}`);
    } catch {
      window.alert("Could not duplicate this document.");
    }
  };

  const handleTrash = async () => {
    if (!window.confirm("Move this document to the bin?")) return;
    try {
      await moveDocumentToBin({ id: doc._id });
      router.push("/");
    } catch {
      window.alert("Could not move the document to the bin.");
    }
  };

  const handleCopyDocLink = async () => {
    const url = `${window.location.origin}/documents/${doc._id}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt("Copy this link:", url);
    }
  };

  const toggleFullscreen = () => {
    const el = document.documentElement;
    if (!document.fullscreenElement) {
      void el.requestFullscreen().catch(() => {
        window.alert("Fullscreen is not supported or was blocked.");
      });
    } else {
      void document.exitFullscreen();
    }
  };

  return (
    <Menubar className="z-40 max-w-full flex-wrap">
      <MenubarMenu>
        <MenubarTrigger>File</MenubarTrigger>
        <MenubarContent className="z-50">
          <MenubarSub>
            <MenubarSubTrigger>New</MenubarSubTrigger>
            <MenubarSubContent className="z-50">
              <MenubarItem onSelect={() => router.push("/documents")}>
                Blank document
              </MenubarItem>
              <MenubarItem
                onSelect={() => router.push("/documents#template-gallery")}
              >
                From template…
              </MenubarItem>
            </MenubarSubContent>
          </MenubarSub>
          <MenubarItem onSelect={() => router.push("/documents")}>
            Open <MenubarShortcut>⌘O</MenubarShortcut>
          </MenubarItem>
          <MenubarItem onSelect={() => void handleDuplicate()}>Make a copy</MenubarItem>
          <MenubarSeparator />
          <MenubarSub>
            <MenubarSubTrigger>Share</MenubarSubTrigger>
            <MenubarSubContent className="z-50">
              <MenubarItem onSelect={() => setShareDialogOpen(true)}>
                Share…
              </MenubarItem>
              <MenubarItem onSelect={() => void handleCopyDocLink()}>
                Copy link
              </MenubarItem>
            </MenubarSubContent>
          </MenubarSub>
          <MenubarSub>
            <MenubarSubTrigger>Download</MenubarSubTrigger>
            <MenubarSubContent className="z-50">
              <MenubarItem
                onSelect={() =>
                  withEditor((ed) =>
                    void downloadPdfFromEditor(ed, doc.title || "document").catch(
                      () =>
                        window.alert(
                          "PDF export failed. Try print to PDF from your browser instead.",
                        ),
                    ),
                  )
                }
              >
                PDF document (.pdf)
              </MenubarItem>
              <MenubarItem
                onSelect={() =>
                  withEditor((ed) =>
                    downloadHtmlDocument(ed, doc.title || "document"),
                  )
                }
              >
                Web Page (.html)
              </MenubarItem>
            </MenubarSubContent>
          </MenubarSub>
          <MenubarSeparator />
          <MenubarItem onSelect={() => focusTitleForRename()}>Rename</MenubarItem>
          <MenubarItem onSelect={() => void handleTrash()}>Move to bin</MenubarItem>
          <MenubarSeparator />
          <MenubarItem onSelect={() => window.print()}>
            Print <MenubarShortcut>⌘P</MenubarShortcut>
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger>Edit</MenubarTrigger>
        <MenubarContent className="z-50">
          <MenubarItem
            onSelect={() =>
              withEditor((ed) => ed.chain().focus().undo().run())
            }
          >
            Undo <MenubarShortcut>⌘Z</MenubarShortcut>
          </MenubarItem>
          <MenubarItem
            onSelect={() =>
              withEditor((ed) => ed.chain().focus().redo().run())
            }
          >
            Redo <MenubarShortcut>⌘Y</MenubarShortcut>
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem onSelect={() => withEditor((ed) => execClipboard(ed, "cut"))}>
            Cut <MenubarShortcut>⌘X</MenubarShortcut>
          </MenubarItem>
          <MenubarItem onSelect={() => withEditor((ed) => execClipboard(ed, "copy"))}>
            Copy <MenubarShortcut>⌘C</MenubarShortcut>
          </MenubarItem>
          <MenubarItem onSelect={() => withEditor((ed) => execPaste(ed))}>
            Paste <MenubarShortcut>⌘V</MenubarShortcut>
          </MenubarItem>
          <MenubarItem onSelect={() => void withEditor((ed) => void pastePlain(ed))}>
            Paste without formatting{" "}
            <MenubarShortcut>⌘⇧V</MenubarShortcut>
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem
            onSelect={() =>
              withEditor((ed) => ed.chain().focus().selectAll().run())
            }
          >
            Select all <MenubarShortcut>⌘A</MenubarShortcut>
          </MenubarItem>
          <MenubarItem
            onSelect={() =>
              withEditor((ed) => ed.chain().focus().deleteSelection().run())
            }
          >
            Delete
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger>View</MenubarTrigger>
        <MenubarContent className="z-50">
          <MenubarSub>
            <MenubarSubTrigger>Mode</MenubarSubTrigger>
            <MenubarSubContent className="z-50">
              <MenubarItem
                onSelect={() => setEditorViewMode("editing")}
                className={editorViewMode === "editing" ? "font-semibold" : ""}
              >
                Editing
              </MenubarItem>
              <MenubarItem
                onSelect={() => setEditorViewMode("suggesting")}
                className={editorViewMode === "suggesting" ? "font-semibold" : ""}
              >
                Suggesting
              </MenubarItem>
              <MenubarItem
                onSelect={() => setEditorViewMode("viewing")}
                className={editorViewMode === "viewing" ? "font-semibold" : ""}
              >
                Viewing (read-only)
              </MenubarItem>
            </MenubarSubContent>
          </MenubarSub>
          <MenubarSub>
            <MenubarSubTrigger>Comments</MenubarSubTrigger>
            <MenubarSubContent className="z-50">
              <MenubarItem onSelect={() => setRightOpen(true)}>
                Show all comments
              </MenubarItem>
              <MenubarItem onSelect={() => setRightOpen(false)}>
                Hide comments
              </MenubarItem>
            </MenubarSubContent>
          </MenubarSub>
          <MenubarItem
            onSelect={() => setLeftOpen(!leftOpen)}
          >
            Toggle tabs sidebar
          </MenubarItem>
          <MenubarSeparator />
          <MenubarCheckboxItem
            checked={isRulerVisible}
            onCheckedChange={(v) => setRulerVisible(!!v)}
          >
            Show ruler
          </MenubarCheckboxItem>
          <MenubarSeparator />
          <MenubarItem onSelect={() => toggleFullscreen()}>Full screen</MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger>Insert</MenubarTrigger>
        <MenubarContent className="z-50">
          <MenubarItem onSelect={() => triggerImageUpload()}>
            Image from computer
          </MenubarItem>
          <MenubarSub>
            <MenubarSubTrigger>Table</MenubarSubTrigger>
            <MenubarSubContent className="z-50">
              <MenubarItem onSelect={() => withEditor(insertDefaultTable)}>
                Insert table…
              </MenubarItem>
              <MenubarItem onSelect={() => withEditor(insertSignatureTable)}>
                Insert signature table (2x1)
              </MenubarItem>
            </MenubarSubContent>
          </MenubarSub>
          <MenubarItem onSelect={() => withEditor(insertLinkFromPrompt)}>
            Link <MenubarShortcut>⌘K</MenubarShortcut>
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem
            onSelect={() =>
              withEditor((ed) => ed.chain().focus().insertPageBreak().run())
            }
          >
            Page break
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger>Format</MenubarTrigger>
        <MenubarContent className="z-50">
          <MenubarSub>
            <MenubarSubTrigger>Text</MenubarSubTrigger>
            <MenubarSubContent className="z-50">
              <MenubarItem
                onSelect={() =>
                  withEditor((ed) => ed.chain().focus().toggleBold().run())
                }
              >
                Bold
              </MenubarItem>
              <MenubarItem
                onSelect={() =>
                  withEditor((ed) => ed.chain().focus().toggleItalic().run())
                }
              >
                Italic
              </MenubarItem>
              <MenubarItem
                onSelect={() =>
                  withEditor((ed) =>
                    ed.chain().focus().toggleUnderline().run(),
                  )
                }
              >
                Underline
              </MenubarItem>
            </MenubarSubContent>
          </MenubarSub>
          <MenubarSub>
            <MenubarSubTrigger>Paragraph styles</MenubarSubTrigger>
            <MenubarSubContent className="z-50">
              <MenubarItem
                onSelect={() =>
                  withEditor((ed) => ed.chain().focus().setParagraph().run())
                }
              >
                Normal text
              </MenubarItem>
              <MenubarItem
                onSelect={() =>
                  withEditor((ed) =>
                    ed.chain().focus().toggleHeading({ level: 1 }).run(),
                  )
                }
              >
                Title
              </MenubarItem>
              <MenubarItem
                onSelect={() =>
                  withEditor((ed) =>
                    ed.chain().focus().toggleHeading({ level: 2 }).run(),
                  )
                }
              >
                Subtitle
              </MenubarItem>
            </MenubarSubContent>
          </MenubarSub>
          <MenubarSub>
            <MenubarSubTrigger>Align and indent</MenubarSubTrigger>
            <MenubarSubContent className="z-50">
              <MenubarItem
                onSelect={() =>
                  withEditor((ed) =>
                    ed.chain().focus().setTextAlign("left").run(),
                  )
                }
              >
                Align left
              </MenubarItem>
              <MenubarItem
                onSelect={() =>
                  withEditor((ed) =>
                    ed.chain().focus().setTextAlign("center").run(),
                  )
                }
              >
                Align centre
              </MenubarItem>
              <MenubarItem
                onSelect={() =>
                  withEditor((ed) =>
                    ed.chain().focus().setTextAlign("right").run(),
                  )
                }
              >
                Align right
              </MenubarItem>
            </MenubarSubContent>
          </MenubarSub>
          <MenubarSub>
            <MenubarSubTrigger>Line & paragraph spacing</MenubarSubTrigger>
            <MenubarSubContent className="z-50">
              <MenubarItem
                onSelect={() =>
                  withEditor((ed) =>
                    ed.chain().focus().setLineHeight("1.15").run(),
                  )
                }
              >
                Single
              </MenubarItem>
              <MenubarItem
                onSelect={() =>
                  withEditor((ed) =>
                    ed.chain().focus().setLineHeight("1.15").run(),
                  )
                }
              >
                1.15
              </MenubarItem>
            </MenubarSubContent>
          </MenubarSub>
          <MenubarItem
            onSelect={() =>
              withEditor((ed) =>
                ed.chain().focus().insertTwoColumnSection().run(),
              )
            }
          >
            Two columns
          </MenubarItem>
          <MenubarSub>
            <MenubarSubTrigger>Bullets and numbering</MenubarSubTrigger>
            <MenubarSubContent className="z-50">
              <MenubarItem
                onSelect={() =>
                  withEditor((ed) =>
                    ed.chain().focus().toggleBulletList().run(),
                  )
                }
              >
                Bulleted list
              </MenubarItem>
              <MenubarItem
                onSelect={() =>
                  withEditor((ed) =>
                    ed.chain().focus().toggleOrderedList().run(),
                  )
                }
              >
                Numbered list
              </MenubarItem>
            </MenubarSubContent>
          </MenubarSub>
          <MenubarSeparator />
          <MenubarSub>
            <MenubarSubTrigger>Table</MenubarSubTrigger>
            <MenubarSubContent className="z-50">
              <MenubarItem onSelect={() => withEditor(insertSignatureTable)}>
                Insert table (2x1)
              </MenubarItem>
              <MenubarSeparator />
              <MenubarItem
                onSelect={() => {
                  if (!editor?.isActive("table")) {
                    window.alert("Click inside a table cell first.");
                    return;
                  }
                  setTablePropertiesDialogOpen(true);
                }}
              >
                Table properties…
              </MenubarItem>
            </MenubarSubContent>
          </MenubarSub>
          <MenubarSeparator />
          <MenubarItem
            onSelect={() =>
              withEditor((ed) =>
                ed.chain().focus().unsetAllMarks().clearNodes().run(),
              )
            }
          >
            Clear formatting <MenubarShortcut>⌘\</MenubarShortcut>
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger>Tools</MenubarTrigger>
        <MenubarContent className="z-50">
          <MenubarItem
            onSelect={() =>
              withEditor((ed) => {
                ed.view.dom.setAttribute("spellcheck", "false");
                ed.view.dom.setAttribute("autocorrect", "off");
                ed.view.dom.setAttribute("autocomplete", "off");
                ed.view.dom.setAttribute("autocapitalize", "off");
                ed.view.dom.setAttribute("data-gramm", "false");
                ed.view.dom.setAttribute("data-gramm_editor", "false");
                ed.view.dom.setAttribute("data-enable-grammarly", "false");
                ed.chain().focus().run();
              })
            }
          >
            Keep writing tools off
          </MenubarItem>
          <MenubarItem
            onSelect={() => {
              if (!editor) {
                window.alert("Editor is still loading.");
                return;
              }
              setWordCountDialogOpen(true);
            }}
          >
            Word count <MenubarShortcut>⌘⇧C</MenubarShortcut>
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger>Help</MenubarTrigger>
        <MenubarContent className="z-50">
          <MenubarItem onSelect={() => setFeedbackDialogOpen(true)}>
            Share feedback…
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>
    </Menubar>
  );
}
