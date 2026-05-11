"use client";

import type { ReactNode, RefObject } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { useClerk, useUser } from "@clerk/nextjs";
import { useOthers, useSelf, useStatus } from "@liveblocks/react";
import {
  Ban,
  Bell,
  Check,
  Cloud,
  Crown,
  Globe,
  Loader2,
  Lock,
  MessageSquare,
  Star,
  Users,
} from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AiLedMarquee } from "@/components/editor/ai-led-marquee";
import { DocsEditorMenubar } from "@/components/editor/docs-editor-menubar";
import { ShareDocumentModal } from "@/components/editor/share-document-modal";
import { useUiStore } from "@/lib/store/use-ui-store";
import { cn } from "@/lib/utils";

const TITLE_AUTOSAVE_MS = 650;

function LiveblocksConnectionBadge() {
  const status = useStatus();
  const label =
    status === "connected"
      ? "Live"
      : status === "disconnected"
        ? "Offline"
        : "Connecting…";
  const cls =
    status === "connected"
      ? "bg-emerald-100 text-emerald-800"
      : status === "disconnected"
        ? "bg-zinc-200 text-zinc-700"
        : "bg-amber-100 text-amber-900";
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
        cls,
      )}
    >
      {label}
    </span>
  );
}

function userInitials(fullName: string | null, email: string | undefined) {
  const n = fullName?.trim();
  if (n) {
    const parts = n.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (
        parts[0]!.slice(0, 1) + parts[parts.length - 1]!.slice(0, 1)
      ).toUpperCase();
    }
    return n.slice(0, 2).toUpperCase();
  }
  if (email) return email.slice(0, 2).toUpperCase();
  return "?";
}

function displayUserLabel(rawEmail: string, rawName: string, rawUserId: string): string {
  const email = rawEmail.trim().toLowerCase();
  if (email.includes("@")) {
    const local = email.split("@")[0]?.trim();
    if (local) return local;
  }

  const name = rawName.trim();
  if (name.includes("@")) {
    const local = name.split("@")[0]?.trim();
    if (local) return local;
  }

  // Ignore machine-like IDs/names (e.g. user_3DRUNwdEbVYPkOa).
  const machineLike = /^[a-z0-9_-]{10,}$/i;
  if (
    name &&
    !name.includes("://") &&
    !name.includes("|") &&
    !name.startsWith("user_") &&
    !machineLike.test(name)
  ) {
    return name;
  }

  const idTail = (rawUserId.trim().split("|").pop() ?? "").trim();
  if (idTail.startsWith("user_")) {
    const candidate = idTail.slice(5).trim();
    if (candidate && !machineLike.test(candidate)) return candidate;
  }

  return "collaborator";
}

