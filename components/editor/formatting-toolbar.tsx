"use client";

import type { ReactNode, RefObject } from "react";
import { useMemo, useState } from "react";
import type { Editor } from "@tiptap/react";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  AlignVerticalSpaceBetween,
  Baseline,
  Bold,
  ChevronDown,
  FileUp,
  ImageIcon,
  Italic,
  Link2,
  List,
  ListIndentDecrease,
  ListIndentIncrease,
  ListOrdered,
  ListTodo,
  MessageSquarePlus,
  Minus,
  PenLine,
  Plus,
  Printer,
  Redo,
  RemoveFormatting,
  Sparkles,
  Underline,
  Undo,
} from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/lib/store/use-ui-store";
import { useOptionalEditor } from "@/components/editor/editor-context";
import { useToolbarStore } from "@/lib/editor-toolbar-store";

const ZOOM_LEVELS = [50, 75, 100, 125, 150] as const;

type ToolbarState = {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  highlight: boolean;
  bulletList: boolean;
  orderedList: boolean;
  taskList: boolean;
  link: boolean;
  superscript: boolean;
  subscript: boolean;
  heading: "p" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
  fontFamily: string;
  fontSize: string;
  lineHeight: string;
  textAlign: string;
};

function ToolbarDivider() {
  return (
    <span
      className="mx-2 h-4 w-[1px] shrink-0 bg-[#C7C7C7]"
      aria-hidden
    />
  );
}

function ToolBtn({
  active,
  title,
  onClick,
  children,
  className,
}: {
  active?: boolean;
  title: string;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        "flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-sm text-[#444746] transition-colors hover:bg-gray-200/50",
        active && "bg-[#D3E3FD] text-[#041E49] hover:bg-[#D3E3FD]",
        className,
      )}
    >
      {children}
    </button>
  );
}

function DropdownShell({
  label,
  className,
  children,
}: {
  label: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label
      className={cn(
        "relative flex h-8 shrink-0 cursor-pointer items-center gap-1 rounded-sm px-2 text-sm text-[#444746] hover:bg-gray-200/50",
        className,
      )}
    >
      {children}
      <span className="pointer-events-none flex items-center gap-1">
        {label}
        <ChevronDown className="size-3 shrink-0 opacity-70" aria-hidden />
      </span>
    </label>
  );
}

function pxFromFontSize(s: string): number {
  const m = /^(\d+(?:\.\d+)?)px$/.exec(s.trim());
  return m ? Math.round(Number(m[1])) : 11;
}

function fontSizeStep(px: number, delta: number): string {
  const next = Math.min(96, Math.max(8, px + delta));
  return `${next}px`;
}

