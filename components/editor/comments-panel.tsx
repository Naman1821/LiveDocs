"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CommentBody } from "@liveblocks/client";
import {
  useCreateComment,
  useCreateThread,
  useDeleteComment,
  useDeleteThread,
  useMarkThreadAsResolved,
  useMarkThreadAsUnresolved,
  useOthers,
  useSelf,
  useThreads,
  useUser,
} from "@liveblocks/react";

import { cn } from "@/lib/utils";

/** Per doc + room + user: threads hidden locally (Clear all / hide) survive refresh. */
function loadHiddenThreadIdsFromStorage(key: string | null): Record<string, true> {
  if (!key || typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const next: Record<string, true> = {};
    for (const [tid, val] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof tid !== "string" || tid.length === 0) continue;
      if (val === true || val === 1 || val === "1") next[tid] = true;
    }
    return next;
  } catch {
    return {};
  }
}

function saveHiddenThreadIdsToStorage(
  key: string | null,
  map: Record<string, true>,
) {
  if (!key || typeof window === "undefined") return;
  try {
    const entries = Object.entries(map).filter(([, v]) => v === true);
    const capped =
      entries.length > 400 ? entries.slice(entries.length - 400) : entries;
    localStorage.setItem(
      key,
      JSON.stringify(Object.fromEntries(capped.map(([id]) => [id, 1]))),
    );
  } catch {
    /* ignore quota / private mode */
  }
}

function labelFromEmailOrName(raw: string): string {
  const text = raw.trim();
  if (!text) return "";
  if (text.includes("@")) return text.split("@")[0]!.trim() || text;
  if (text.includes("|")) return "";
  if (text.startsWith("user_")) return "";
  if (text.includes("://") || text.includes("|")) return "";
  return text;
}

function plainBody(text: string): CommentBody {
  const trimmed = text.trim();
  return {
    version: 1,
    content: [
      {
        type: "paragraph",
        children: [{ text: trimmed.length ? trimmed : " " }],
      },
    ],
  };
}

function textFromCommentBody(body: CommentBody): string {
  const chunks: string[] = [];
  for (const block of body.content) {
    if (block.type !== "paragraph") continue;
    for (const ch of block.children) {
      if ("text" in ch && typeof ch.text === "string") chunks.push(ch.text);
    }
  }
  return chunks.join("").trim();
}

function commentCreatedAt(comment: unknown): number {
  if (typeof comment !== "object" || comment === null || !("createdAt" in comment)) return 0;
  const value = (comment as { createdAt?: unknown }).createdAt;
  if (typeof value === "number") return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string") {
    const ts = Date.parse(value);
    return Number.isNaN(ts) ? 0 : ts;
  }
  return 0;
}

export function formatCommentTime(ts: number): string {
  if (!ts) return "";
  return new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  })
    .format(new Date(ts))
    .toLowerCase();
}

function dayKey(ts: number): string {
  if (!ts) return "unknown";
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function daySeparatorLabel(ts: number): string {
  if (!ts) return "Earlier";
  const d = new Date(ts);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const thatDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((today.getTime() - thatDay.getTime()) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays > 1 && diffDays < 7) {
    return new Intl.DateTimeFormat("en-IN", { weekday: "long" }).format(d);
  }
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

function resolveAuthorLabel(args: {
  userId: string;
  livedUser: { name?: string; email?: string } | undefined;
  knownEmail: string | undefined;
  connectedLabel: string | undefined;
}): string {
  return (
    labelFromEmailOrName(args.connectedLabel ?? "") ||
    labelFromEmailOrName(args.knownEmail ?? "") ||
    labelFromEmailOrName(args.livedUser?.email ?? "") ||
    labelFromEmailOrName(args.livedUser?.name ?? "") ||
    "collaborator"
  );
}

/**
 * Renders the tombstone caption for a deleted comment. We resolve the
 * comment author's display label here (via `useUser`) so we can show
 * `Deleted by <emailPrefix>` even for offline / non-collaborator authors.
 *
 * Caption rules (in priority order):
 *   1. Owner moderation marker present → "Deleted by owner".
 *   2. Author was the doc owner          → "Deleted by owner".
 *   3. Otherwise                          → "Deleted by <emailPrefix>".
 */
function DeletedCaption({
  commentUserId,
  ownerUserId,
  ownerModerated,
  knownUserEmails,
  connectedUserLabels,
}: {
  commentUserId: string;
  ownerUserId: string;
  ownerModerated: boolean;
  knownUserEmails: Record<string, string>;
  connectedUserLabels: Record<string, string>;
}) {
  const { user, isLoading } = useUser(commentUserId);
  if (ownerModerated) return <>Deleted by owner</>;
  if (commentUserId === ownerUserId) return <>Deleted by owner</>;
  if (isLoading) return <>Deleted</>;
  const label = resolveAuthorLabel({
    userId: commentUserId,
    livedUser: (user ?? undefined) as { name?: string; email?: string } | undefined,
    knownEmail: knownUserEmails[commentUserId],
    connectedLabel: connectedUserLabels[commentUserId],
  });
  return <>Deleted by {label}</>;
}

function extractAnchorText(thread: { metadata?: unknown; comments: Array<unknown> }): string {
  const metadata = (thread.metadata ?? {}) as { selectedText?: unknown };
  if (typeof metadata.selectedText === "string" && metadata.selectedText.trim()) {
    return metadata.selectedText.trim();
  }
  const first = thread.comments[0] as { body?: CommentBody } | undefined;
  if (!first?.body) return "";
  const bodyText = textFromCommentBody(first.body);
  const match = /Regarding selected text:\s*"([^"]+)"/.exec(bodyText);
  return match?.[1]?.trim() ?? "";
}

