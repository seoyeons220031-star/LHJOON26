import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  addFriendById,
  createGroupConversation,
  getConversationTitle,
  getCustomChatName,
  getMyProfile,
  getUserDisplayName,
  leaveConversation,
  listConversations,
  listFriends,
  openDirectConversation,
  removeFriend,
  renameConversation,
  searchUsers,
  updateMyProfile,
  uploadAvatar,
  type Profile,
} from "@/lib/chat";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  MessageCircle,
  UserPlus,
  Users,
  LogOut,
  Plus,
  X,
  Check,
  Trash2,
  Search,
  Camera,
  Loader2,
  MoreHorizontal,
  Bell,
  Pencil,
  BellOff,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_authenticated/chats")({
  component: ChatsHome,
});

function Avatar({ name, url, size = 40 }: { name?: string | null; url?: string | null; size?: number }) {
  const safeName = (name || "").trim() || "사용자";
  const initials = safeName
    .split(/\s+/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return url ? (
    <img
      src={url}
      alt={safeName}
      style={{ width: size, height: size, minWidth: size, minHeight: size }}
      className="block aspect-square shrink-0 rounded-full object-cover"
    />
  ) : (
    <div
      style={{ width: size, height: size, minWidth: size, minHeight: size, fontSize: size * 0.4 }}
      className="flex aspect-square shrink-0 items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground"
    >
      {initials || "사용자"[0]}
    </div>
  );
}

function ChatsHome() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"chats" | "friends" | "profile">("chats");
  const [showAddFriend, setShowAddFriend] = useState(false);
  const [showNewGroup, setShowNewGroup] = useState(false);

  const [showNotifications, setShowNotifications] = useState(false);
  const meQ = useQuery({ queryKey: ["me"], queryFn: getMyProfile });
  const friendsQ = useQuery({ queryKey: ["friends"], queryFn: listFriends });
  const convsQ = useQuery({ queryKey: ["conversations"], queryFn: listConversations });

  // Realtime: any message insert -> refresh conversation list + pulse dashboard
  const [pulse, setPulse] = useState(0);
  const [lastEventAt, setLastEventAt] = useState<number | null>(null);
  useEffect(() => {
    const channel = supabase
      .channel("chats-home")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => {
        qc.invalidateQueries({ queryKey: ["conversations"] });
        setPulse((p) => p + 1);
        setLastEventAt(Date.now());
      })
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversation_participants" },
        () => {
          qc.invalidateQueries({ queryKey: ["conversations"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  const handleSignOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  const handleOpenDirect = async (friend: Profile) => {
    try {
      const id = await openDirectConversation(friend.id);
      await qc.invalidateQueries({ queryKey: ["conversations"] });
      navigate({ to: "/chat/$id", params: { id } });
    } catch (e) {
      console.error("[openDirectConversation]", e);
      toast.error(e instanceof Error ? e.message : "Failed to open chat");
    }
  };

  const [leaveTarget, setLeaveTarget] = useState<{ id: string; name: string } | null>(null);
  const [renameTarget, setRenameTarget] = useState<{ id: string; name: string } | null>(null);
  const [renameInput, setRenameInput] = useState("");
  const [isRenaming, setIsRenaming] = useState(false);

  const handleOpenRename = (id: string, name: string) => {
    const current = getCustomChatName(id) || name || "";
    setRenameTarget({ id, name });
    setRenameInput(current);
  };

  const handleSaveRename = async () => {
    if (!renameTarget || isRenaming) return;
    setIsRenaming(true);
    try {
      const clean = renameInput.trim();
      await renameConversation(renameTarget.id, clean);
      await qc.invalidateQueries({ queryKey: ["conversations"] });
      toast.success("채팅방 이름이 변경되었습니다.");
      setRenameTarget(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "변경 실패");
    } finally {
      setIsRenaming(false);
    }
  };

  const confirmLeaveConversation = async () => {
    if (!leaveTarget) return;
    const { id: convId, name } = leaveTarget;
    setLeaveTarget(null);

    qc.setQueryData<ConversationSummary[]>(["conversations"], (old) =>
      old ? old.filter((c) => c.id !== convId) : [],
    );
    try {
      await leaveConversation(convId);
      await qc.invalidateQueries({ queryKey: ["conversations"] });
      toast.success(`"${name}" 채팅방에서 나갔어요.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "나가기 실패");
      qc.invalidateQueries({ queryKey: ["conversations"] });
    }
  };

  const handleLeaveConversation = (convId: string, name: string) => {
    setLeaveTarget({ id: convId, name });
  };

  const tabLabels: Record<"chats" | "friends" | "profile", string> = {
    chats: "채팅",
    friends: "친구",
    profile: "프로필",
  };

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col bg-background pb-safe">
      {/* Header */}
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background/80 px-4 py-3 pt-safe backdrop-blur">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#166534] text-white font-black text-xs tracking-wider shadow-sm ring-2 ring-[#86EFAC]/40 select-none">
            LHJ
          </div>
          <div>
            <div className="text-sm font-bold leading-none text-[#166534]">LHJOON</div>
            <div className="text-[11px] text-muted-foreground">
              {meQ.data ? `@${meQ.data.username}` : ""}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {tab === "chats" && (
            <button
              onClick={() => setShowNewGroup(true)}
              className="rounded-full p-2 hover:bg-secondary"
              title="New group"
            >
              <Users className="h-5 w-5" />
            </button>
          )}
          {tab === "friends" && (
            <button
              onClick={() => setShowAddFriend(true)}
              className="rounded-full p-2 hover:bg-secondary"
              title="Add friend"
            >
              <UserPlus className="h-5 w-5" />
            </button>
          )}

          {/* Notification Bell Icon */}
          <div className="relative">
            <button
              onClick={() => setShowNotifications((s) => !s)}
              className={`relative rounded-full p-2 hover:bg-secondary transition ${
                showNotifications ? "bg-secondary" : ""
              }`}
              title="알림"
            >
              <Bell className="h-5 w-5 text-foreground" />
              {(() => {
                const totalUnread = (convsQ.data ?? []).reduce((s, c) => s + c.unread_count, 0);
                return totalUnread > 0 ? (
                  <span className="absolute right-1 top-1 flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500"></span>
                  </span>
                ) : null;
              })()}
            </button>

            {showNotifications && (
              <div className="absolute right-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-xl border border-border bg-popover shadow-xl text-foreground">
                <div className="flex items-center justify-between border-b border-border bg-secondary/10 px-3 py-2.5">
                  <span className="text-xs font-bold text-foreground">알림 내역</span>
                  {(() => {
                    const totalUnread = (convsQ.data ?? []).reduce((s, c) => s + c.unread_count, 0);
                    return totalUnread > 0 ? (
                      <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
                        {totalUnread}개 안읽음
                      </span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">모두 읽음</span>
                    );
                  })()}
                </div>
                <div className="max-h-60 overflow-y-auto divide-y divide-border">
                  {(() => {
                    const unreadConvs = (convsQ.data ?? []).filter((c) => c.unread_count > 0);
                    if (unreadConvs.length === 0) {
                      return (
                        <div className="flex flex-col items-center justify-center p-6 text-center text-xs text-muted-foreground">
                          <BellOff className="mb-2 h-5 w-5 text-muted-foreground/60" />
                          새로운 알림이 없습니다.
                        </div>
                      );
                    }
                    return unreadConvs.map((c) => {
                      const name = getConversationTitle(c, c.participants?.[0]);
                      const preview = c.last_message?.content ?? "새 메시지가 있습니다.";
                      return (
                        <button
                          key={c.id}
                          onClick={() => {
                            setShowNotifications(false);
                            navigate({ to: "/chat/$id", params: { id: c.id } });
                          }}
                          className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left text-xs hover:bg-secondary/60 transition text-foreground"
                        >
                          <div className="relative shrink-0">
                            <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold">
                              {name[0]?.toUpperCase()}
                            </div>
                            <span className="absolute -right-0.5 -top-0.5 flex h-2 w-2 rounded-full bg-red-500" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold text-foreground truncate">{name}</div>
                            <div className="text-muted-foreground truncate text-[11px] mt-0.5">
                              {preview}
                            </div>
                            <div className="text-[9px] text-muted-foreground/80 mt-1">
                              {formatDistanceToNow(new Date(c.last_message_at), {
                                addSuffix: true,
                              })}
                            </div>
                          </div>
                        </button>
                      );
                    });
                  })()}
                </div>
              </div>
            )}
          </div>

          <button
            onClick={handleSignOut}
            className="rounded-full p-2 hover:bg-secondary"
            title="Sign out"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border px-4 py-2">
        {(["chats", "friends", "profile"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition active:scale-95 ${
              tab === t
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-secondary"
            }`}
          >
            {tabLabels[t]}
          </button>
        ))}
      </div>

      {/* Content */}
      <main className="flex-1 overflow-y-auto">
        {tab === "chats" && (
          <>
            <LiveDashboard data={convsQ.data ?? []} pulse={pulse} lastEventAt={lastEventAt} />
            <ChatList
              data={convsQ.data ?? []}
              loading={convsQ.isLoading}
              onNewGroup={() => setShowNewGroup(true)}
              onLeave={handleLeaveConversation}
              onRename={(id, currentName) => handleOpenRename(id, currentName)}
            />
          </>
        )}

        {tab === "friends" && (
          <FriendList
            friends={friendsQ.data ?? []}
            loading={friendsQ.isLoading}
            onOpen={handleOpenDirect}
            onRemove={async (id) => {
              await removeFriend(id);
              qc.invalidateQueries({ queryKey: ["friends"] });
              toast.success("Removed");
            }}
            onAdd={() => setShowAddFriend(true)}
          />
        )}
        {tab === "profile" && (
          <ProfilePanel
            profile={meQ.data ?? null}
            loading={meQ.isLoading}
            onUpdated={() => {
              qc.invalidateQueries({ queryKey: ["me"] });
              qc.invalidateQueries({ queryKey: ["conversations"] });
              qc.invalidateQueries({ queryKey: ["friends"] });
            }}
          />
        )}
      </main>

      {showAddFriend && (
        <AddFriendModal
          onClose={() => setShowAddFriend(false)}
          onAdded={() => {
            qc.invalidateQueries({ queryKey: ["friends"] });
          }}
        />
      )}
      {showNewGroup && (
        <NewGroupModal
          friends={friendsQ.data ?? []}
          onClose={() => setShowNewGroup(false)}
          onCreated={(id) => {
            qc.invalidateQueries({ queryKey: ["conversations"] });
            navigate({ to: "/chat/$id", params: { id } });
          }}
        />
      )}

      {renameTarget && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-xs sm:max-w-sm rounded-2xl border border-border bg-popover p-5 shadow-2xl text-foreground animate-in zoom-in-95 duration-200 space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <Pencil className="h-4 w-4 text-primary" />
                <h3 className="font-bold text-base">채팅방 이름 변경</h3>
              </div>
              <button
                type="button"
                onClick={() => setRenameTarget(null)}
                className="rounded-full p-1 text-muted-foreground hover:bg-secondary hover:text-foreground transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">새 채팅방 이름</label>
              <input
                type="text"
                value={renameInput}
                onChange={(e) => setRenameInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleSaveRename();
                  }
                }}
                placeholder="채팅방 이름을 입력하세요"
                className="w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary font-medium"
                autoFocus
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setRenameTarget(null)}
                className="rounded-xl border border-border px-4 py-2 text-xs font-semibold hover:bg-secondary transition text-muted-foreground"
              >
                취소
              </button>
              <button
                type="button"
                disabled={isRenaming}
                onClick={handleSaveRename}
                className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:opacity-90 transition disabled:opacity-50"
              >
                {isRenaming && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                저장
              </button>
            </div>
          </div>
        </div>
      )}

      {leaveTarget && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-xs rounded-2xl border border-border bg-popover p-5 shadow-2xl text-foreground text-center animate-in zoom-in-95 duration-200">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <LogOut className="h-6 w-6" />
            </div>
            <h3 className="font-bold text-base mb-1">채팅방 나가기</h3>
            <p className="text-xs text-muted-foreground mb-5">
              "{leaveTarget.name}" 채팅방에서 나갈까요? 채팅 목록에서 삭제됩니다.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setLeaveTarget(null)}
                className="flex-1 rounded-xl border border-border py-2.5 text-xs font-semibold hover:bg-secondary transition"
              >
                취소
              </button>
              <button
                onClick={confirmLeaveConversation}
                className="flex-1 rounded-xl bg-destructive py-2.5 text-xs font-semibold text-destructive-foreground hover:bg-destructive/90 transition shadow-sm"
              >
                나가기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function LiveDashboard({
  data,
  pulse,
  lastEventAt,
}: {
  data: Awaited<ReturnType<typeof listConversations>>;
  pulse: number;
  lastEventAt: number | null;
}) {
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (pulse === 0) return;
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 900);
    return () => clearTimeout(t);
  }, [pulse]);

  const totalUnread = data.reduce((s, c) => s + c.unread_count, 0);
  const now = Date.now();
  const activeConvs = data.filter(
    (c) => now - new Date(c.last_message_at).getTime() < 5 * 60 * 1000,
  );
  const recent = data.filter((c) => c.last_message).slice(0, 6);

  const lastAgo = lastEventAt
    ? `${Math.max(1, Math.round((now - lastEventAt) / 1000))}s ago`
    : "대기 중";

  return (
    <section className="border-b border-border bg-gradient-to-b from-[#ECFDF5] to-transparent px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span
              className={`absolute inline-flex h-full w-full rounded-full bg-[#34D399] opacity-75 ${
                flash ? "animate-ping" : ""
              }`}
            />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#10B981]" />
          </span>
          <h2 className="text-[13px] font-bold text-[#065F46]">실시간 상황판</h2>
        </div>
        <span className="text-[10px] text-muted-foreground">최근 신호 · {lastAgo}</span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <StatCard
          label="안 읽음"
          value={totalUnread}
          accent="#10B981"
          flash={flash && totalUnread > 0}
        />
        <StatCard label="활성 대화" value={activeConvs.length} accent="#059669" />
        <StatCard label="전체 방" value={data.length} accent="#047857" />
      </div>

      {recent.length > 0 && (
        <div className="mt-3 -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {recent.map((c) => {
            const name = getConversationTitle(c, c.participants?.[0]);
            const isActive = now - new Date(c.last_message_at).getTime() < 5 * 60 * 1000;
            return (
              <Link
                key={c.id}
                to="/chat/$id"
                params={{ id: c.id }}
                className="flex shrink-0 flex-col items-center gap-1"
                title={name}
              >
                <div className="relative">
                  <Avatar name={name} url={c.participants[0]?.avatar_url} size={44} />
                  {isActive && (
                    <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background bg-[#10B981]" />
                  )}
                  {c.unread_count > 0 && (
                    <span className="absolute -top-1 -right-1 inline-flex min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                      {c.unread_count}
                    </span>
                  )}
                </div>
                <span className="max-w-[56px] truncate text-[10px] text-muted-foreground">
                  {name}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}

function StatCard({
  label,
  value,
  accent,
  flash,
}: {
  label: string;
  value: number;
  accent: string;
  flash?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border border-[#A7F3D0]/60 bg-white/70 px-3 py-2 shadow-sm transition ${
        flash ? "scale-[1.02] ring-2 ring-[#6EE7B7]" : ""
      }`}
    >
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="text-xl font-bold" style={{ color: accent }}>
        {value}
      </div>
    </div>
  );
}

function ChatList({
  data,
  loading,
  onNewGroup,
  onLeave,
  onRename,
}: {
  data: Awaited<ReturnType<typeof listConversations>>;
  loading: boolean;
  onNewGroup: () => void;
  onLeave: (id: string, name: string) => void;
  onRename?: (id: string, name: string) => void;
}) {
  const [menuId, setMenuId] = useState<string | null>(null);
  useEffect(() => {
    if (!menuId) return;
    const close = () => setMenuId(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [menuId]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin mb-2 text-primary" />
        <span className="text-xs font-medium">채팅 목록을 불러오는 중...</span>
      </div>
    );
  }
  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary">
          <MessageCircle className="h-6 w-6 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium">아직 대화 내역이 없습니다</p>
        <p className="mt-1 text-xs text-muted-foreground">
          친구 탭에서 대화를 시작하거나 새 그룹을 만들어보세요.
        </p>
        <button
          onClick={onNewGroup}
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          <Plus className="h-4 w-4" /> 새 그룹 만들기
        </button>
      </div>
    );
  }
  return (
    <ul className="divide-y divide-border">
      {data.map((c) => {
        if (!c) return null;
        const name = getConversationTitle(c, c.participants?.[0]);
        const avatarName = name;
        const preview = c.last_message?.content ?? "메시지가 없습니다.";
        const open = menuId === c.id;
        return (
          <li key={c.id || Math.random().toString()} className="relative">
            <Link
              to="/chat/$id"
              params={{ id: c.id }}
              className="flex items-center gap-3 px-4 py-3 pr-12 hover:bg-secondary/60"
            >
              <Avatar name={avatarName} url={c.participants?.[0]?.avatar_url} size={48} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="truncate text-sm font-semibold">
                    {c.is_group && (
                      <span className="mr-1 inline-block align-middle">
                        <Users className="inline h-3.5 w-3.5" />
                      </span>
                    )}
                    {name}
                  </div>
                  <div className="shrink-0 text-[11px] text-muted-foreground">
                    {c.last_message_at ? formatDistanceToNow(new Date(c.last_message_at), { addSuffix: false }) : ""}
                  </div>
                </div>
                <div className="mt-0.5 flex items-center justify-between gap-2">
                  <div className="truncate text-xs text-muted-foreground">{preview}</div>
                  {c.unread_count > 0 && (
                    <span className="ml-2 inline-flex min-w-[20px] items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
                      {c.unread_count}
                    </span>
                  )}
                </div>
              </div>
            </Link>
            <button
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                setMenuId(open ? null : c.id);
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-2 text-muted-foreground hover:bg-secondary"
              title="더보기"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
            {open && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute right-2 top-14 z-20 w-40 overflow-hidden rounded-xl border border-border bg-popover shadow-lg"
              >
                {onRename && (
                  <button
                    onClick={() => {
                      setMenuId(null);
                      onRename(c.id, name);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-foreground hover:bg-secondary border-b border-border"
                  >
                    <Pencil className="h-4 w-4 text-muted-foreground" /> 이름 변경
                  </button>
                )}
                <button
                  onClick={() => {
                    setMenuId(null);
                    onLeave(c.id, name);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-destructive hover:bg-secondary"
                >
                  <Trash2 className="h-4 w-4" /> 채팅방 나가기
                </button>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function FriendList({
  friends,
  loading,
  onOpen,
  onRemove,
  onAdd,
}: {
  friends: Profile[];
  loading: boolean;
  onOpen: (p: Profile) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
}) {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin mb-2 text-primary" />
        <span className="text-xs font-medium">친구 목록을 불러오는 중...</span>
      </div>
    );
  }
  if (!friends || friends.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary">
          <UserPlus className="h-6 w-6 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium">아직 친구가 없습니다</p>
        <p className="mt-1 text-xs text-muted-foreground">@ID나 이름으로 친구를 추가해보세요.</p>
        <button
          onClick={onAdd}
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          <UserPlus className="h-4 w-4" /> 친구 추가
        </button>
      </div>
    );
  }
  return (
    <ul className="divide-y divide-border">
      {friends.map((f: { id?: string; username?: string | null; display_name?: string | null; avatar_url?: string | null; email?: string | null; friend_id?: string; profile?: { id?: string; username?: string | null; display_name?: string | null; avatar_url?: string | null; email?: string | null } }) => {
        if (!f) return null;
        const profileObj = f.profile || f;
        const displayName = getUserDisplayName(f) || "친구";
        const rawEmail = (f?.email || f?.profile?.email || "user@test.com");
        const safeEmailStr = typeof rawEmail === "string" ? rawEmail : "user@test.com";
        const emailPrefix = safeEmailStr.split("@")[0] || "사용자";
        const username = profileObj?.username || f?.username || emailPrefix || "사용자";
        const avatarUrl = profileObj?.avatar_url || f?.avatar_url || null;
        const friendId = f?.id || profileObj?.id || f?.friend_id;

        return (
          <li key={friendId || Math.random().toString()} className="flex items-center gap-3 px-4 py-3">
            <button onClick={() => friendId && onOpen(profileObj as Profile)} className="flex flex-1 items-center gap-3 text-left">
              <Avatar name={displayName} url={avatarUrl} size={44} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{displayName}</div>
                <div className="truncate text-xs text-muted-foreground">@{username}</div>
              </div>
            </button>
            <button
              onClick={() => friendId && onRemove(friendId)}
              className="rounded-full p-2 text-muted-foreground hover:bg-secondary hover:text-destructive"
              title="친구 삭제"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-3xl bg-card p-5 shadow-xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function AddFriendModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Profile[]>([]);
  const [searching, setSearching] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const rows = await searchUsers(q);
        setResults(rows);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Search failed");
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  const handleAdd = async (p: Profile) => {
    setAddingId(p.id);
    try {
      await addFriendById(p.id);
      setAdded((s) => new Set(s).add(p.id));
      toast.success(`Added ${p.display_name}`);
      onAdded();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setAddingId(null);
    }
  };

  return (
    <Modal onClose={onClose}>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Add friend</h2>
        <button onClick={onClose} className="rounded-full p-1 hover:bg-secondary">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          autoFocus
          placeholder="Search by name, @username, or email"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-xl border border-input bg-background py-2.5 pl-9 pr-4 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
      <div className="max-h-80 overflow-y-auto rounded-xl border border-border">
        {query.trim() === "" && (
          <div className="p-6 text-center text-sm text-muted-foreground">
            Start typing to find friends.
          </div>
        )}
        {query.trim() !== "" && searching && (
          <div className="flex items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Searching…
          </div>
        )}
        {query.trim() !== "" && !searching && results.length === 0 && (
          <div className="p-6 text-center text-sm text-muted-foreground">No users found.</div>
        )}
        {results.map((p) => {
          if (!p) return null;
          const isAdded = p.id ? added.has(p.id) : false;
          const isAdding = p.id ? addingId === p.id : false;
          const pName = getUserDisplayName(p);
          const pUsername = p.username || (p.email ? (p.email || "").split("@")[0] : "사용자");
          return (
            <div
              key={p.id || Math.random().toString()}
              className="flex items-center gap-3 border-b border-border px-3 py-2.5 last:border-b-0"
            >
              <Avatar name={pName} url={p.avatar_url} size={36} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{pName}</div>
                <div className="truncate text-xs text-muted-foreground">@{pUsername}</div>
              </div>
              <button
                onClick={() => p.id && handleAdd(p)}
                disabled={isAdding || isAdded || !p.id}
                className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  isAdded
                    ? "bg-secondary text-muted-foreground"
                    : "bg-primary text-primary-foreground hover:opacity-90"
                } disabled:opacity-60`}
              >
                {isAdded ? (
                  <>
                    <Check className="h-3.5 w-3.5" /> Added
                  </>
                ) : isAdding ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Adding
                  </>
                ) : (
                  <>
                    <UserPlus className="h-3.5 w-3.5" /> Add
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

function ProfilePanel({
  profile,
  loading,
  onUpdated,
}: {
  profile: Profile | null;
  loading: boolean;
  onUpdated: () => void;
}) {
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (profile) {
      setDisplayName(getUserDisplayName(profile));
      setAvatarUrl(profile.avatar_url ?? null);
    }
  }, [profile]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin mb-2 text-primary" />
        <span className="text-xs font-medium">프로필 정보를 불러오는 중...</span>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">
        프로필 정보를 찾을 수 없습니다.
      </div>
    );
  }

  const pUsername = profile.username || (profile.email ? (profile.email || "").split("@")[0] : "사용자");

  const handlePickFile = () => fileRef.current?.click();

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("이미지 용량은 5MB 이하이어야 합니다.");
      return;
    }
    setUploading(true);
    try {
      const url = await uploadAvatar(file);
      setAvatarUrl(url);
      await updateMyProfile({ avatar_url: url });
      toast.success("프로필 사진이 변경되었습니다.");
      onUpdated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "업로드 실패");
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    const name = displayName.trim();
    if (!name) {
      toast.error("이름을 입력해 주세요.");
      return;
    }
    if (name.length > 60) {
      toast.error("이름은 60자 이하이어야 합니다.");
      return;
    }
    setSaving(true);
    try {
      await updateMyProfile({ display_name: name });
      toast.success("프로필이 저장되었습니다.");
      onUpdated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  };

  const dirty = displayName.trim() !== getUserDisplayName(profile);

  return (
    <div className="px-5 py-6">
      <div className="flex flex-col items-center">
        <div className="relative">
          <Avatar name={displayName || getUserDisplayName(profile)} url={avatarUrl} size={104} />
          <button
            type="button"
            onClick={handlePickFile}
            disabled={uploading}
            className="absolute bottom-0 right-0 flex h-9 w-9 items-center justify-center rounded-full border-2 border-background bg-primary text-primary-foreground shadow disabled:opacity-60"
            title="프로필 사진 변경"
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Camera className="h-4 w-4" />
            )}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFile}
          />
        </div>
        <div className="mt-3 text-xs text-muted-foreground">@{pUsername}</div>
      </div>

      <div className="mt-6 space-y-2">
        <label className="text-xs font-medium text-muted-foreground">표시 이름</label>
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={60}
          className="w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          onClick={handleSave}
          disabled={!dirty || saving}
          className="mt-2 w-full rounded-full bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {saving ? "저장 중…" : "변경사항 저장"}
        </button>
      </div>
    </div>
  );
}

