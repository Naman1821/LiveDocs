import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

type HighlightRange = { from: number; to: number } | null;

const commentHoverHighlightKey = new PluginKey<DecorationSet>(
  "commentHoverHighlight",
);

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    commentHoverHighlight: {
      setCommentHoverRange: (from: number, to: number) => ReturnType;
      clearCommentHoverRange: () => ReturnType;
    };
  }
}

export const CommentHoverHighlight = Extension.create({
  name: "commentHoverHighlight",

  addCommands() {
    return {
      setCommentHoverRange:
        (from: number, to: number) =>
        ({ tr, dispatch }) => {
          if (!dispatch) return true;
          tr.setMeta(commentHoverHighlightKey, {
            from: Math.max(0, Math.min(from, to)),
            to: Math.max(0, Math.max(from, to)),
          } satisfies HighlightRange);
          dispatch(tr);
          return true;
        },
      clearCommentHoverRange:
        () =>
        ({ tr, dispatch }) => {
          if (!dispatch) return true;
          tr.setMeta(commentHoverHighlightKey, null);
          dispatch(tr);
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: commentHoverHighlightKey,
        state: {
          init: () => DecorationSet.empty,
          apply: (tr, old) => {
            const meta = tr.getMeta(commentHoverHighlightKey) as HighlightRange | undefined;
            if (meta === null) return DecorationSet.empty;
            if (meta && meta.to > meta.from) {
              return DecorationSet.create(tr.doc, [
                Decoration.inline(meta.from, meta.to, {
                  class: "comment-hover-highlight",
                }),
              ]);
            }
            if (tr.docChanged) return old.map(tr.mapping, tr.doc);
            return old;
          },
        },
        props: {
          decorations: (state) => commentHoverHighlightKey.getState(state) ?? null,
        },
      }),
    ];
  },
});

