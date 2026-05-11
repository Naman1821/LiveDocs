"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Editor } from "@tiptap/react";

const EditorContext = createContext<Editor | null>(null);

export function EditorProvider({
  editor,
  children,
}: {
  editor: Editor | null;
  children: ReactNode;
}) {
  return (
    <EditorContext.Provider value={editor}>{children}</EditorContext.Provider>
  );
}

export function useOptionalEditor(): Editor | null {
  return useContext(EditorContext);
}

export function useEditorInstance(): Editor {
  const editor = useContext(EditorContext);
  if (!editor) {
    throw new Error("Editor not available");
  }
  return editor;
}