function NewGroupModal({
  friends,
  onClose,
  onCreated,
}: {
  friends: Profile[];
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  const canCreate = useMemo(() => selected.size >= 1, [selected]);

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const create = async () => {
    setLoading(true);
    try {
      const selectedList = Array.from(selected);
      if (selectedList.length === 0) {
        throw new Error("대화 상대를 선택해주세요.");
      }

      let id: string;
      if (selectedList.length === 1) {
        // Only 1 friend selected: Open or create a 1:1 direct conversation instead
        id = await openDirectConversation(selectedList[0]);
        toast.success("1:1 대화방이 연결되었습니다.");
      } else {
        // 2 or more friends selected: Create a group conversation
        const finalTitle =
          title.trim() ||
          friends
            .filter((f) => selected.has(f.id))
            .map((f) => getUserDisplayName(f))
            .slice(0, 3)
            .join(", ") ||
          "새로운 그룹 채팅방";
        id = await createGroupConversation(finalTitle, selectedList);
        toast.success("그룹 채팅방이 생성되었습니다.");
      }
      onCreated(id);
      onClose();
    } catch (e) {
      console.error("[Room Creation Error]", e);
      toast.error(e instanceof Error ? e.message : "채팅방 생성에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal onClose={onClose}>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">New group</h2>
        <button onClick={onClose} className="rounded-full p-1 hover:bg-secondary">
          <X className="h-5 w-5" />
        </button>
      </div>
      <input
        placeholder="Group name (optional)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="mb-3 w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
      />
      <div className="mb-1 text-xs font-medium text-muted-foreground">
        Select friends ({selected.size} selected — min 1)
      </div>
      <ul className="max-h-72 overflow-y-auto rounded-xl border border-border">
        {friends.length === 0 && (
          <li className="p-4 text-center text-sm text-muted-foreground">
            Add friends first to create a group.
          </li>
        )}
        {friends.map((f) => {
          if (!f) return null;
          const on = selected.has(f.id);
          const name = getUserDisplayName(f);
          const uname = f.username || (f.email ? (f.email || "").split("@")[0] : "사용자");
          return (
            <li key={f.id}>
              <button
                type="button"
                onClick={() => toggle(f.id)}
                className={`flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-secondary/60 ${
                  on ? "bg-secondary/50" : ""
                }`}
              >
                <Avatar name={name} url={f.avatar_url} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{name}</div>
                  <div className="truncate text-xs text-muted-foreground">@{uname}</div>
                </div>
                <div
                  className={`flex h-6 w-6 items-center justify-center rounded-full border ${
                    on ? "border-primary bg-primary text-primary-foreground" : "border-border"
                  }`}
                >
                  {on && <Check className="h-4 w-4" />}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
      <button
        onClick={create}
        disabled={!canCreate || loading}
        className="mt-4 w-full rounded-full bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
      >
        {loading ? "Creating…" : "Create group"}
      </button>
    </Modal>
  );
}
