import { create } from "zustand";

export type EditorViewMode = "editing" | "viewing" | "suggesting";

export type UiStore = {
  isLeftSidebarOpen: boolean;
  isRightSidebarOpen: boolean;
  /** Matches `documentTabs.tabKey`; default aligns with Convex seed tab. */
  activeTabId: string;
  zoomLevel: number;
  activeCommentThread: string | null;
  isRulerVisible: boolean;
  shareDialogOpen: boolean;
  wordCountDialogOpen: boolean;
  tablePropertiesDialogOpen: boolean;
  editorViewMode: EditorViewMode;
  feedbackDialogOpen: boolean;

  setLeftSidebarOpen: (open: boolean) => void;
  setRightSidebarOpen: (open: boolean) => void;
  setActiveTabId: (tabId: string) => void;
  setZoomLevel: (level: number) => void;
  setActiveCommentThread: (threadId: string | null) => void;
  setRulerVisible: (visible: boolean) => void;
  setShareDialogOpen: (open: boolean) => void;
  setWordCountDialogOpen: (open: boolean) => void;
  setTablePropertiesDialogOpen: (open: boolean) => void;
  setEditorViewMode: (mode: EditorViewMode) => void;
  setFeedbackDialogOpen: (open: boolean) => void;
};

export const useUiStore = create<UiStore>((set) => ({
  isLeftSidebarOpen: true,
  isRightSidebarOpen: true,
  activeTabId: "main",
  zoomLevel: 100,
  activeCommentThread: null,
  isRulerVisible: true,
  shareDialogOpen: false,
  wordCountDialogOpen: false,
  tablePropertiesDialogOpen: false,
  editorViewMode: "editing",
  feedbackDialogOpen: false,

  setLeftSidebarOpen: (isLeftSidebarOpen) => set({ isLeftSidebarOpen }),
  setRightSidebarOpen: (isRightSidebarOpen) => set({ isRightSidebarOpen }),
  setActiveTabId: (activeTabId) => set({ activeTabId }),
  setZoomLevel: (zoomLevel) =>
    set({
      zoomLevel: Math.min(200, Math.max(25, Math.round(zoomLevel))),
    }),
  setActiveCommentThread: (activeCommentThread) => set({ activeCommentThread }),
  setRulerVisible: (isRulerVisible) => set({ isRulerVisible }),
  setShareDialogOpen: (shareDialogOpen) => set({ shareDialogOpen }),
  setWordCountDialogOpen: (wordCountDialogOpen) =>
    set({ wordCountDialogOpen }),
  setTablePropertiesDialogOpen: (tablePropertiesDialogOpen) =>
    set({ tablePropertiesDialogOpen }),
  setEditorViewMode: (editorViewMode) => set({ editorViewMode }),
  setFeedbackDialogOpen: (feedbackDialogOpen) => set({ feedbackDialogOpen }),
}));
