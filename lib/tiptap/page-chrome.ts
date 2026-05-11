import { Extension } from "@tiptap/core";

export type PageChromeStorage = {
  marginLeftPx: number;
  marginRightPx: number;
};

declare module "@tiptap/core" {
  interface Storage {
    pageChrome: PageChromeStorage;
  }
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    pageChrome: {
      setPageMarginsPx: (left: number, right: number) => ReturnType;
    };
  }
}

/** Epic 3: page margin hints (ruler + editor chrome read storage). */
export const PageChrome = Extension.create({
  name: "pageChrome",

  addStorage() {
    return {
      marginLeftPx: 48,
      marginRightPx: 48,
    } satisfies PageChromeStorage;
  },

  addCommands() {
    return {
      setPageMarginsPx:
        (left: number, right: number) =>
        ({ editor }) => {
          const s = editor.storage.pageChrome as PageChromeStorage;
          s.marginLeftPx = Math.min(160, Math.max(0, Math.round(left)));
          s.marginRightPx = Math.min(160, Math.max(0, Math.round(right)));
          return true;
        },
    };
  },
});
