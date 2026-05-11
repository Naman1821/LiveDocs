import { Extension } from "@tiptap/core";
import type { EditorState, Transaction } from "@tiptap/pm/state";

export const MAX_BLOCK_INDENT = 10;
export const BLOCK_INDENT_STEP_PX = 36;

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    blockIndent: {
      indentBlock: () => ReturnType;
      outdentBlock: () => ReturnType;
      setBlockIndentLevel: (level: number) => ReturnType;
      setBlockRightIndentLevel: (level: number) => ReturnType;
    };
  }
}

function patchBlockIndent(
  state: EditorState,
  dispatch: ((tr: Transaction) => void) | undefined,
  delta: number,
): boolean {
  const { selection } = state;
  const { $from } = selection;

  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth);
    if (node.type.name !== "paragraph" && node.type.name !== "heading") continue;
    const pos = $from.before(depth);
    const current = Number(node.attrs.blockIndent ?? 0);
    const next = Math.min(MAX_BLOCK_INDENT, Math.max(0, current + delta));
    if (next === current) return false;
    if (dispatch) {
      dispatch(
        state.tr.setNodeMarkup(pos, undefined, {
          ...node.attrs,
          blockIndent: next,
        }),
      );
    }
    return true;
  }
  return false;
}

function setBlockIndentLevelAtSelection(
  state: EditorState,
  dispatch: ((tr: Transaction) => void) | undefined,
  level: number,
): boolean {
  const { selection } = state;
  const { $from } = selection;
  const target = Math.min(MAX_BLOCK_INDENT, Math.max(0, Math.round(level)));

  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth);
    if (node.type.name !== "paragraph" && node.type.name !== "heading") continue;
    const pos = $from.before(depth);
    const current = Number(node.attrs.blockIndent ?? 0);
    if (current === target) return false;
    if (dispatch) {
      dispatch(
        state.tr.setNodeMarkup(pos, undefined, {
          ...node.attrs,
          blockIndent: target,
        }),
      );
    }
    return true;
  }
  return false;
}

function setBlockRightIndentLevelAtSelection(
  state: EditorState,
  dispatch: ((tr: Transaction) => void) | undefined,
  level: number,
): boolean {
  const { selection } = state;
  const { $from } = selection;
  const target = Math.min(MAX_BLOCK_INDENT, Math.max(0, Math.round(level)));

  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth);
    if (node.type.name !== "paragraph" && node.type.name !== "heading") continue;
    const pos = $from.before(depth);
    const current = Number(node.attrs.blockRightIndent ?? 0);
    if (current === target) return false;
    if (dispatch) {
      dispatch(
        state.tr.setNodeMarkup(pos, undefined, {
          ...node.attrs,
          blockRightIndent: target,
        }),
      );
    }
    return true;
  }
  return false;
}

export const BlockIndent = Extension.create({
  name: "blockIndent",

  addGlobalAttributes() {
    return [
      {
        types: ["paragraph", "heading"],
        attributes: {
          blockIndent: {
            default: 0,
            parseHTML: (element) => {
              const raw = element.getAttribute("data-block-indent");
              if (raw !== null) {
                const n = Number.parseInt(raw, 10);
                return Number.isFinite(n)
                  ? Math.min(MAX_BLOCK_INDENT, Math.max(0, n))
                  : 0;
              }
              const pl = element.style.paddingLeft;
              if (pl?.endsWith("px")) {
                const px = Number.parseFloat(pl);
                if (Number.isFinite(px)) {
                  return Math.min(MAX_BLOCK_INDENT, Math.max(0, Math.round(px / BLOCK_INDENT_STEP_PX)));
                }
              }
              const ml = element.style.marginLeft;
              if (ml?.endsWith("px")) {
                const px = Number.parseFloat(ml);
                if (Number.isFinite(px)) {
                  return Math.min(MAX_BLOCK_INDENT, Math.max(0, Math.round(px / BLOCK_INDENT_STEP_PX)));
                }
              }
              return 0;
            },
            renderHTML: () => ({}),
          },
          blockRightIndent: {
            default: 0,
            parseHTML: (element) => {
              const raw = element.getAttribute("data-block-right-indent");
              if (raw !== null) {
                const n = Number.parseInt(raw, 10);
                return Number.isFinite(n)
                  ? Math.min(MAX_BLOCK_INDENT, Math.max(0, n))
                  : 0;
              }
              const pr = element.style.paddingRight;
              if (pr?.endsWith("px")) {
                const px = Number.parseFloat(pr);
                if (Number.isFinite(px)) {
                  return Math.min(MAX_BLOCK_INDENT, Math.max(0, Math.round(px / BLOCK_INDENT_STEP_PX)));
                }
              }
              const mr = element.style.marginRight;
              if (mr?.endsWith("px")) {
                const px = Number.parseFloat(mr);
                if (Number.isFinite(px)) {
                  return Math.min(MAX_BLOCK_INDENT, Math.max(0, Math.round(px / BLOCK_INDENT_STEP_PX)));
                }
              }
              return 0;
            },
            renderHTML: () => ({}),
          },
          style: {
            renderHTML: (attributes) => {
              const left = Number(attributes.blockIndent ?? 0);
              const right = Number(attributes.blockRightIndent ?? 0);
              const styles: string[] = [];
              if (left > 0) styles.push(`padding-left: ${left * BLOCK_INDENT_STEP_PX}px`);
              if (right > 0) styles.push(`padding-right: ${right * BLOCK_INDENT_STEP_PX}px`);
              if (styles.length === 0) return {};
              return {
                style: styles.join("; "),
                "data-block-indent": String(left),
                "data-block-right-indent": String(right),
              };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      indentBlock:
        () =>
        ({ state, dispatch }) =>
          patchBlockIndent(state, dispatch, 1),
      outdentBlock:
        () =>
        ({ state, dispatch }) =>
          patchBlockIndent(state, dispatch, -1),
      setBlockIndentLevel:
        (level: number) =>
        ({ state, dispatch }) =>
          setBlockIndentLevelAtSelection(state, dispatch, level),
      setBlockRightIndentLevel:
        (level: number) =>
        ({ state, dispatch }) =>
          setBlockRightIndentLevelAtSelection(state, dispatch, level),
    };
  },
});
