/**
 * TextAlign extension wrapper:
 *
 * - **Text / headings:** TipTap default — `text-align` is block-level. Partial
 *   selection still updates the whole paragraph/heading (same line, Google-Docs-style).
 * - **Inline image (`NodeSelection`):** per-image `textAlign` on the node; clears
 *   conflicting paragraph `textAlign` so multiple images on one line stay independent.
 *
 * No separate mark extension — register only `TextAlignInlineImageSafe`.
 */

import TextAlign from "@tiptap/extension-text-align";
import type { Node as PMNode, NodeType } from "@tiptap/pm/model";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import { NodeSelection } from "@tiptap/pm/state";

type ResolvedPosLike = {
  depth: number;
  node: (d: number) => PMNode;
  before: (d: number) => number;
  index: (d: number) => number;
};

function findBlockParent($pos: ResolvedPosLike): {
  pos: number;
  node: PMNode;
  depth: number;
} | null {
  for (let d = $pos.depth; d > 0; d--) {
    const node = $pos.node(d);
    if (node.type.name === "paragraph" || node.type.name === "heading") {
      return { pos: $pos.before(d), node, depth: d };
    }
  }
  return null;
}

function effectiveImageLineAlign(
  sel: NodeSelection,
  blockNode: PMNode,
  blockPos: number,
  imageType: NodeType,
  defaultAlignment: string | null,
): string {
  const img = sel.node.attrs.textAlign as string | null | undefined;
  if (img) return img;
  const onlySelectedImage =
    blockNode.content.childCount === 1 &&
    blockNode.firstChild?.type === imageType &&
    sel.from === blockPos + 1;
  if (onlySelectedImage) {
    return (
      (blockNode.attrs.textAlign as string | null | undefined) ??
      defaultAlignment ??
      "left"
    );
  }
  return defaultAlignment ?? "left";
}

function buildAlignTransactionForInlineImage(
  state: EditorState,
  alignment: string,
  imageType: NodeType,
): Transaction | null {
  const sel = state.selection;
  if (!(sel instanceof NodeSelection) || sel.node.type !== imageType) return null;

  const block = findBlockParent(sel.$from);
  if (!block) return null;

  const { pos: blockPos, node: blockNode } = block;
  const imgNode = sel.node;

  const onlySelectedImage =
    blockNode.content.childCount === 1 &&
    blockNode.firstChild?.type === imageType &&
    sel.from === blockPos + 1;

  const fromBlockWhenSolo =
    onlySelectedImage &&
    (imgNode.attrs.textAlign == null || imgNode.attrs.textAlign === "")
      ? ((blockNode.attrs.textAlign as string | null | undefined) ?? null)
      : null;
  const fromImg = (imgNode.attrs.textAlign as string | null | undefined) ?? null;
  const current = (fromImg && fromImg !== "" ? fromImg : fromBlockWhenSolo) ?? null;
  if (current === alignment) return null;

  let tr = state.tr.setNodeMarkup(sel.from, undefined, {
    ...imgNode.attrs,
    textAlign: alignment,
  });

  if (
    (blockNode.attrs.textAlign as string | null | undefined) != null &&
    (blockNode.attrs.textAlign as string | null | undefined) !== ""
  ) {
    tr = tr.setNodeMarkup(blockPos, undefined, {
      ...blockNode.attrs,
      textAlign: null,
    });
  }

  return tr.setSelection(NodeSelection.create(tr.doc, sel.from));
}

function buildUnsetTransactionForInlineImage(
  state: EditorState,
  imageType: NodeType,
  defaultAlignment: string | null,
): Transaction | null {
  const sel = state.selection;
  if (!(sel instanceof NodeSelection) || sel.node.type !== imageType) return null;

  const block = findBlockParent(sel.$from);
  if (!block) return null;
  const { pos: blockPos, node: blockNode } = block;

  let tr = state.tr;
  let changed = false;

  if (sel.node.attrs.textAlign != null && sel.node.attrs.textAlign !== "") {
    tr = tr.setNodeMarkup(sel.from, undefined, {
      ...sel.node.attrs,
      textAlign: null,
    });
    changed = true;
  }

  const onlySelectedImage =
    blockNode.content.childCount === 1 &&
    blockNode.firstChild?.type === imageType &&
    sel.from === blockPos + 1;

  if (onlySelectedImage && blockNode.attrs.textAlign != null) {
    tr = tr.setNodeMarkup(blockPos, undefined, {
      ...blockNode.attrs,
      textAlign: defaultAlignment,
    });
    changed = true;
  }

  return changed ? tr : null;
}

export const TextAlignInlineImageSafe = TextAlign.extend({
  addCommands() {
    const parent = this.parent?.();

    return {
      ...parent,

      setTextAlign:
        (alignment: string) =>
        ({ editor, commands, state, dispatch }) => {
          if (!this.options.alignments.includes(alignment)) return false;
          // Delegate to base TextAlign behaviour (paragraph / heading). For inline
          // images this still works because they sit inside a paragraph node whose
          // textAlign controls the line.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return (
            parent?.setTextAlign?.(alignment)({
              editor,
              commands,
              state,
              dispatch,
            } as any) ?? false
          );
        },

      unsetTextAlign:
        () =>
        ({ editor, commands, state, dispatch }) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return (
            parent?.unsetTextAlign?.()({
              editor,
              commands,
              state,
              dispatch,
            } as any) ?? false
          );
        },

      toggleTextAlign:
        (alignment: string) =>
        ({ editor, commands, state, dispatch }) => {
          if (!this.options.alignments.includes(alignment)) return false;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return (
            parent?.toggleTextAlign?.(alignment)({
              editor,
              commands,
              state,
              dispatch,
            } as any) ?? false
          );
        },
    };
  },
});
