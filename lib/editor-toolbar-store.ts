import { create } from "zustand";
import type { Editor } from "@tiptap/react";

interface ToolbarState {
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
  syncFromEditor: (editor: Editor) => void;
}

export const useToolbarStore = create<ToolbarState>((set, get) => ({
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  highlight: false,
  bulletList: false,
  orderedList: false,
  taskList: false,
  link: false,
  superscript: false,
  subscript: false,
  heading: "p",
  fontFamily: "Inter",
  fontSize: "16px",
  lineHeight: "1.5",
  textAlign: "left",

  syncFromEditor: (editor: Editor) => {
    const heading = editor.isActive("heading", { level: 1 })
      ? "h1"
      : editor.isActive("heading", { level: 2 })
        ? "h2"
        : editor.isActive("heading", { level: 3 })
          ? "h3"
          : editor.isActive("heading", { level: 4 })
            ? "h4"
            : editor.isActive("heading", { level: 5 })
              ? "h5"
              : editor.isActive("heading", { level: 6 })
                ? "h6"
                : "p";

    const next = {
      bold: editor.isActive("bold"),
      italic: editor.isActive("italic"),
      underline: editor.isActive("underline"),
      strike: editor.isActive("strike"),
      highlight: editor.isActive("highlight"),
      bulletList: editor.isActive("bulletList"),
      orderedList: editor.isActive("orderedList"),
      taskList: editor.isActive("taskList"),
      link: editor.isActive("link"),
      superscript: editor.isActive("superscript"),
      subscript: editor.isActive("subscript"),
      heading: heading as ToolbarState["heading"],
      fontFamily:
        (editor.getAttributes("textStyle").fontFamily as string) ?? "Inter",
      fontSize:
        (editor.getAttributes("textStyle").fontSize as string) ?? "16px",
      lineHeight:
        (editor.getAttributes("paragraph").lineHeight as string) ??
        (editor.getAttributes("heading").lineHeight as string) ??
        "1.5",
      textAlign:
        (editor.getAttributes("image").textAlign as string) ??
        (editor.getAttributes("paragraph").textAlign as string) ??
        (editor.getAttributes("heading").textAlign as string) ??
        "left",
    };

    const s = get();
    if (
      s.bold === next.bold &&
      s.italic === next.italic &&
      s.underline === next.underline &&
      s.strike === next.strike &&
      s.highlight === next.highlight &&
      s.bulletList === next.bulletList &&
      s.orderedList === next.orderedList &&
      s.taskList === next.taskList &&
      s.link === next.link &&
      s.superscript === next.superscript &&
      s.subscript === next.subscript &&
      s.heading === next.heading &&
      s.fontFamily === next.fontFamily &&
      s.fontSize === next.fontSize &&
      s.lineHeight === next.lineHeight &&
      s.textAlign === next.textAlign
    ) {
      return;
    }

    set(next);
  },
}));
