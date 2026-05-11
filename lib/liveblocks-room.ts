/**
 * One Liveblocks room (and Y.Doc) per document tab.
 * Must stay in sync with Convex `documentTabs.tabKey`.
 */
export function liveblocksRoomId(documentId: string, tabKey: string): string {
  return `${documentId}_${tabKey}`;
}
