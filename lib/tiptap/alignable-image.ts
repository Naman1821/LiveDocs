import TiptapImage from "@tiptap/extension-image";
import { Fragment } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";

const migrateTopLevelImagesKey = new PluginKey("migrateTopLevelImagesToParagraph");

/**
 * Extends the default Tiptap Image extension so that the `textAlign`
 * global-attribute (set by the TextAlign extension) is synced to the
 * ResizableNodeView's DOM container.  Without this, `setTextAlign`
 * updates the ProseMirror doc model but the NodeView never renders
 * the alignment because it bypasses `renderHTML`.
 *
 * Images default to **inline** so multiple images (and text) can share one
 * line when there is room; ResizableNodeView uses `inline-flex` for inline
 * nodes. A small plugin wraps legacy top-level block images in a paragraph
 * so collab / old Yjs shapes stay valid.
 */
export const AlignableImage = TiptapImage.extend({
  draggable: true,

  addOptions() {
    const p = this.parent?.();
    return {
      inline: true,
      allowBase64: p?.allowBase64 ?? false,
      HTMLAttributes: p?.HTMLAttributes ?? {},
      resize: p?.resize ?? false,
    };
  },

  addProseMirrorPlugins() {
    return [
      ...(this.parent?.() ?? []),
      new Plugin({
        key: migrateTopLevelImagesKey,
        appendTransaction(_transactions, _oldState, newState) {
          const image = newState.schema.nodes.image;
          const paragraph = newState.schema.nodes.paragraph;
          if (!image?.isInline || !paragraph) return null;

          let tr = newState.tr;
          let changed = false;

          while (true) {
            const d = tr.doc;
            let idx = -1;
            for (let i = d.childCount - 1; i >= 0; i--) {
              if (d.child(i).type === image) {
                idx = i;
                break;
              }
            }
            if (idx < 0) break;

            let pos = 1;
            for (let j = 0; j < idx; j++) {
              pos += d.child(j).nodeSize;
            }
            const child = d.child(idx);
            if (child.type !== image) break;

            const wrapped = paragraph.create(null, Fragment.from(child));
            tr = tr.replaceWith(pos, pos + child.nodeSize, wrapped);
            changed = true;
          }

          return changed ? tr : null;
        },
      }),
    ];
  },

  addAttributes() {
    return {
      ...this.parent?.(),
      /** Kept on the image node (not via TextAlign `types`) so align toolbar does not touch the parent paragraph. */
      textAlign: {
        default: null,
        parseHTML: (element) => {
          const alignment = (element as HTMLElement).style.textAlign;
          return ["left", "center", "right", "justify"].includes(alignment)
            ? alignment
            : null;
        },
        renderHTML: (attributes) => {
          if (!attributes.textAlign) {
            return {};
          }
          return { style: `text-align: ${attributes.textAlign}` };
        },
      },
    };
  },

  addNodeView() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parentFactory = (this as any).parent?.();
    if (!parentFactory) return null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (props: any) => {
      const nodeView = parentFactory(props);
      const dom = nodeView.dom as HTMLElement;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const applyAlign = (node: any) => {
        const align: string | null = node.attrs?.textAlign ?? null;
        // ResizableNodeView outer `dom` is `display: flex` or `inline-flex`; `text-align`
        // does not move flex children — alignment must use `justify-content`.
        if (align) {
          dom.style.textAlign = align;
          const jc =
            align === "left"
              ? "flex-start"
              : align === "center"
                ? "center"
                : align === "right"
                  ? "flex-end"
                  : align === "justify"
                    ? "space-between"
                    : "flex-start";
          dom.style.justifyContent = jc;
        } else {
          dom.style.removeProperty("text-align");
          dom.style.removeProperty("justify-content");
        }
      };

      applyAlign(props.node);

      const origUpdate = nodeView.update?.bind(nodeView);
      if (origUpdate) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        nodeView.update = (node: any, decorations: any, inner: any) => {
          const ok = origUpdate(node, decorations, inner);
          if (ok !== false) {
            applyAlign(node);
          }
          return ok;
        };
      }

      return nodeView;
    };
  },
});
