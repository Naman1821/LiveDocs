declare global {
  interface Liveblocks {
    ThreadMetadata: {
      tabKey?: string;
      selectedText?: string;
    };
  }
}

export {};