function Author({
  userId,
  knownUserEmails,
  connectedUserLabels,
}: {
  userId: string;
  knownUserEmails: Record<string, string>;
  connectedUserLabels: Record<string, string>;
}) {
  const self = useSelf();
  const { user, isLoading } = useUser(userId);
  if (self?.id === userId) return <span className="font-medium">You</span>;
  if (isLoading) return <span className="text-gray-400">…</span>;
  const userInfo = (user ?? {}) as { name?: string; email?: string };
  const knownEmail = knownUserEmails[userId];
  const label =
    labelFromEmailOrName(connectedUserLabels[userId] ?? "") ||
    labelFromEmailOrName(knownEmail ?? "") ||
    labelFromEmailOrName(userInfo.email ?? "") ||
    labelFromEmailOrName(userInfo.name ?? "") ||
    "collaborator";
  return <span className="font-medium">{label}</span>;
}

export function DocumentCommentsPanel({
  tabKey,
  roomId,
  ownerUserId,
  knownUserEmails,
  moderatedCommentKeys,
  commentsTab,
  commentsTypeFilter,
  commentsTabsFilter,
  autoFocusComposerNonce = 0,
  selectedTextPrefill = "",
  /** Increment from parent to force-clear all local drafts (reliable vs effects re-filling). */
  draftResetKey = 0,
  /** Increment from parent to delete/hide every thread currently visible in this panel. */
  clearAllNonce = 0,
  /**
   * When parent switches `commentsTab` to "mine" in the same update as `clearAllNonce`, pass the
   * tab the user was clearing from (e.g. "foryou"); otherwise the effect would clear the wrong list.
   */
  clearAllScopeTab = null,
  /** When set, locally hidden thread ids are persisted across refresh (same doc + room + user). */
  hiddenThreadsStorageKey = null,
  onThreadAnchorHover,
  onThreadAnchorClick,
  onNotificationsChange,
}: {
  tabKey: string;
  /** Liveblocks room id; used by the owner-moderation server route to delete others' comments. */
  roomId: string;
  ownerUserId: string;
  knownUserEmails: Record<string, string>;
  /** Set of `${threadId}:${commentId}` pairs the owner has moderated server-side. */
  moderatedCommentKeys: Set<string>;
  commentsTab: "mine" | "foryou" | "all";
  commentsTypeFilter: string;
  commentsTabsFilter: string;
  autoFocusComposerNonce?: number;
  selectedTextPrefill?: string;
  draftResetKey?: number;
  clearAllNonce?: number;
  clearAllScopeTab?: "mine" | "foryou" | "all" | null;
  hiddenThreadsStorageKey?: string | null;
  onThreadAnchorHover?: (anchorText: string | null) => void;
  onThreadAnchorClick?: (anchorText: string) => void;
  onNotificationsChange?: (
    items: Array<{
      notificationId: string;
      threadId: string;
      threadTotalCommentCount: number;
      anchorText: string;
      targetText: string;
      message: string;
      createdAt: number;
    }>,
  ) => void;
}) {
  const self = useSelf();
  const others = useOthers();
  const createThread = useCreateThread();
  const createComment = useCreateComment();
  const deleteComment = useDeleteComment();
  const deleteThread = useDeleteThread();
  const markResolved = useMarkThreadAsResolved();
  const markUnresolved = useMarkThreadAsUnresolved();

  const [newThreadText, setNewThreadText] = useState("");
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [hiddenThreadIds, setHiddenThreadIds] = useState<Record<string, true>>({});
  const newThreadRef = useRef<HTMLTextAreaElement | null>(null);
  const lastDraftResetKeyRef = useRef(0);
  const lastClearAllNonceRef = useRef(0);
  const suppressPrefillOnceRef = useRef(false);
  const skipNextHiddenPersistRef = useRef(true);

  useLayoutEffect(() => {
    skipNextHiddenPersistRef.current = true;
    setHiddenThreadIds(loadHiddenThreadIdsFromStorage(hiddenThreadsStorageKey));
  }, [hiddenThreadsStorageKey]);

  useEffect(() => {
    if (skipNextHiddenPersistRef.current) {
      skipNextHiddenPersistRef.current = false;
      return;
    }
    saveHiddenThreadIdsToStorage(hiddenThreadsStorageKey, hiddenThreadIds);
  }, [hiddenThreadsStorageKey, hiddenThreadIds]);

  const connectedUserLabels = useMemo(() => {
    const map: Record<string, string> = {};
    const fill = (userId: string | null | undefined, info: unknown) => {
      if (!userId) return;
      const i = (info ?? {}) as { email?: string; name?: string };
      const label =
        labelFromEmailOrName(i.email ?? "") ||
        labelFromEmailOrName(i.name ?? "");
      if (label) map[userId] = label;
    };
    fill(self?.id, self?.info);
    for (const o of others) fill(o.id, o.info);
    return map;
  }, [others, self?.id, self?.info]);

  useEffect(() => {
    if (!autoFocusComposerNonce) return;
    const el = newThreadRef.current;
    if (!el) return;
    el.focus();
    const len = el.value.length;
    el.setSelectionRange(len, len);
  }, [autoFocusComposerNonce]);

  useEffect(() => {
    if (draftResetKey <= lastDraftResetKeyRef.current) return;
    lastDraftResetKeyRef.current = draftResetKey;
    suppressPrefillOnceRef.current = true;
    setNewThreadText("");
    setReplyDrafts({});
  }, [draftResetKey]);

  useEffect(() => {
    if (suppressPrefillOnceRef.current) {
      suppressPrefillOnceRef.current = false;
      return;
    }
    const snippet = selectedTextPrefill.trim();
    if (!snippet) return;
    setNewThreadText((prev) => {
      if (prev.trim()) return prev;
      return `Regarding selected text:\n"${snippet}"\n\n`;
    });
  }, [selectedTextPrefill]);

  const query = useMemo(() => {
    const q: {
      resolved?: boolean;
    } = {};
    if (commentsTypeFilter === "open") q.resolved = false;
    else if (commentsTypeFilter === "resolved") q.resolved = true;
    return q;
  }, [commentsTypeFilter]);

  const { isLoading, error, threads } = useThreads({ query });

  const scopedThreads = useMemo(() => {
    if (!threads) return [];
    return commentsTabsFilter !== "current"
      ? threads
      : threads.filter((t) => (t.metadata.tabKey ?? "main") === tabKey);
  }, [threads, commentsTabsFilter, tabKey]);

  const filteredThreads = useMemo(() => {
    const byTab = scopedThreads.filter((t) => {
      if (hiddenThreadIds[t.id]) return false;
      const visible = t.comments.filter((c) => !("deletedAt" in c));
      if (visible.length === 0) return false;
      const hasMine = visible.some((c) => c.userId === self?.id);
      if (commentsTab === "mine") return hasMine;
      if (commentsTab === "foryou") return (visible[0]?.userId ?? "") !== self?.id;
      return true;
    });
    return byTab;
  }, [scopedThreads, hiddenThreadIds, commentsTab, self?.id]);

  useEffect(() => {
    if (clearAllNonce <= lastClearAllNonceRef.current) return;
    lastClearAllNonceRef.current = clearAllNonce;
    const tabForClear = clearAllScopeTab ?? commentsTab;
    const threadsToClear = scopedThreads.filter((t) => {
      if (hiddenThreadIds[t.id]) return false;
      const visible = t.comments.filter((c) => !("deletedAt" in c));
      if (visible.length === 0) return false;
      const hasMine = visible.some((c) => c.userId === self?.id);
      if (tabForClear === "mine") return hasMine;
      if (tabForClear === "foryou") return (visible[0]?.userId ?? "") !== self?.id;
      return true;
    });
    const isOwnerViewer = self?.id === ownerUserId;
    const localHide: Record<string, true> = {};
    void (async () => {
      for (const t of threadsToClear) {
        const visible = t.comments.filter((c) => !("deletedAt" in c));
        const creatorId = visible[0]?.userId ?? "";
        const isCreator = !!creatorId && self?.id === creatorId;
        if (isCreator) {
          try {
            deleteThread(t.id);
            continue;
          } catch (e) {
            console.error(e);
            localHide[t.id] = true;
            continue;
          }
        }
        if (isOwnerViewer) {
          // Owner moderation: delete room-wide via the server (admin SDK).
          const ok = await moderateOnServer({ threadId: t.id });
          if (!ok) localHide[t.id] = true;
          continue;
        }
        // Non-owner non-creator: just hide locally (no server permission).
        localHide[t.id] = true;
      }
      if (Object.keys(localHide).length > 0) {
        setHiddenThreadIds((prev) => ({ ...prev, ...localHide }));
      }
    })();
  }, [
    clearAllNonce,
    clearAllScopeTab,
    commentsTab,
    scopedThreads,
    hiddenThreadIds,
    self?.id,
    ownerUserId,
    deleteThread,
    roomId,
  ]);

  useEffect(() => {
    if (!onNotificationsChange) return;
    const items = scopedThreads
      .map((t) => {
        if (hiddenThreadIds[t.id]) return null;
        const visible = t.comments.filter((c) => !("deletedAt" in c));
        const last = visible[visible.length - 1];
        if (!last) return null;
        if (last.userId === self?.id) return null;
        const author =
          connectedUserLabels[last.userId] ||
          labelFromEmailOrName(knownUserEmails[last.userId] ?? "") || last.userId.slice(0, 8);
        const action = visible.length <= 1 ? "commented" : "replied";
        const targetText =
          "body" in last && last.body ? textFromCommentBody(last.body as CommentBody) : "";
        return {
          notificationId: last.id,
          threadId: t.id,
          threadTotalCommentCount: visible.length,
          anchorText: extractAnchorText(t),
          targetText,
          message: `${author} ${action}`,
          createdAt: commentCreatedAt(last),
        };
      })
      .filter(
        (
          x,
        ): x is {
          notificationId: string;
          threadId: string;
          threadTotalCommentCount: number;
          anchorText: string;
          targetText: string;
          message: string;
          createdAt: number;
        } => !!x,
      );
    onNotificationsChange(items);
  }, [
    connectedUserLabels,
    hiddenThreadIds,
    knownUserEmails,
    onNotificationsChange,
    scopedThreads,
    self?.id,
  ]);

  const submitThread = () => {
    const body = plainBody(newThreadText);
    if (!textFromCommentBody(body)) return;
    createThread({
      body,
      metadata: {
        tabKey,
        selectedText: selectedTextPrefill.trim() || undefined,
      },
    });
    setNewThreadText("");
  };

  const submitReply = (threadId: string) => {
    const raw = replyDrafts[threadId] ?? "";
    const body = plainBody(raw);
    if (!textFromCommentBody(body)) return;
    createComment({ threadId, body });
    setReplyDrafts((prev) => ({ ...prev, [threadId]: "" }));
  };

  /**
   * Owner-only fallback: ask the server to delete via the Liveblocks admin
   * SDK so other clients also see the deletion (client SDK can't delete
   * someone else's comment). Returns true on success.
   */
  const moderateOnServer = async (args: {
    threadId: string;
    commentId?: string;
  }): Promise<boolean> => {
    try {
      const res = await fetch("/api/comments/moderate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId,
          threadId: args.threadId,
          commentId: args.commentId,
        }),
      });
      return res.ok;
    } catch (e) {
      console.error(e);
      return false;
    }
  };

  const removeThreadWithOwnerFallback = async (
    threadId: string,
    _comments: Array<{ id: string; userId: string }>,
    threadCreatorId: string,
  ) => {
    const isOwner = self?.id === ownerUserId;
    const isCreator = !!threadCreatorId && self?.id === threadCreatorId;
    try {
      if (isCreator) {
        await deleteThread(threadId);
        return;
      }
      if (isOwner) {
        const ok = await moderateOnServer({ threadId });
        if (!ok) {
          setHiddenThreadIds((prev) => ({ ...prev, [threadId]: true }));
          window.alert(
            "Server delete failed; this thread was hidden from your view only.",
          );
        }
        return;
      }
    } catch (e) {
      console.error(e);
      window.alert("Could not delete this thread.");
    }
  };

  return (
    <div className="isolate flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
        {isLoading && (
          <p className="text-center text-sm text-gray-500">Loading comments…</p>
        )}
        {error && (
          <p className="text-center text-sm text-red-600">
            Could not load comments.
          </p>
        )}
        {!isLoading && !error && filteredThreads.length === 0 && (
          <p className="text-center text-sm text-gray-500">
            No comments yet. Start a thread below.
          </p>
        )}
        {!isLoading &&
          !error &&
          filteredThreads.map((thread) => {
            const allComments = thread.comments;
            const visible = allComments.filter((c) => !("deletedAt" in c));
            const anchorText = extractAnchorText(thread);
            const threadCreatorId = visible[0]?.userId ?? "";
            const canDeleteThread =
              self?.id === ownerUserId || (threadCreatorId && self?.id === threadCreatorId);
            return (
              <div
                key={thread.id}
                className={cn(
                  "rounded-lg border border-gray-200 bg-gray-50/80 p-3",
                  thread.resolved && "opacity-70",
                )}
                onMouseEnter={() => onThreadAnchorHover?.(anchorText || null)}
                onMouseLeave={() => onThreadAnchorHover?.(null)}
                onClick={(e) => {
                  const target = e.target as HTMLElement;
                  if (target.closest("button,textarea,input,select,a")) return;
                  if (!anchorText) return;
                  onThreadAnchorClick?.(anchorText);
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs text-gray-500">
                    {thread.resolved ? "Resolved" : "Open"}
                  </span>
                  <div className="flex gap-1">
                    {canDeleteThread ? (
                      <button
                        type="button"
                        className="text-xs font-medium text-red-600 hover:underline"
                        onClick={() => {
                          const ok = window.confirm("Delete this comment thread?");
                          if (!ok) return;
                          const commentsForDelete = allComments.map((c) => ({
                            id: c.id,
                            userId: c.userId,
                          }));
                          void removeThreadWithOwnerFallback(
                            thread.id,
                            commentsForDelete,
                            threadCreatorId,
                          );
                        }}
                      >
                        Delete
                      </button>
                    ) : null}
                    {thread.resolved ? (
                      <button
                        type="button"
                        className="text-xs font-medium text-blue-600 hover:underline"
                        onClick={() => markUnresolved(thread.id)}
                      >
                        Reopen
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="text-xs font-medium text-blue-600 hover:underline"
                        onClick={() => markResolved(thread.id)}
                      >
                        Resolve
                      </button>
                    )}
                  </div>
                </div>
                <ul className="mt-2 space-y-2">
                  {allComments.map((c, index) => {
                    const mine = self?.id === c.userId;
                    const canDeleteComment = mine || self?.id === ownerUserId;
                    const deleted = "deletedAt" in c;
                    const body = "body" in c ? c.body : undefined;
                    const createdAt = commentCreatedAt(c);
                    const timeLabel = formatCommentTime(createdAt);
                    const prev = index > 0 ? allComments[index - 1] : null;
                    const showDaySeparator =
                      index === 0 || dayKey(commentCreatedAt(prev)) !== dayKey(createdAt);
                    return (
                      <div key={c.id} className="space-y-2">
                        {showDaySeparator ? (
                          <div className="flex justify-center">
                            <span className="rounded-full border border-gray-200 bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                              {daySeparatorLabel(createdAt)}
                            </span>
                          </div>
                        ) : null}
                        <li
                          className={cn("flex text-base", mine ? "justify-end" : "justify-start")}
                        >
                          <div
                            className={cn(
                              "max-w-[92%] rounded-2xl px-4 py-3",
                              mine
                                ? "bg-[#d3e3fd] text-[#0b57d0]"
                                : "bg-white border border-gray-200 text-[#1F1F1F]",
                            )}
                          >
                            <div
                              className={cn(
                                "text-sm",
                                mine ? "text-[#0b57d0]/80" : "text-gray-500",
                              )}
                            >
                              <Author
                                userId={c.userId}
                                knownUserEmails={knownUserEmails}
                                connectedUserLabels={connectedUserLabels}
                              />
                              {self?.id === c.userId ? null : (
                                <span className="ml-1 font-normal text-gray-400">
                                  · {c.userId === ownerUserId ? "owner" : "collaborator"}
                                </span>
                              )}
                              {canDeleteComment && !deleted ? (
                                <button
                                  type="button"
                                  className="ml-2 text-xs font-medium text-red-600 hover:underline"
                                  onClick={async () => {
                                    const ok = window.confirm("Delete this reply?");
                                    if (!ok) return;
                                    const isOwner = self?.id === ownerUserId;
                                    const isAuthor = self?.id === c.userId;
                                    if (isAuthor) {
                                      void deleteComment({ threadId: thread.id, commentId: c.id });
                                      return;
                                    }
                                    if (isOwner) {
                                      const okServer = await moderateOnServer({
                                        threadId: thread.id,
                                        commentId: c.id,
                                      });
                                      if (!okServer) {
                                        setHiddenThreadIds((prev) => ({
                                          ...prev,
                                          [thread.id]: true,
                                        }));
                                        window.alert(
                                          "Server delete failed; comment hidden from your view only.",
                                        );
                                      }
                                    }
                                  }}
                                >
                                  Delete
                                </button>
                              ) : null}
                            </div>
                            <p
                              className={cn(
                                "mt-1 whitespace-pre-wrap text-base leading-relaxed",
                                deleted
                                  ? "italic text-gray-500"
                                  : mine
                                    ? "text-[#0b57d0]"
                                    : "text-[#1F1F1F]",
                              )}
                            >
                              {deleted ? (
                                <DeletedCaption
                                  commentUserId={c.userId}
                                  ownerUserId={ownerUserId}
                                  ownerModerated={moderatedCommentKeys.has(
                                    `${thread.id}:${c.id}`,
                                  )}
                                  knownUserEmails={knownUserEmails}
                                  connectedUserLabels={connectedUserLabels}
                                />
                              ) : body ? (
                                textFromCommentBody(body)
                              ) : (
                                ""
                              )}
                            </p>
                            {timeLabel ? (
                              <div
                                className={cn(
                                  "mt-1 text-right text-[11px]",
                                  mine ? "text-[#0b57d0]/70" : "text-gray-400",
                                )}
                              >
                                {timeLabel}
                              </div>
                            ) : null}
                          </div>
                        </li>
                      </div>
                    );
                  })}
                </ul>
                <div className="mt-3 flex flex-col gap-2 border-t border-gray-200 pt-3">
                  <textarea
                    className="min-h-[72px] w-full resize-y rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    placeholder="Reply…"
                    value={replyDrafts[thread.id] ?? ""}
                    spellCheck={false}
                    autoCorrect="off"
                    autoCapitalize="off"
                    autoComplete="off"
                    data-gramm="false"
                    data-gramm_editor="false"
                    data-enable-grammarly="false"
                    onChange={(e) =>
                      setReplyDrafts((prev) => ({
                        ...prev,
                        [thread.id]: e.target.value,
                      }))
                    }
                  />
                  <button
                    type="button"
                    className="self-end rounded-full bg-[#0B57D0] px-4 py-1.5 text-sm font-medium text-white hover:bg-[#0842a0] disabled:opacity-40"
                    disabled={!(replyDrafts[thread.id]?.trim())}
                    onClick={() => submitReply(thread.id)}
                  >
                    Reply
                  </button>
                </div>
              </div>
            );
          })}
      </div>

      <div className="relative z-10 mt-0 shrink-0 border-t border-gray-200 bg-white px-4 pt-4">
        <textarea
          ref={newThreadRef}
          className="min-h-[88px] w-full resize-y rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
          placeholder="New comment thread…"
          value={newThreadText}
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          autoComplete="off"
          data-gramm="false"
          data-gramm_editor="false"
          data-enable-grammarly="false"
          onChange={(e) => setNewThreadText(e.target.value)}
        />
        <button
          type="button"
          className="mt-2 w-full rounded-full bg-[#0B57D0] py-2 text-sm font-medium text-white hover:bg-[#0842a0] disabled:bg-gray-200 disabled:text-gray-400"
          disabled={!newThreadText.trim()}
          onClick={submitThread}
        >
          Add comment
        </button>
      </div>
    </div>
  );
}