export function FormattingToolbar({
  editor: editorProp,
  tb,
  imageInputRef,
  docxInputRef,
  importFromComputerEnabled = true,
  /** Site owner has AI on — show “how to use AI” next to the toolbar. */
  aiUsageHintsEnabled = false,
  onOpenComments,
}: {
  editor?: Editor | null;
  tb: ToolbarState;
  imageInputRef: RefObject<HTMLInputElement | null>;
  docxInputRef?: RefObject<HTMLInputElement | null>;
  /** Site owner can disable .docx import from computer (toolbar File-up icon). */
  importFromComputerEnabled?: boolean;
  aiUsageHintsEnabled?: boolean;
  onOpenComments?: (selectedText: string) => void;
}) {
  const editorFromCtx = useOptionalEditor();
  const editor = editorProp ?? editorFromCtx;
  const [aiHelpOpen, setAiHelpOpen] = useState(false);
  const zoomLevel = useUiStore((s) => s.zoomLevel);
  const setZoomLevel = useUiStore((s) => s.setZoomLevel);
  const setRightSidebarOpen = useUiStore((s) => s.setRightSidebarOpen);

  const sizePx = useMemo(() => pxFromFontSize(tb.fontSize), [tb.fontSize]);

  const paragraphLabel =
    tb.heading === "p"
      ? "Normal text"
      : tb.heading === "h1"
        ? "Title"
        : tb.heading === "h2"
          ? "Subtitle"
          : tb.heading === "h3"
            ? "Heading 1"
            : tb.heading === "h4"
              ? "Heading 2"
              : tb.heading === "h5"
                ? "Heading 3"
                : "Heading 4";

  const alignLabels: Record<string, string> = {
    left: "Align left",
    center: "Align centre",
    right: "Align right",
    justify: "Justified",
  };

  const AlignPickerIcon =
    tb.textAlign === "center"
      ? AlignCenter
      : tb.textAlign === "right"
        ? AlignRight
        : tb.textAlign === "justify"
          ? AlignJustify
          : AlignLeft;

  if (!editor) return null;

  const setParagraphStyle = (value: string) => {
    const chain = editor.chain().focus();
    if (value === "p") chain.setParagraph().run();
    if (value === "h1") chain.toggleHeading({ level: 1 }).run();
    if (value === "h2") chain.toggleHeading({ level: 2 }).run();
    if (value === "h3") chain.toggleHeading({ level: 3 }).run();
    if (value === "h4") chain.toggleHeading({ level: 4 }).run();
    if (value === "h5") chain.toggleHeading({ level: 5 }).run();
    if (value === "h6") chain.toggleHeading({ level: 6 }).run();
    // Immediately sync toolbar state so the dropdown label updates without
    // waiting for the next selectionUpdate event.
    useToolbarStore.getState().syncFromEditor(editor);
  };

  const setFontFamily = (nextFont: string) => {
    const chain = editor.chain().focus() as unknown as {
      setFontFamily?: (font: string) => { run: () => boolean };
      setMark: (
        name: string,
        attrs: Record<string, string>,
      ) => { run: () => boolean };
    };
    if (chain.setFontFamily) {
      chain.setFontFamily(nextFont).run();
      return;
    }
    chain.setMark("textStyle", { fontFamily: nextFont }).run();
  };

  const adjustIndent = (delta: 1 | -1) => {
    const chain = editor.chain().focus();
    const inList =
      editor.isActive("bulletList") ||
      editor.isActive("orderedList") ||
      editor.isActive("taskList");
    if (inList) {
      const itemType = editor.isActive("taskItem") ? "taskItem" : "listItem";
      if (delta > 0) chain.sinkListItem(itemType).run();
      else chain.liftListItem(itemType).run();
      return;
    }
    if (delta > 0) chain.indentBlock().run();
    else chain.outdentBlock().run();
  };

  const openLink = () => {
    const { from, to } = editor.state.selection;
    if (from === to) {
      window.alert(
        "Select some text first, then add a link and paste a full URL (e.g. https://example.com).",
      );
      return;
    }
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL (include https://)", prev ?? "https://");
    if (url === null) return;
    const normalized = url.trim();
    if (!normalized) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    editor.chain().focus().setLink({ href: normalized }).run();
  };

  return (
    <div
      className={cn(
        "mx-4 mb-3 flex min-w-0 shrink-0 items-stretch gap-1 overflow-hidden rounded-full border border-[#B6CCFF] bg-[#D3E3FD] p-1.5 shadow-sm no-print",
      )}
    >
      <div
        className={cn(
          "flex min-h-8 min-w-0 flex-1 flex-nowrap items-center gap-0.5 overflow-x-auto overflow-y-hidden px-0.5",
          "[scrollbar-width:thin] [scrollbar-color:rgb(209_213_219)_transparent]",
          "[&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-track]:bg-transparent",
        )}
      >
        {/* Group 1 */}
        <ToolBtn title="Undo (⌘Z)" onClick={() => editor.chain().focus().undo().run()}>
          <Undo className="size-4" strokeWidth={2} />
        </ToolBtn>
        <ToolBtn title="Redo (⌘Y)" onClick={() => editor.chain().focus().redo().run()}>
          <Redo className="size-4" strokeWidth={2} />
        </ToolBtn>
        <ToolBtn title="Print" onClick={() => window.print()}>
          <Printer className="size-4" strokeWidth={2} />
        </ToolBtn>

        <ToolbarDivider />

        {/* Group 2 — Zoom → scales canvas via Zustand + CSS transform */}
        <DropdownShell
          label={<span className="tabular-nums">{zoomLevel}%</span>}
        >
          <select
            aria-label="Zoom"
            className="absolute inset-0 cursor-pointer opacity-0"
            value={String(zoomLevel)}
            onChange={(e) => setZoomLevel(Number(e.target.value))}
          >
            {ZOOM_LEVELS.map((z) => (
              <option key={z} value={String(z)}>
                {z}%
              </option>
            ))}
          </select>
        </DropdownShell>

        <ToolbarDivider />

        {/* Group 3 — Paragraph styles */}
        <DropdownShell
          label={<span className="max-w-[8rem] truncate">{paragraphLabel}</span>}
        >
          <select
            aria-label="Paragraph style"
            className="absolute inset-0 cursor-pointer opacity-0"
            value={tb.heading}
            onChange={(e) => setParagraphStyle(e.target.value)}
          >
            <option value="p">Normal text</option>
            <option value="h1">Title</option>
            <option value="h2">Subtitle</option>
            <option value="h3">Heading 1</option>
            <option value="h4">Heading 2</option>
            <option value="h5">Heading 3</option>
            <option value="h6">Heading 4</option>
          </select>
        </DropdownShell>

        <ToolbarDivider />

        {/* Group 4 — Font family */}
        <DropdownShell
          label={
            <span className="max-w-[5.5rem] truncate">
              {tb.fontFamily.replace(/^['"]|['"]$/g, "")}
            </span>
          }
        >
          <select
            aria-label="Font family"
            className="absolute inset-0 cursor-pointer opacity-0"
            value={tb.fontFamily}
            onChange={(e) => setFontFamily(e.target.value)}
          >
            <option value="Arial">Arial</option>
            <option value="Inter">Inter</option>
            <option value="Georgia">Georgia</option>
            <option value="'Times New Roman'">Times New Roman</option>
            <option value="'Courier New'">Courier New</option>
          </select>
        </DropdownShell>

        <ToolbarDivider />

        {/* Group 5 — Font size */}
        <div className="flex shrink-0 items-center gap-0.5 px-1">
          <ToolBtn
            title="Smaller text"
            onClick={() =>
              editor
                .chain()
                .focus()
                .setFontSize(fontSizeStep(sizePx, -1))
                .run()
            }
          >
            <Minus className="size-4" strokeWidth={2} />
          </ToolBtn>
          <span className="min-w-[1.25rem] text-center text-sm tabular-nums text-[#444746]">
            {sizePx}
          </span>
          <ToolBtn
            title="Larger text"
            onClick={() =>
              editor
                .chain()
                .focus()
                .setFontSize(fontSizeStep(sizePx, 1))
                .run()
            }
          >
            <Plus className="size-4" strokeWidth={2} />
          </ToolBtn>
        </div>

        <ToolbarDivider />

        {/* Group 6 — Marks */}
        <ToolBtn
          title="Bold"
          active={tb.bold}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold className="size-4" strokeWidth={2} />
        </ToolBtn>
        <ToolBtn
          title="Italic"
          active={tb.italic}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic className="size-4" strokeWidth={2} />
        </ToolBtn>
        <ToolBtn
          title="Underline"
          active={tb.underline}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <Underline className="size-4" strokeWidth={2} />
        </ToolBtn>
        <ToolBtn
          title="Superscript"
          active={tb.superscript}
          onClick={() =>
            editor.chain().focus().unsetSubscript().toggleSuperscript().run()
          }
        >
          <span className="text-[11px] font-semibold leading-none">x²</span>
        </ToolBtn>
        <ToolBtn
          title="Subscript"
          active={tb.subscript}
          onClick={() =>
            editor.chain().focus().unsetSuperscript().toggleSubscript().run()
          }
        >
          <span className="text-[11px] font-semibold leading-none">x₂</span>
        </ToolBtn>
        <label
          className="relative flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-sm text-[#444746] hover:bg-gray-200/50"
          title="Text colour"
        >
          <input
            type="color"
            className="absolute inset-0 cursor-pointer opacity-0"
            onChange={(e) =>
              editor.chain().focus().setColor(e.target.value).run()
            }
          />
          <Baseline className="size-4" strokeWidth={2} />
        </label>
        <ToolBtn
          title="Highlight"
          active={tb.highlight}
          onClick={() =>
            editor
              .chain()
              .focus()
              .toggleHighlight({ color: "#fef08a" })
              .run()
          }
        >
          <PenLine className="size-4" strokeWidth={2} />
        </ToolBtn>

        <ToolbarDivider />

        {/* Group 7 */}
        <ToolBtn
          title="Insert link"
          active={tb.link}
          onClick={openLink}
        >
          <Link2 className="size-4" strokeWidth={2} />
        </ToolBtn>
        <ToolBtn
          title="Open comments"
          onClick={() => {
            const { from, to } = editor.state.selection;
            const selectedText =
              from === to
                ? ""
                : editor.state.doc.textBetween(from, to, " ").trim();
            if (onOpenComments) {
              onOpenComments(selectedText);
              return;
            }
            setRightSidebarOpen(true);
          }}
        >
          <MessageSquarePlus className="size-4" strokeWidth={2} />
        </ToolBtn>
        <ToolBtn title="Insert image from device" onClick={() => imageInputRef.current?.click()}>
          <ImageIcon className="size-4" strokeWidth={2} />
        </ToolBtn>
        {importFromComputerEnabled ? (
          <ToolBtn
            title="Import DOCX file"
            onClick={() => docxInputRef?.current?.click()}
          >
            <FileUp className="size-4" strokeWidth={2} />
          </ToolBtn>
        ) : null}

        <DropdownShell
          label={
            <AlignPickerIcon className="size-4 shrink-0" strokeWidth={2} />
          }
          className="min-w-[3rem]"
        >
          <select
            aria-label="Text alignment"
            className="absolute inset-0 cursor-pointer opacity-0"
            value={tb.textAlign}
            onChange={(e) =>
              editor
                .chain()
                .focus()
                .setTextAlign(e.target.value as "left" | "center" | "right" | "justify")
                .run()
            }
          >
            <option value="left">{alignLabels.left}</option>
            <option value="center">{alignLabels.center}</option>
            <option value="right">{alignLabels.right}</option>
            <option value="justify">{alignLabels.justify}</option>
          </select>
        </DropdownShell>

        <DropdownShell
          label={<AlignVerticalSpaceBetween className="size-4" strokeWidth={2} />}
          className="min-w-[2.25rem]"
        >
          <select
            aria-label="Line and paragraph spacing"
            className="absolute inset-0 cursor-pointer opacity-0"
            value={tb.lineHeight}
            onChange={(e) =>
              editor.chain().focus().setLineHeight(e.target.value).run()
            }
          >
            <option value="1.15">1.15</option>
            <option value="1.5">1.5</option>
            <option value="1.75">1.75</option>
            <option value="2">2</option>
          </select>
        </DropdownShell>

        <ToolbarDivider />

        {/* Group 8 */}
        <ToolBtn
          title="Checklist"
          active={tb.taskList}
          onClick={() => editor.chain().focus().toggleTaskList().run()}
        >
          <ListTodo className="size-4" strokeWidth={2} />
        </ToolBtn>
        <ToolBtn
          title="Bulleted list"
          active={tb.bulletList}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List className="size-4" strokeWidth={2} />
        </ToolBtn>
        <ToolBtn
          title="Numbered list"
          active={tb.orderedList}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="size-4" strokeWidth={2} />
        </ToolBtn>
        <ToolBtn
          title="Decrease indent (paragraph or list)"
          onClick={() => adjustIndent(-1)}
        >
          <ListIndentDecrease className="size-4" strokeWidth={2} />
        </ToolBtn>
        <ToolBtn
          title="Increase indent (paragraph or list)"
          onClick={() => adjustIndent(1)}
        >
          <ListIndentIncrease className="size-4" strokeWidth={2} />
        </ToolBtn>

        <ToolbarDivider />

        {/* Group 9 */}
        <ToolBtn
          title="Clear formatting"
          onClick={() =>
            editor
              .chain()
              .focus()
              .unsetAllMarks()
              .clearNodes()
              .run()
          }
        >
          <RemoveFormatting className="size-4" strokeWidth={2} />
        </ToolBtn>
      </div>

      {aiUsageHintsEnabled ? (
        <div className="flex shrink-0 items-center border-l border-[#a8c4fa] pl-1.5">
          <Dialog open={aiHelpOpen} onOpenChange={setAiHelpOpen}>
            <DialogTrigger asChild>
              <button
                type="button"
                title="How AI rewrite works in this editor"
                className="flex h-8 max-w-[11rem] shrink-0 items-center gap-1.5 rounded-full border border-[#93b4f8] bg-white px-2.5 text-left text-xs font-semibold leading-tight text-[#0b57d0] shadow-sm hover:bg-[#e8f0fe] sm:max-w-none sm:px-3"
              >
                <Sparkles className="size-3.5 shrink-0" strokeWidth={2} aria-hidden />
                <span className="hidden sm:inline">How to use AI rewrite</span>
                <span className="sm:hidden">AI help</span>
              </button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>How to use AI rewrite</DialogTitle>
                <DialogDescription asChild>
                  <div className="space-y-3 pt-1 text-left text-sm text-gray-600">
                    <p>
                      Select the text you want to improve. When your selection is active, a
                      small floating bar appears near it.
                    </p>
                    <p className="flex flex-wrap items-center gap-2">
                      <span>Click the</span>
                      <span className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-xs font-medium text-gray-800">
                        <Sparkles className="size-3.5 text-[#0b57d0]" strokeWidth={2} aria-hidden />
                        sparkles
                      </span>
                      <span>icon on that bar to open AI rewrite.</span>
                    </p>
                  </div>
                </DialogDescription>
              </DialogHeader>
            </DialogContent>
          </Dialog>
        </div>
      ) : null}
    </div>
  );
}
