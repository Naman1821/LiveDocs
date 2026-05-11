import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

type AutoPaginationOptions = {
  pageHeightPx: number;
  zoomRootSelector: string;
  debugLogs: boolean;
};

export const AutoPagination = Extension.create<AutoPaginationOptions>({
  name: "autoPagination",

  addOptions() {
    return {
      pageHeightPx: 931,
      zoomRootSelector: ".editor-zoom-root",
      debugLogs: false,
    };
  },

  addProseMirrorPlugins() {
    const paginationKey = new PluginKey<DecorationSet>("autoPagination");
    const { pageHeightPx, zoomRootSelector, debugLogs } = this.options;

    return [
      new Plugin<DecorationSet>({
        key: paginationKey,
        state: {
          init: () => DecorationSet.empty,
          apply: (tr, oldState) => {
            const meta = tr.getMeta(paginationKey);
            if (meta instanceof DecorationSet) {
              return meta;
            }
            return oldState.map(tr.mapping, tr.doc);
          },
        },
        props: {
          decorations: (state) => paginationKey.getState(state) ?? null,
        },
        view: (view) => {
          let rafId: number | null = null;
          let debounceTimer: ReturnType<typeof setTimeout> | null = null;
          let resizeHandler: (() => void) | null = null;
          let initialRafId: number | null = null;
          let zoomTransitionHandler: ((e: TransitionEvent) => void) | null = null;
          let zoomRoot: HTMLElement | null = null;

          const measureAndDecorate = () => {
            if ((view as unknown as { isDestroyed?: boolean }).isDestroyed) return;
            if (!view.dom.isConnected) return;

            // Wait for unloaded images before measuring
            const unloadedImages = (
              Array.from(view.dom.querySelectorAll("img")) as HTMLImageElement[]
            ).filter((img) => !img.complete);

            if (unloadedImages.length > 0) {
              Promise.all(
                unloadedImages.map(
                  (img) =>
                    new Promise<void>((resolve) => {
                      img.addEventListener("load", () => resolve(), { once: true });
                      img.addEventListener("error", () => resolve(), { once: true });
                      setTimeout(resolve, 3000);
                    }),
                ),
              ).then(() => scheduleMeasure());
              return;
            }

            const decos: Decoration[] = [];
            let runningHeight = 0;
            view.state.doc.forEach((node, offset) => {
              // Manual page break resets the counter
              if (node.type.name === "pageBreak") {
                runningHeight = 0;
                return;
              }

              // FIX: use `offset` directly, not `offset + 1`
              // nodeDOM expects the position of the node itself (outside position)
              const domNode = view.nodeDOM(offset);
              if (!(domNode instanceof HTMLElement)) return;

              const style = window.getComputedStyle(domNode);
              const marginTop = Number.parseFloat(style.marginTop) || 0;
              const marginBottom = Number.parseFloat(style.marginBottom) || 0;

              // rect.height includes padding+border. Add margins separately.
              const rect = domNode.getBoundingClientRect();
              const h = Math.max(1, Math.ceil(rect.height + marginTop + marginBottom));

              if (debugLogs) {
                console.log(
                  `[AutoPagination] node="${node.type.name}" h=${h} running=${runningHeight} limit=${pageHeightPx}`,
                );
              }

              // If this block overflows the current page, insert soft break BEFORE it
              if (runningHeight > 0 && runningHeight + h > pageHeightPx) {
                decos.push(
                  Decoration.widget(
                    offset, // position = start of this node
                    () => {
                      const div = document.createElement("div");
                      div.className = "soft-page-break";
                      return div;
                    },
                    { side: -1 }, // render before the node
                  ),
                );
                // New page starts with just this block's height
                runningHeight = h;
              } else {
                runningHeight += h;
              }
            });

            const decoSet = DecorationSet.create(view.state.doc, decos);
            view.dispatch(view.state.tr.setMeta(paginationKey, decoSet));
          };

          const scheduleMeasure = () => {
            if (rafId != null) cancelAnimationFrame(rafId);
            if (debounceTimer != null) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
              debounceTimer = null;
              rafId = requestAnimationFrame(() => {
                rafId = null;
                measureAndDecorate();
              });
            }, 120);
          };

          // Two rAF delay on init so layout is fully settled
          initialRafId = requestAnimationFrame(() => {
            initialRafId = requestAnimationFrame(() => {
              initialRafId = null;
              scheduleMeasure();
            });
          });

          resizeHandler = () => scheduleMeasure();
          window.addEventListener("resize", resizeHandler);

          zoomRoot = view.dom.closest(zoomRootSelector) as HTMLElement | null;
          if (zoomRoot) {
            zoomTransitionHandler = (e: TransitionEvent) => {
              if (e.propertyName === "transform") scheduleMeasure();
            };
            zoomRoot.addEventListener("transitionend", zoomTransitionHandler);
          }

          return {
            update: (updatedView, prevState) => {
              if (prevState.doc.eq(updatedView.state.doc)) return;
              scheduleMeasure();
            },
            destroy: () => {
              if (rafId != null) cancelAnimationFrame(rafId);
              if (debounceTimer != null) clearTimeout(debounceTimer);
              if (initialRafId != null) cancelAnimationFrame(initialRafId);
              if (resizeHandler) {
                window.removeEventListener("resize", resizeHandler);
                resizeHandler = null;
              }
              if (zoomRoot && zoomTransitionHandler) {
                zoomRoot.removeEventListener("transitionend", zoomTransitionHandler);
                zoomTransitionHandler = null;
                zoomRoot = null;
              }
            },
          };
        },
      }),
    ];
  },
});