export function DocumentEditorHeader({
  document,
  titleInputRef,
  saveStatus = "idle",
  accessRole,
  commentUnreadCount = 0,
  aiMarqueeText = null,
  aiMarqueeVariant = "default",
  byokApiKeySlot = null,
}: {
  document: Doc<"documents">;
  titleInputRef: RefObject<HTMLInputElement | null>;
  saveStatus?: "idle" | "saving" | "saved" | "error";
  accessRole: "owner" | "editor" | "viewer";
  /** Liveblocks “for you” thread alerts while comments drawer may be closed. */
  commentUnreadCount?: number;
  /** Center header ticker (e.g. Namaste + AI hint). Hidden when null/empty or on very small screens. */
  aiMarqueeText?: string | null;
  /** Narrower + faster ticker when AI is disabled site-wide. */
  aiMarqueeVariant?: "default" | "aiOff";
  /** BYOK “API key” control — rendered in the title row so it does not overlap the menubar. */
  byokApiKeySlot?: ReactNode;
}) {
  const { user } = useUser();
  const { signOut } = useClerk();
  const updateDocument = useMutation(api.documents.updateDocument);
  const toggleFavorite = useMutation(api.documents.toggleFavorite);
  const respondToAccessRequest = useMutation(api.documents.respondToAccessRequest);
  const grantLinkUnblockRequest = useMutation(api.documents.grantLinkUnblockRequest);
  const setCollaboratorRole = useMutation(api.documents.setCollaboratorRole);
  const removeCollaborator = useMutation(api.documents.removeCollaborator);
  const setDocumentVisibility = useMutation(api.documents.setDocumentVisibility);
  const blockPublicVisitor = useMutation(api.documents.blockPublicVisitor);
  const unblockPublicVisitor = useMutation(api.documents.unblockPublicVisitor);
  const clearJoinNotifications = useMutation(api.documents.clearJoinNotifications);
  const pendingRequests = useQuery(
    api.documents.listPendingAccessRequests,
    accessRole === "owner" ? { id: document._id } : "skip",
  );
  const ownerSidecar = useQuery(
    api.documents.getDocumentOwnerSidecar,
    accessRole === "owner" ? { id: document._id } : "skip",
  );
  const others = useOthers();
  const self = useSelf();
  const normalizeUserId = (id: string | null | undefined) =>
    ((id ?? "").split("|").pop() ?? "").toLowerCase();
  const sameUserKey = (a: string, b: string) => {
    const ka = normalizeUserId(a);
    const kb = normalizeUserId(b);
    return ka.length > 0 && ka === kb;
  };
  const onlinePeopleMap = new Map<
    string,
    {
      userId: string;
      email: string;
      name: string;
    }
  >();
  const addOnline = (userId: string | null | undefined, info: unknown) => {
    if (!userId) return;
    const i = (info ?? {}) as { email?: string; name?: string };
    const email = i.email?.trim() || "";
    const name = i.name?.trim() || "";
    const existing = onlinePeopleMap.get(userId);
    if (!existing) {
      onlinePeopleMap.set(userId, { userId, email, name });
      return;
    }
    if (!existing.email && email) existing.email = email;
    if (!existing.name && name) existing.name = name;
  };
  addOnline(self?.id, self?.info);
  for (const o of others) addOnline(o.id, o.info);
  const onlineByNormalizedId = new Map<string, { userId: string; email: string; name: string }>();
  for (const p of onlinePeopleMap.values()) {
    const key = normalizeUserId(p.userId);
    if (key) onlineByNormalizedId.set(key, p);
  }
  const connectedCount = onlinePeopleMap.size;
  const docVisibility = document.visibility === "public" ? "public" : "private";
  const accessPeople = useMemo(() => {
    const byId = new Map<
      string,
      { userId: string; email: string; name: string; role: "owner" | "editor" | "viewer" }
    >();
    const ownerOnline =
      onlinePeopleMap.get(document.ownerId) ??
      onlineByNormalizedId.get(normalizeUserId(document.ownerId));
    byId.set(document.ownerId, {
      userId: document.ownerId,
      email:
        (user?.id === document.ownerId ? user?.primaryEmailAddress?.emailAddress : undefined) ??
        ownerOnline?.email ??
        "",
      name:
        (user?.id === document.ownerId ? user?.fullName : undefined) ??
        ownerOnline?.name ??
        "Owner",
      role: "owner",
    });
    for (const c of document.collaborators ?? []) {
      const online = onlinePeopleMap.get(c.userId);
      byId.set(c.userId, {
        userId: c.userId,
        email: c.email || online?.email || "",
        name: c.displayName || online?.name || "",
        role: c.role,
      });
    }
    if (document.visibility === "public") {
      const occupiedNorm = new Set<string>();
      for (const id of byId.keys()) {
        const n = normalizeUserId(id);
        if (n) occupiedNorm.add(n);
      }
      for (const p of onlinePeopleMap.values()) {
        if (byId.has(p.userId)) continue;
        const n = normalizeUserId(p.userId);
        if (n && occupiedNorm.has(n)) continue;
        byId.set(p.userId, {
          userId: p.userId,
          email: p.email,
          name: p.name,
          role: "viewer",
        });
        if (n) occupiedNorm.add(n);
      }
    }
    return [...byId.values()];
  }, [
    document.collaborators,
    document.ownerId,
    document.visibility,
    onlineByNormalizedId,
    onlinePeopleMap,
    user?.fullName,
    user?.id,
    user?.primaryEmailAddress?.emailAddress,
  ]);
  const collaboratorRoleMap = useMemo(() => {
    const map = new Map<string, "editor" | "viewer">();
    for (const c of document.collaborators ?? []) {
      map.set(c.userId, c.role);
    }
    return map;
  }, [document.collaborators]);
  const isRightSidebarOpen = useUiStore((s) => s.isRightSidebarOpen);
  const setRightSidebarOpen = useUiStore((s) => s.setRightSidebarOpen);
  const shareDialogOpen = useUiStore((s) => s.shareDialogOpen);
  const setShareDialogOpen = useUiStore((s) => s.setShareDialogOpen);
  const [titleDraft, setTitleDraft] = useState(() =>
    document.title?.trim() ? document.title : "Untitled document",
  );
  const titleDraftRef = useRef(
    document.title?.trim() ? document.title : "Untitled document",
  );
  const titleDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const shareUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/documents/${document._id}`;
  const liveStatus = useStatus();

  useEffect(() => {
    const next = document.title?.trim()
      ? document.title
      : "Untitled document";
    titleDraftRef.current = next;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync input when Convex title changes
    setTitleDraft(next);
  }, [document.title]);

  const persistTitle = useCallback(
    async (raw: string) => {
      const t = raw.trim();
      const normalized = t.length === 0 ? "Untitled document" : t;
      if (normalized === document.title) return;
      await updateDocument({ id: document._id, title: normalized });
    },
    [document.title, document._id, updateDocument],
  );

  const scheduleTitlePersist = useCallback(() => {
    if (titleDebounceRef.current) clearTimeout(titleDebounceRef.current);
    titleDebounceRef.current = setTimeout(() => {
      titleDebounceRef.current = null;
      void persistTitle(titleDraftRef.current);
    }, TITLE_AUTOSAVE_MS);
  }, [persistTitle]);

  const flushTitlePersist = useCallback(() => {
    if (titleDebounceRef.current) {
      clearTimeout(titleDebounceRef.current);
      titleDebounceRef.current = null;
    }
    void persistTitle(titleDraftRef.current);
  }, [persistTitle]);

  useEffect(
    () => () => {
      if (titleDebounceRef.current) clearTimeout(titleDebounceRef.current);
    },
    [],
  );

  const initials = useMemo(
    () =>
      userInitials(
        user?.fullName ?? null,
        user?.primaryEmailAddress?.emailAddress,
      ),
    [user?.fullName, user?.primaryEmailAddress?.emailAddress],
  );

  const cloudTitle = useMemo(() => {
    if (saveStatus === "saving") return "Saving to Convex…";
    if (saveStatus === "error") return "Save failed";
    if (saveStatus === "saved") return "Saved to cloud";
    if (liveStatus === "connected") return "Edits save ~3s after typing · Liveblocks live";
    if (liveStatus === "disconnected") return "Offline — reconnect to sync live";
    return "Connecting…";
  }, [liveStatus, saveStatus]);

  const joinNotifications =
    ownerSidecar?.joinNotifications ?? document.joinNotifications ?? [];
  const publicBlocks =
    ownerSidecar?.publicAccessBlocks ?? document.publicAccessBlocks ?? [];

  const bellContentSignature = useMemo(() => {
    const j = joinNotifications
      .map((n) => `${n.userId}:${n.at}`)
      .sort()
      .join("|");
    const p = (pendingRequests ?? [])
      .map(
        (r) =>
          `${r.userId}:${r.requestedAt}:${r.wantsUnblock === true ? "u" : "n"}`,
      )
      .sort()
      .join("|");
    return `${j}@${p}`;
  }, [joinNotifications, pendingRequests]);

  const blockListSignature = useMemo(
    () =>
      [...publicBlocks]
        .map((b) => `${b.userId}:${b.blockedAt}`)
        .sort()
        .join("|"),
    [publicBlocks],
  );

  const [bellSeenSignature, setBellSeenSignature] = useState<string | null>(
    null,
  );
  const [blockSeenSignature, setBlockSeenSignature] = useState<string | null>(
    null,
  );

  useEffect(() => {
    setBellSeenSignature(null);
    setBlockSeenSignature(null);
  }, [document._id]);

  const hasBellAttentionContent =
    joinNotifications.length > 0 || (pendingRequests?.length ?? 0) > 0;
  const bellDotVisible =
    hasBellAttentionContent && bellSeenSignature !== bellContentSignature;
  const blockBadgeVisible =
    publicBlocks.length > 0 && blockSeenSignature !== blockListSignature;

  return (
    <TooltipProvider delayDuration={280}>
      <ShareDocumentModal
        open={shareDialogOpen}
        onOpenChange={setShareDialogOpen}
        documentUrl={shareUrl}
        visibility={docVisibility}
        isOwner={accessRole === "owner"}
        onVisibilityChange={
          accessRole === "owner"
            ? (next) =>
                void setDocumentVisibility({ id: document._id, visibility: next })
            : undefined
        }
      />
      <header className="flex w-full shrink-0 flex-nowrap items-center gap-2 bg-[#F6EFD9] px-2 py-2 no-print sm:gap-3 sm:px-4">
        <div className="flex min-w-0 max-w-[min(100%,480px)] shrink items-start gap-2 sm:max-w-[min(100%,560px)] sm:gap-3">
          <Link
            href="/documents"
            className="mt-0.5 flex shrink-0 items-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Back to documents"
          >
            <Image
              src="/logo.jpg"
              alt="LiveDocs"
              width={160}
              height={48}
              className="h-9 w-auto max-h-10 object-contain object-left"
              priority
            />
          </Link>
          <div className="flex min-w-0 w-full flex-col gap-0.5 pt-0.5">
            <div className="flex w-full min-w-0 flex-wrap items-center gap-2">
              <Input
                ref={titleInputRef}
                type="text"
                value={titleDraft}
                onChange={(e) => {
                  if (accessRole === "viewer") return;
                  const v = e.target.value;
                  titleDraftRef.current = v;
                  setTitleDraft(v);
                  scheduleTitlePersist();
                }}
                onBlur={() => flushTitlePersist()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                }}
                className="h-auto w-fit max-w-[200px] truncate border border-transparent bg-transparent px-2 py-0.5 text-lg shadow-none hover:border-gray-300 focus-visible:border-transparent focus-visible:ring-2 focus-visible:ring-blue-500 md:text-lg"
                aria-label="Document title"
                readOnly={accessRole === "viewer"}
              />
              <button
                type="button"
                className={cn(
                  "rounded-full p-1 hover:bg-gray-100",
                  document.isFavorite === true
                    ? "text-amber-500"
                    : "text-gray-500",
                )}
                title={
                  document.isFavorite === true
                    ? "Remove from favorites"
                    : "Add to favorites"
                }
                onClick={() => void toggleFavorite({ id: document._id })}
                disabled={accessRole === "viewer"}
              >
                <Star
                  className="h-4 w-4"
                  strokeWidth={1.5}
                  fill={document.isFavorite === true ? "currentColor" : "none"}
                />
              </button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="relative inline-flex cursor-default text-gray-500">
                    {saveStatus === "saving" ? (
                      <Loader2
                        className="h-4 w-4 animate-spin"
                        strokeWidth={1.5}
                        aria-hidden
                      />
                    ) : (
                      <Cloud className="h-4 w-4" strokeWidth={1.5} />
                    )}
                    {saveStatus === "saved" || saveStatus === "idle" ? (
                      <Check
                        className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full bg-[#F6EFD9] text-green-600"
                        strokeWidth={3}
                        aria-hidden
                      />
                    ) : null}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="z-50 max-w-[240px]">
                  {cloudTitle}
                </TooltipContent>
              </Tooltip>
              <LiveblocksConnectionBadge />
              {byokApiKeySlot}
            </div>
            <DocsEditorMenubar doc={document} />
          </div>
        </div>

        {aiMarqueeText?.trim() ? (
          <div className="hidden min-h-[32px] min-w-0 flex-1 items-center justify-center px-2 sm:flex">
            <div
              className={cn(
                "flex w-full min-w-0 justify-center sm:min-w-0",
                aiMarqueeVariant === "aiOff"
                  ? "max-w-[min(300px,calc(100vw-360px))]"
                  : "max-w-[min(920px,calc(100vw-320px))] sm:min-w-[220px]",
              )}
            >
              <AiLedMarquee
                text={aiMarqueeText}
                variant={aiMarqueeVariant === "aiOff" ? "aiOff" : "default"}
              />
            </div>
          </div>
        ) : (
          <div className="hidden min-w-0 flex-1 sm:block" aria-hidden />
        )}

        <div className="flex shrink-0 items-center gap-2 sm:gap-3 md:gap-4">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="relative rounded-full p-2 text-gray-600 hover:bg-gray-100"
                onClick={() => setRightSidebarOpen(!isRightSidebarOpen)}
              >
                <MessageSquare className="h-5 w-5" />
                {commentUnreadCount > 0 ? (
                  <span className="absolute -right-0.5 -top-0.5 min-w-[16px] rounded-full bg-red-500 px-1 text-center text-[10px] font-semibold leading-4 text-white">
                    {commentUnreadCount > 99 ? "99+" : commentUnreadCount}
                  </span>
                ) : null}
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="z-50">
              Comments
              {commentUnreadCount > 0
                ? ` · ${commentUnreadCount} new`
                : ""}
            </TooltipContent>
          </Tooltip>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                aria-label="Connected collaborators"
              >
                <Users className="h-3.5 w-3.5" />
                {connectedCount}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="z-50 w-80 p-2">
              <div className="px-2 py-1 text-xs font-medium text-gray-500">
                People with access ({accessPeople.length})
              </div>
              {accessPeople.length === 0 ? (
                <div className="px-2 py-3 text-xs text-gray-500">No users found.</div>
              ) : (
                accessPeople.map((p) => {
                  const isOwnerRow =
                    p.userId === document.ownerId ||
                    sameUserKey(p.userId, document.ownerId);
                  const isListedCollaborator = (document.collaborators ?? []).some(
                    (c) => c.userId === p.userId || sameUserKey(c.userId, p.userId),
                  );
                  const isLinkGuest =
                    document.visibility === "public" &&
                    !isOwnerRow &&
                    !isListedCollaborator;
                  const role = isOwnerRow
                    ? "owner"
                    : (collaboratorRoleMap.get(p.userId) ??
                      (document.collaborators ?? []).find((c) => sameUserKey(c.userId, p.userId))
                        ?.role ??
                      "viewer");
                  const isOnline =
                    onlinePeopleMap.has(p.userId) ||
                    onlineByNormalizedId.has(normalizeUserId(p.userId));
                  return (
                    <div
                      key={p.userId}
                      className="my-1 flex items-center justify-between gap-2 rounded-md border border-gray-200 p-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm text-[#1F1F1F]">
                          {displayUserLabel(p.email, p.name, p.userId)}
                        </p>
                        <div className="mt-0.5 flex items-center gap-1 text-xs text-gray-500">
                          <span
                            className={cn(
                              "inline-block h-2 w-2 rounded-full",
                              isOnline ? "bg-emerald-500" : "bg-red-500",
                            )}
                            aria-hidden
                          />
                          <span>{isOnline ? "Online" : "Offline"}</span>
                          <span>·</span>
                          {isOwnerRow ? (
                            <>
                              <Crown className="h-3 w-3 text-amber-500" />
                              Owner
                            </>
                          ) : isLinkGuest ? (
                            "Link guest"
                          ) : (
                            "Collaborator"
                          )}
                        </div>
                      </div>
                      {isOwnerRow ? (
                        <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs text-amber-800">
                          Owner
                        </span>
                      ) : accessRole === "owner" ? (
                        <div className="flex items-center gap-1">
                          <select
                            className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700"
                            value={role === "owner" ? "viewer" : role}
                            onChange={(e) =>
                              void setCollaboratorRole({
                                id: document._id,
                                collaboratorUserId: p.userId,
                                role: e.target.value as "editor" | "viewer",
                                email: p.email || undefined,
                                displayName: p.name || undefined,
                              })
                            }
                          >
                            <option value="editor">Editor</option>
                            <option value="viewer">Viewer</option>
                          </select>
                          <button
                            type="button"
                            className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                            onClick={() => {
                              const ok = window.confirm(
                                isLinkGuest
                                  ? `Block ${displayUserLabel(p.email, p.name, p.userId)} from opening this link again?`
                                  : `Remove access for ${displayUserLabel(p.email, p.name, p.userId)}?`,
                              );
                              if (!ok) return;
                              if (isLinkGuest) {
                                void blockPublicVisitor({
                                  id: document._id,
                                  userId: p.userId,
                                  email: p.email || undefined,
                                });
                              } else {
                                void removeCollaborator({
                                  id: document._id,
                                  collaboratorUserId: p.userId,
                                });
                              }
                            }}
                          >
                            {isLinkGuest ? "Block" : "Remove"}
                          </button>
                        </div>
                      ) : (
                        <span className="rounded-full border border-gray-300 bg-gray-50 px-2 py-0.5 text-xs text-gray-700">
                          {role}
                        </span>
                      )}
                    </div>
                  );
                })
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {accessRole === "owner" ? (
            <>
              <DropdownMenu
                onOpenChange={(open) => {
                  if (open) setBellSeenSignature(bellContentSignature);
                }}
              >
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="relative rounded-full p-2 text-gray-600 hover:bg-gray-100"
                    aria-label="Access and activity"
                  >
                    <Bell className="h-5 w-5" />
                    {bellDotVisible ? (
                      <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-red-500" />
                    ) : null}
                  </button>
                </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="z-50 max-h-[min(70vh,520px)] w-80 overflow-y-auto p-2">
                {joinNotifications.length > 0 ? (
                  <>
                    <div className="flex items-center justify-between px-2 py-1">
                      <span className="text-xs font-medium text-gray-500">Recent joins</span>
                      <button
                        type="button"
                        className="text-xs text-blue-600 hover:underline"
                        onClick={() =>
                          void clearJoinNotifications({ id: document._id })
                        }
                      >
                        Clear
                      </button>
                    </div>
                    <div className="mb-2 space-y-1">
                      {[...joinNotifications]
                        .sort((a, b) => b.at - a.at)
                        .slice(0, 12)
                        .map((n) => (
                          <div
                            key={`${n.userId}-${n.at}`}
                            className="rounded-md border border-gray-100 bg-gray-50 px-2 py-1.5 text-xs text-gray-800"
                          >
                            <span className="font-medium text-[#1F1F1F]">
                              {displayUserLabel(
                                n.email ?? "",
                                n.name ?? "",
                                n.userId,
                              )}
                            </span>
                            {typeof n.email === "string" && n.email.includes("@") ? (
                              <span className="mt-0.5 block text-[11px] text-gray-500">
                                {n.email}
                              </span>
                            ) : null}
                            <span className="block text-[11px] text-gray-400">
                              opened · {new Date(n.at).toLocaleString()}
                            </span>
                          </div>
                        ))}
                    </div>
                  </>
                ) : null}

                <div className="px-2 py-1 text-xs font-medium text-gray-500">
                  Access requests
                </div>
                {(pendingRequests ?? []).length === 0 ? (
                  <div className="px-2 py-3 text-xs text-gray-500">No pending requests.</div>
                ) : (
                  (pendingRequests ?? []).map((req) => (
                    <div
                      key={req.userId}
                      className="my-1 rounded-md border border-gray-200 p-2"
                    >
                      <p className="truncate text-sm text-[#1F1F1F]">{req.email}</p>
                      {req.wantsUnblock === true ? (
                        <p className="mt-1 text-xs text-amber-800">
                          Was blocked from this public link — asking to open again. Unblock only
                          removes the block; they join as a link guest (viewer). Promote to editor
                          from the People menu when they are online.
                        </p>
                      ) : null}
                      <div className="mt-2 flex flex-wrap gap-1">
                        {req.wantsUnblock === true ? (
                          <>
                            <button
                              type="button"
                              className="rounded-full border border-amber-300 bg-amber-50 px-3 py-0.5 text-xs font-medium text-amber-950 hover:bg-amber-100"
                              onClick={() =>
                                void grantLinkUnblockRequest({
                                  id: document._id,
                                  requesterUserId: req.userId,
                                })
                              }
                            >
                              Unblock
                            </button>
                            <button
                              type="button"
                              className="rounded-full border border-red-200 px-2 py-0.5 text-xs text-red-600 hover:bg-red-50"
                              onClick={() =>
                                void respondToAccessRequest({
                                  id: document._id,
                                  requesterUserId: req.userId,
                                  decision: "deny",
                                })
                              }
                            >
                              Deny
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="rounded-full border border-gray-300 px-2 py-0.5 text-xs hover:bg-gray-100"
                              onClick={() =>
                                void respondToAccessRequest({
                                  id: document._id,
                                  requesterUserId: req.userId,
                                  decision: "accept",
                                  role: "viewer",
                                })
                              }
                            >
                              Accept viewer
                            </button>
                            <button
                              type="button"
                              className="rounded-full border border-gray-300 px-2 py-0.5 text-xs hover:bg-gray-100"
                              onClick={() =>
                                void respondToAccessRequest({
                                  id: document._id,
                                  requesterUserId: req.userId,
                                  decision: "accept",
                                  role: "editor",
                                })
                              }
                            >
                              Accept editor
                            </button>
                            <button
                              type="button"
                              className="rounded-full border border-red-200 px-2 py-0.5 text-xs text-red-600 hover:bg-red-50"
                              onClick={() =>
                                void respondToAccessRequest({
                                  id: document._id,
                                  requesterUserId: req.userId,
                                  decision: "deny",
                                })
                              }
                            >
                              Deny
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))
                )}
                <div className="mt-2 border-t border-gray-200 pt-2">
                  <div className="px-2 py-1 text-xs font-medium text-gray-500">
                    Has access
                  </div>
                  {(document.collaborators ?? []).length === 0 ? (
                    <div className="px-2 py-2 text-xs text-gray-500">
                      No collaborators yet.
                    </div>
                  ) : (
                    (document.collaborators ?? []).map((c) => (
                      <div
                        key={c.userId}
                        className="my-1 flex items-center justify-between rounded-md border border-gray-200 px-2 py-1.5"
                      >
                        <span className="truncate text-xs text-[#1F1F1F]">
                          {displayUserLabel(c.email ?? "", c.displayName ?? "", c.userId)}
                        </span>
                        <div className="ml-2 flex shrink-0 items-center gap-1">
                          <span className="rounded-full border border-gray-300 bg-gray-50 px-2 py-0.5 text-[11px] text-gray-700">
                            {c.role}
                          </span>
                          <button
                            type="button"
                            className="rounded-full border border-red-200 px-2 py-0.5 text-[11px] text-red-600 hover:bg-red-50"
                            onClick={() => {
                              const ok = window.confirm(
                                `Remove access for ${displayUserLabel(c.email ?? "", c.displayName ?? "", c.userId)}?`,
                              );
                              if (!ok) return;
                              void removeCollaborator({
                                id: document._id,
                                collaboratorUserId: c.userId,
                              });
                            }}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>

              {docVisibility === "public" ? (
                <DropdownMenu
                  onOpenChange={(open) => {
                    if (open) setBlockSeenSignature(blockListSignature);
                  }}
                >
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="relative rounded-full p-2 text-gray-600 hover:bg-gray-100"
                      aria-label="Blocked users for this document"
                      title="Block list for this document — users removed from the public link"
                    >
                      <Ban className="h-5 w-5" aria-hidden />
                      {blockBadgeVisible ? (
                        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-amber-600 px-1 text-[10px] font-semibold leading-none text-white">
                          {publicBlocks.length > 99 ? "99+" : publicBlocks.length}
                        </span>
                      ) : null}
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="z-50 w-80 p-2">
                    <div className="px-2 py-1 text-xs font-medium text-gray-500">
                      Blocked from this link
                    </div>
                    {publicBlocks.length === 0 ? (
                      <div className="px-2 py-4 text-center text-xs text-gray-500">
                        No blocked users for this document.
                      </div>
                    ) : (
                      <div className="max-h-64 space-y-1 overflow-y-auto">
                        {publicBlocks.map((b) => (
                          <div
                            key={b.userId}
                            className="flex items-center justify-between gap-2 rounded-md border border-amber-100 bg-amber-50/80 px-2 py-2"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-xs font-medium text-[#1F1F1F]">
                                {b.email || b.userId}
                              </p>
                              <p className="text-[11px] text-gray-500">
                                Blocked · {new Date(b.blockedAt).toLocaleString()}
                              </p>
                            </div>
                            <button
                              type="button"
                              className="shrink-0 rounded-full border border-gray-300 bg-white px-2.5 py-1 text-[11px] hover:bg-gray-50"
                              onClick={() =>
                                void unblockPublicVisitor({
                                  id: document._id,
                                  userId: b.userId,
                                })
                              }
                            >
                              Unblock
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </>
          ) : null}

          {accessRole === "owner" ? (
            <div
              className="hidden items-center rounded-full border border-gray-200 bg-white p-0.5 text-xs sm:flex"
              title="Who can open this document"
            >
              <button
                type="button"
                className={cn(
                  "rounded-full px-2.5 py-1 font-medium",
                  docVisibility === "private"
                    ? "bg-gray-100 text-[#1F1F1F]"
                    : "text-gray-500 hover:text-gray-800",
                )}
                onClick={() =>
                  void setDocumentVisibility({ id: document._id, visibility: "private" })
                }
              >
                Private
              </button>
              <button
                type="button"
                className={cn(
                  "rounded-full px-2.5 py-1 font-medium",
                  docVisibility === "public"
                    ? "bg-gray-100 text-[#1F1F1F]"
                    : "text-gray-500 hover:text-gray-800",
                )}
                onClick={() =>
                  void setDocumentVisibility({ id: document._id, visibility: "public" })
                }
              >
                Public
              </button>
            </div>
          ) : null}

          <Button
            type="button"
            className="h-auto rounded-full bg-[#C2E7FF] px-6 py-2 font-medium text-[#001D35] shadow-none hover:bg-[#A8D4FF]"
            onClick={() => setShareDialogOpen(true)}
          >
            {docVisibility === "public" ? (
              <Globe className="mr-2 h-4 w-4" aria-hidden />
            ) : (
              <Lock className="mr-2 h-4 w-4" aria-hidden />
            )}
            Share
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                aria-label="Account menu"
              >
                <Avatar className="size-9 border border-gray-200 bg-white">
                  <AvatarImage
                    src={user?.imageUrl ?? undefined}
                    alt={user?.fullName ?? "User"}
                  />
                  <AvatarFallback className="bg-gray-200 text-sm font-medium text-gray-800">
                    {initials}
                  </AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="z-50 w-48">
              <div className="px-2 py-1.5 text-xs text-muted-foreground">
                {user?.primaryEmailAddress?.emailAddress ?? "Signed in"}
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="cursor-pointer"
                onSelect={() => void signOut({ redirectUrl: "/" })}
              >
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
    </TooltipProvider>
  );
}
