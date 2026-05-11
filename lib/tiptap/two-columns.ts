import { mergeAttributes, Node } from "@tiptap/core";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    twoColumns: {
      insertTwoColumnSection: () => ReturnType;
    };
  }
}

/** Epic 5: two-column layout block. */
export const TwoColumnSection = Node.create({
  name: "twoColumnSection",
  group: "block",
  content: "block+",
  defining: true,

  parseHTML() {
    return [{ tag: 'div[data-two-columns="true"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-two-columns": "true",
        style:
          "column-count:2;column-gap:28px;column-rule:1px solid #e5e7eb;padding:8px 0;",
      }),
      0,
    ];
  },

  addCommands() {
    return {
      insertTwoColumnSection:
        () =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            content: [{ type: "paragraph" }, { type: "paragraph" }],
          }),
    };
  },
});
