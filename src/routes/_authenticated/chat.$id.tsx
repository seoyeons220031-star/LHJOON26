import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  deleteMessage,
  editMessage,
  getConversationDetail,
  getConversationTitle,
  getCustomChatName,
  getMessageById,
  getUserDisplayName,
  leaveConversation,
  loadMessages,
  markConversationRead,
  pinConversationMessage,
  renameConversation,
  sendMessage,
  setConversationMuted,
  setConversationTheme,
  uploadChatFile,
  type Message,
  type Profile,
  type ConversationSummary,
} from "@/lib/chat";
import { CHAT_THEMES, getChatTheme, type ChatThemeSlug } from "@/lib/chat-themes";
import { setActiveConversation } from "@/lib/active-conversation";
import { toast } from "sonner";
import {
  ArrowLeft,
  Bell,
  BellOff,
  Check,
  ChevronDown,
  Clock,
  Calendar,
  Copy,
  Download,
  FileText,
  FolderOpen,
  Loader2,
  LogOut,
  MoreHorizontal,
  Palette,
  Paperclip,
  Pencil,
  Pin,
  PinOff,
  RotateCcw,
  Search,
  Send,
  Smile,
  Star,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/chat/$id")({
  component: ChatRoom,
});

type Participant = {
  user_id: string;
  last_read_at: string;
  profile: Profile | null;
};

type ScheduledMessage = {
  id: string;
  conversation_id: string;
  content: string;
  scheduled_at: string;
  created_at: string;
};

function Avatar({ name, url, size = 32 }: { name?: string | null; url?: string | null; size?: number }) {
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

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function AttachmentView({
  m,
  onOpenImage,
  isDarkTheme,
}: {
  m: Message;
  onOpenImage: (url: string, name: string) => void;
  isDarkTheme?: boolean;
}) {
  if (!m.attachment_url || !m.attachment_type) return null;
  const t = m.attachment_type;
  const name = m.attachment_name ?? "file";
  if (t.startsWith("image/")) {
    return (
      <button
        type="button"
        onClick={() => onOpenImage(m.attachment_url!, name)}
        className="group/img block w-full overflow-hidden rounded-2xl transition hover:opacity-95"
      >
        <img
          src={m.attachment_url}
          alt={name}
          className="max-h-80 w-full object-cover transition-transform duration-200 group-hover/img:scale-[1.02]"
        />
      </button>
    );
  }
  if (t.startsWith("video/")) {
    return (
      <video controls src={m.attachment_url} className="max-h-80 w-full rounded-2xl bg-black" />
    );
  }
  const isPdf = t === "application/pdf";
  return (
    <a
      href={m.attachment_url}
      target="_blank"
      rel="noreferrer"
      download={name}
      className={`flex min-w-[200px] items-center gap-2 rounded-2xl px-3 py-2 text-inherit transition ${
        isDarkTheme
          ? "bg-black/30 hover:bg-black/40 text-white"
          : "bg-background/80 hover:bg-background text-foreground"
      }`}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/20 text-primary">
        <FileText className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className={`truncate text-xs font-semibold ${isDarkTheme ? "text-white" : ""}`}>
          {name}
        </div>
        <div className={`text-[10px] opacity-75 ${isDarkTheme ? "text-slate-200" : ""}`}>
          {isPdf ? "PDF · " : ""}
          {m.attachment_size ? formatBytes(m.attachment_size) : ""}
        </div>
      </div>
      <Download className={`h-4 w-4 shrink-0 opacity-75 ${isDarkTheme ? "text-white" : ""}`} />
    </a>
  );
}

function ChatRoom() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [me, setMe] = useState<string | null>(null);
  const [conv, setConv] = useState<{
    is_group: boolean;
    name?: string | null;
    title: string | null;
    pinned_message_id: string | null;
    theme_slug: ChatThemeSlug;
  } | null>(null);
  const [showThemes, setShowThemes] = useState(false);
  const [muted, setMuted] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [pinnedMsg, setPinnedMsg] = useState<Message | null>(null);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const [showThemeModal, setShowThemeModal] = useState(false);
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [renameInput, setRenameInput] = useState("");
  const [isRenaming, setIsRenaming] = useState(false);
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<Message | null>(null);
  const [leaveRoomConfirmOpen, setLeaveRoomConfirmOpen] = useState(false);
  const [scheduledMessages, setScheduledMessages] = useState<ScheduledMessage[]>(() => {
    try {
      const saved = localStorage.getItem(`chat_scheduled:${id}`);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showScheduleListModal, setShowScheduleListModal] = useState(false);
  const [scheduleText, setScheduleText] = useState("");
  const [scheduleDateTime, setScheduleDateTime] = useState(() => {
    const d = new Date(Date.now() + 10 * 60 * 1000);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const hours = String(d.getHours()).padStart(2, "0");
    const minutes = String(d.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  });
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(`chat_bookmarks:${id}`);
      return new Set(saved ? JSON.parse(saved) : []);
    } catch {
      return new Set();
    }
  });
  const [showScrollBottomBtn, setShowScrollBottomBtn] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [showSidebar, setShowSidebar] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<"media" | "files" | "bookmarks">("media");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [showMore, setShowMore] = useState(false);
  const [lightbox, setLightbox] = useState<{ url: string; name: string } | null>(null);

  const [reactions, setReactions] = useState<Record<string, Record<string, string[]>>>({});
  const [activeEmojiMenuId, setActiveEmojiMenuId] = useState<string | null>(null);
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);

  const markReadMutation = useMutation({
    mutationFn: () => markConversationRead(id),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ["conversations"] });
      const previousConvs = qc.getQueryData<ConversationSummary[]>(["conversations"]);

      qc.setQueryData<ConversationSummary[]>(["conversations"], (old) => {
        if (!old) return old;
        return old.map((c) => (c.id === id ? { ...c, unread_count: 0 } : c));
      });

      if (me) {
        setParticipants((prev) =>
          prev.map((p) =>
            p.user_id === me ? { ...p, last_read_at: new Date().toISOString() } : p,
          ),
        );
      }

      return { previousConvs };
    },
    onError: (err, newTodo, context) => {
      if (context?.previousConvs) {
        qc.setQueryData(["conversations"], context.previousConvs);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });

  const reactionsRef = useRef(reactions);
  useEffect(() => {
    reactionsRef.current = reactions;
  }, [reactions]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(`chat_reactions:${id}`);
      setReactions(saved ? JSON.parse(saved) : {});
    } catch {
      setReactions({});
    }
    setActiveEmojiMenuId(null);
  }, [id]);

  // Clean up object URL on unmount
  useEffect(() => {
    return () => {
      if (filePreview) {
        URL.revokeObjectURL(filePreview);
      }
    };
  }, [filePreview]);

  const mediaMessages = useMemo(() => {
    return messages.filter(
      (m) =>
        m.attachment_url &&
        m.attachment_type &&
        (m.attachment_type.startsWith("image/") || m.attachment_type.startsWith("video/")),
    );
  }, [messages]);

  const fileMessages = useMemo(() => {
    return messages.filter(
      (m) =>
        m.attachment_url &&
        m.attachment_type &&
        !m.attachment_type.startsWith("image/") &&
        !m.attachment_type.startsWith("video/"),
    );
  }, [messages]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const isInitialLoadRef = useRef(true);
  const fileRef = useRef<HTMLInputElement>(null);
  const typingTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const longPressTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lastTypingSentRef = useRef(0);

  const profileMap = useMemo(() => {
    const m = new Map<string, Profile>();
    for (const p of participants) if (p.profile) m.set(p.user_id, p.profile);
    return m;
  }, [participants]);

  // Track as active conv for global notifier suppression
  useEffect(() => {
    setActiveConversation(id);
    isInitialLoadRef.current = true;
    return () => setActiveConversation(null);
  }, [id]);

  // Initial load
  useEffect(() => {
    // 0-second unread count clear for the list view
    qc.setQueryData<ConversationSummary[]>(["conversations"], (old) => {
      if (!old) return old;
      return old.map((c) => (c.id === id ? { ...c, unread_count: 0 } : c));
    });

    const cachedConvs = qc.getQueryData<ConversationSummary[]>(["conversations"]);
    const cached = cachedConvs?.find((c) => c.id === id);
    if (cached) {
      setConv({
        is_group: cached.is_group,
        name: cached.name,
        title: cached.title,
        pinned_message_id: cached.pinned_message_id ?? null,
        theme_slug: "mint",
      });
      setMuted(cached.muted);
      if (cached.last_message) {
        setMessages((prev) => (prev.length === 0 ? [cached.last_message!] : prev));
      }
      setLoading(false);
    }

    let alive = true;
    (async () => {
      if (!cached) setLoading(true);
      try {
        const [detail, msgs] = await Promise.all([
          getConversationDetail(id),
          loadMessages(id),
        ]);
        if (!alive) return;
        setMe(detail.me);
        setConv({
          is_group: detail.conversation.is_group,
          name: detail.conversation.name,
          title: detail.conversation.title,
          pinned_message_id: detail.conversation.pinned_message_id ?? null,
          theme_slug: (detail.conversation.theme_slug as ChatThemeSlug) ?? "mint",
        });
        setMuted(detail.myMuted);

        // Optimistically update my last_read_at in the participants list to now
        const myId = detail.me;
        const mappedParticipants = (detail.participants as Participant[]).map((p) =>
          p.user_id === myId ? { ...p, last_read_at: new Date().toISOString() } : p,
        );
        setParticipants(mappedParticipants);

        setMessages(msgs);
        if (detail.conversation.pinned_message_id) {
          const pm = msgs.find((m) => m.id === detail.conversation.pinned_message_id);
          if (pm) {
            setPinnedMsg(pm);
          } else {
            getMessageById(detail.conversation.pinned_message_id).then((p) => {
              if (alive && p) setPinnedMsg(p);
            });
          }
        }

        // Mark conversation read
        void markConversationRead(id);
      } catch (e) {
        console.warn("Chat load exception handled:", e);
        if (!alive) return;
        setConv((prev) => prev || {
          is_group: false,
          name: null,
          title: "채팅방",
          pinned_message_id: null,
          theme_slug: "mint",
        });
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [id, navigate, qc]);

  // Realtime
  useEffect(() => {
    if (!me) return;
    const channel = supabase.channel(`conv:${id}`, { config: { presence: { key: me } } });
    channelRef.current = channel;

    channel
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${id}`,
        },
        (payload) => {
          const m = payload.new as Message;
          setMessages((prev) => {
            if (prev.some((x) => x.id === m.id)) return prev;
            const idx = prev.findIndex(
              (x) =>
                x.id.startsWith("tmp-") &&
                x.sender_id === m.sender_id &&
                (x.content ?? "") === (m.content ?? "") &&
                (x.attachment_path ?? null) === (m.attachment_path ?? null),
            );
            if (idx !== -1) {
              const next = prev.slice();
              next[idx] = m;
              return next;
            }
            return [...prev, m];
          });
          if (m.sender_id !== me) {
            markReadMutation.mutate();
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${id}`,
        },
        (payload) => {
          const m = payload.new as Message;
          setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, ...m } : x)));
          setPinnedMsg((prev) => (prev && prev.id === m.id ? { ...prev, ...m } : prev));
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${id}`,
        },
        (payload) => {
          const oldId = (payload.old as { id?: string }).id;
          if (!oldId) return;
          setMessages((prev) => prev.filter((x) => x.id !== oldId));
          setPinnedMsg((prev) => (prev && prev.id === oldId ? null : prev));
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "conversations",
          filter: `id=eq.${id}`,
        },
        async (payload) => {
          const c = payload.new as {
            pinned_message_id: string | null;
            name?: string | null;
            title: string | null;
            is_group: boolean;
            theme_slug: string | null;
          };
          setConv((prev) =>
            prev
              ? {
                  ...prev,
                  pinned_message_id: c.pinned_message_id,
                  name: c.name ?? prev.name,
                  title: c.title ?? prev.title,
                  theme_slug: (c.theme_slug as ChatThemeSlug) ?? prev.theme_slug,
                }
              : prev,
          );
          if (!c.pinned_message_id) setPinnedMsg(null);
          else {
            const local = messages.find((m) => m.id === c.pinned_message_id);
            setPinnedMsg(local ?? (await getMessageById(c.pinned_message_id)));
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "conversation_participants",
          filter: `conversation_id=eq.${id}`,
        },
        (payload) => {
          const row = payload.new as { user_id: string; last_read_at: string; muted?: boolean };
          setParticipants((prev) =>
            prev.map((p) =>
              p.user_id === row.user_id ? { ...p, last_read_at: row.last_read_at } : p,
            ),
          );
          if (row.user_id === me && typeof row.muted === "boolean") setMuted(row.muted);
        },
      )
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const uid = payload?.user_id as string | undefined;
        if (!uid || uid === me) return;
        setTyping((prev) => {
          const next = new Set(prev);
          next.add(uid);
          return next;
        });
        const existing = typingTimersRef.current.get(uid);
        if (existing) clearTimeout(existing);
        const t = setTimeout(() => {
          setTyping((prev) => {
            const next = new Set(prev);
            next.delete(uid);
            return next;
          });
          typingTimersRef.current.delete(uid);
        }, 3000);
        typingTimersRef.current.set(uid, t);
      })
      .on("broadcast", { event: "reaction_update" }, ({ payload }) => {
        const { messageId, reactions: msgReactions } = payload || {};
        if (!messageId) return;
        setReactions((prev) => {
          const next = { ...prev, [messageId]: msgReactions };
          if (!msgReactions || Object.keys(msgReactions).length === 0) {
            delete next[messageId];
          }
          try {
            localStorage.setItem(`chat_reactions:${id}`, JSON.stringify(next));
          } catch (e) {
            console.error(e);
          }
          return next;
        });
      })
      .on("broadcast", { event: "reaction_sync_request" }, () => {
        if (channelRef.current) {
          channelRef.current.send({
            type: "broadcast",
            event: "reaction_sync_response",
            payload: {
              reactions: reactionsRef.current,
            },
          });
        }
      })
      .on("broadcast", { event: "reaction_sync_response" }, ({ payload }) => {
        const incomingReactions = payload?.reactions as
          Record<string, Record<string, string[]>> | undefined;
        if (!incomingReactions) return;
        setReactions((prev) => {
          const merged = { ...prev };
          for (const [msgId, emojis] of Object.entries(incomingReactions)) {
            merged[msgId] = {
              ...(merged[msgId] || {}),
              ...emojis,
            };
            for (const [emoji, users] of Object.entries(emojis)) {
              const localUsers = merged[msgId][emoji] || [];
              merged[msgId][emoji] = Array.from(new Set([...localUsers, ...users]));
            }
          }
          try {
            localStorage.setItem(`chat_reactions:${id}`, JSON.stringify(merged));
          } catch (e) {
            console.error(e);
          }
          return merged;
        });
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED" && channelRef.current) {
          setTimeout(() => {
            channelRef.current?.send({
              type: "broadcast",
              event: "reaction_sync_request",
            });
          }, 800);
        }
      });

    const timers = typingTimersRef.current;
    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, me, qc]);

  useEffect(() => {
    if (loading) return;
    const el = scrollRef.current;
    if (el) {
      if (isInitialLoadRef.current) {
        el.scrollTop = el.scrollHeight;
        // Check scroll again after a tiny delay in case of image layouts/font rendering
        const t = setTimeout(() => {
          if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }, 50);
        isInitialLoadRef.current = false;
        return () => clearTimeout(t);
      } else {
        el.scrollTo({
          top: el.scrollHeight,
          behavior: "smooth",
        });
      }
    }
  }, [messages, typing, pinnedMsg, loading]);

  // Close menus on outside click
  useEffect(() => {
    const onDoc = () => {
      setOpenMenuId(null);
      setShowMore(false);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  const handleInputChange = (v: string) => {
    setInput(v);
    if (!me || !channelRef.current) return;
    const now = Date.now();
    if (now - lastTypingSentRef.current > 1200) {
      lastTypingSentRef.current = now;
      channelRef.current.send({
        type: "broadcast",
        event: "typing",
        payload: { user_id: me },
      });
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    let currentMe = me;
    if (!currentMe) {
      try {
        const prof = await getMyProfile();
        if (prof?.id) {
          currentMe = prof.id;
          setMe(prof.id);
        }
      } catch (err) {
        console.error("Failed to get profile:", err);
      }
    }
    if (!currentMe) {
      toast.error("로그인이 필요합니다.");
      return;
    }

    const text = input.trim();
    if (!text && !selectedFile) return;

    setInput("");
    const fileToSend = selectedFile;
    setSelectedFile(null);
    setFilePreview(null);

    const tmpId = `tmp-${Date.now()}`;

    if (fileToSend) {
      setUploading(true);
      try {
        const meta = await uploadChatFile(id, fileToSend);
        const optimistic: Message = {
          id: tmpId,
          conversation_id: id,
          sender_id: currentMe,
          content: text || null,
          created_at: new Date().toISOString(),
          attachment_url: meta.url,
          attachment_path: meta.path,
          attachment_type: meta.type,
          attachment_name: meta.name,
          attachment_size: meta.size,
        };
        setMessages((prev) => [...prev, optimistic]);
        const realMsg = await sendMessage(id, text || null, meta);
        if (realMsg) {
          setMessages((prev) => {
            const idx = prev.findIndex((m) => m.id === tmpId);
            if (idx !== -1) {
              const next = [...prev];
              next[idx] = realMsg;
              return next;
            }
            if (!prev.some((m) => m.id === realMsg.id)) {
              return [...prev, realMsg];
            }
            return prev;
          });
        }
      } catch (err) {
        setMessages((prev) => prev.filter((m) => m.id !== tmpId));
        toast.error(err instanceof Error ? err.message : "업로드 및 전송 실패");
      } finally {
        setUploading(false);
      }
    } else {
      const optimistic: Message = {
        id: tmpId,
        conversation_id: id,
        sender_id: currentMe,
        content: text,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimistic]);
      try {
        const realMsg = await sendMessage(id, text);
        if (realMsg) {
          setMessages((prev) => {
            const idx = prev.findIndex((m) => m.id === tmpId);
            if (idx !== -1) {
              const next = [...prev];
              next[idx] = realMsg;
              return next;
            }
            if (!prev.some((m) => m.id === realMsg.id)) {
              return [...prev, realMsg];
            }
            return prev;
          });
        }
      } catch (err) {
        setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
        toast.error(err instanceof Error ? err.message : "전송 실패");
      }
    }
  };

  const handlePickFile = () => fileRef.current?.click();

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !me) return;
    if (file.size > 50 * 1024 * 1024) {
      toast.error("50MB 이하 파일만 업로드할 수 있어요.");
      return;
    }
    setSelectedFile(file);
    if (file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      setFilePreview(url);
    } else {
      setFilePreview(null);
    }
  };

  const handleCancelFile = () => {
    if (filePreview) {
      URL.revokeObjectURL(filePreview);
    }
    setSelectedFile(null);
    setFilePreview(null);
  };

  const beginEdit = (m: Message) => {
    setEditingId(m.id);
    setEditText(m.content ?? "");
    setOpenMenuId(null);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const text = editText.trim();
    if (!text) {
      toast.error("내용을 입력해 주세요.");
      return;
    }
    const prevId = editingId;
    setEditingId(null);
    try {
      await editMessage(prevId, text);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "수정 실패");
    }
  };

  const handleDelete = (m: Message) => {
    setOpenMenuId(null);
    setDeleteConfirmTarget(m);
  };

  const confirmDeleteMessage = async () => {
    if (!deleteConfirmTarget) return;
    const m = deleteConfirmTarget;
    setDeleteConfirmTarget(null);
    setMessages((prev) => prev.filter((x) => x.id !== m.id));
    try {
      await deleteMessage(m.id);
      if (conv?.pinned_message_id === m.id) {
        await pinConversationMessage(id, null);
      }
      toast.success("메시지를 삭제했어요.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "삭제 실패");
    }
  };

  const toggleBookmark = (msgId: string) => {
    setOpenMenuId(null);
    setBookmarkedIds((prev) => {
      const next = new Set(prev);
      if (next.has(msgId)) {
        next.delete(msgId);
        toast.success("북마크 해제되었습니다.");
      } else {
        next.add(msgId);
        toast.success("메시지를 북마크에 저장했어요!");
      }
      try {
        localStorage.setItem(`chat_bookmarks:${id}`, JSON.stringify(Array.from(next)));
      } catch (e) {
        console.error(e);
      }
      return next;
    });
  };

  const handleCopyText = (content: string) => {
    setOpenMenuId(null);
    if (!content) return;
    void navigator.clipboard.writeText(content);
    toast.success("클립보드에 복사되었어요.");
  };

  const handlePin = async (m: Message) => {
    setOpenMenuId(null);
    try {
      await pinConversationMessage(id, m.id);
      toast.success("메시지를 상단에 고정했어요.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "실패");
    }
  };

  const handleUnpin = async () => {
    try {
      await pinConversationMessage(id, null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "실패");
    }
  };

  const toggleMute = async () => {
    const next = !muted;
    setMuted(next);
    setShowMore(false);
    try {
      await setConversationMuted(id, next);
      toast.success(next ? "이 채팅방 알림을 껐어요." : "알림을 다시 켰어요.");
    } catch {
      setMuted(!next);
    }
  };

  const openRenameModal = () => {
    setShowMore(false);
    const current = getCustomChatName(id) || conv?.name || conv?.title || "";
    setRenameInput(current);
    setIsRenameModalOpen(true);
  };

  const handleSaveRename = async () => {
    if (isRenaming) return;
    setIsRenaming(true);
    try {
      const clean = renameInput.trim();
      await renameConversation(id, clean);
      setConv((prev) => (prev ? { ...prev, name: clean || null, title: clean || null } : prev));
      qc.invalidateQueries({ queryKey: ["conversations"] });
      toast.success("채팅방 이름이 변경되었습니다.");
      setIsRenameModalOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "변경 실패");
    } finally {
      setIsRenaming(false);
    }
  };

  const handlePickTheme = async (slug: ChatThemeSlug) => {
    setShowThemes(false);
    setShowMore(false);
    const prevSlug = conv?.theme_slug;
    setConv((prev) => (prev ? { ...prev, theme_slug: slug } : prev));
    try {
      await setConversationTheme(id, slug);
      toast.success("테마를 바꿨어요.");
    } catch (err) {
      setConv((prev) => (prev && prevSlug ? { ...prev, theme_slug: prevSlug } : prev));
      toast.error(err instanceof Error ? err.message : "테마 변경 실패");
    }
  };

  const handleLeave = () => {
    setShowMore(false);
    setLeaveRoomConfirmOpen(true);
  };

  const confirmLeaveRoom = async () => {
    setLeaveRoomConfirmOpen(false);
    qc.setQueryData<ConversationSummary[]>(["conversations"], (old) =>
      old ? old.filter((c) => c.id !== id) : [],
    );
    try {
      await leaveConversation(id);
      await qc.invalidateQueries({ queryKey: ["conversations"] });
      toast.success("채팅방에서 나갔어요.");
      navigate({ to: "/chats" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "나가기 실패");
      qc.invalidateQueries({ queryKey: ["conversations"] });
    }
  };

  const saveScheduledMessages = useCallback(
    (list: ScheduledMessage[]) => {
      setScheduledMessages(list);
      try {
        localStorage.setItem(`chat_scheduled:${id}`, JSON.stringify(list));
      } catch (e) {
        console.error(e);
      }
    },
    [id],
  );

  const handleCreateSchedule = () => {
    const text = scheduleText.trim();
    if (!text) {
      toast.error("예약 전송할 메시지 내용을 입력해 주세요.");
      return;
    }
    const targetTime = new Date(scheduleDateTime);
    if (isNaN(targetTime.getTime()) || targetTime <= new Date()) {
      toast.error("현재 시간 이후의 미래 시점을 선택해 주세요.");
      return;
    }

    const newSched: ScheduledMessage = {
      id: `sched_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      conversation_id: id,
      content: text,
      scheduled_at: targetTime.toISOString(),
      created_at: new Date().toISOString(),
    };

    const nextList = [...scheduledMessages, newSched];
    saveScheduledMessages(nextList);

    if (input.trim() === text) {
      setInput("");
    }
    setScheduleText("");
    setShowScheduleModal(false);
    toast.success(`⏰ ${format(targetTime, "M월 d일 HH:mm")}에 메시지 전송이 예약되었습니다!`);
  };

  const handleCancelSchedule = (schedId: string) => {
    const nextList = scheduledMessages.filter((s) => s.id !== schedId);
    saveScheduledMessages(nextList);
    toast.success("메시지 예약이 취소되었습니다.");
  };

  useEffect(() => {
    if (!id || !me || scheduledMessages.length === 0) return;

    const checkScheduled = async () => {
      const now = new Date();
      const due = scheduledMessages.filter((s) => new Date(s.scheduled_at) <= now);
      if (due.length === 0) return;

      const remaining = scheduledMessages.filter((s) => new Date(s.scheduled_at) > now);
      saveScheduledMessages(remaining);

      for (const item of due) {
        try {
          await sendMessage(id, item.content);
          toast.info(`⏰ 예약된 메시지가 전송되었습니다: "${item.content}"`);
          const msgs = await loadMessages(id);
          setMessages(msgs);
        } catch (err) {
          console.error("Scheduled message error", err);
          toast.error(`예약 메시지 전송 실패: ${item.content}`);
        }
      }
    };

    checkScheduled();
    const timer = setInterval(checkScheduled, 4000);
    return () => clearInterval(timer);
  }, [id, me, scheduledMessages, saveScheduledMessages]);

  const otherParticipants = participants.filter((p) => p && p.user_id !== me);
  const firstOtherProf = otherParticipants[0]?.profile;

  const convForTitle = useMemo(() => {
    return conv
      ? {
          is_group: conv.is_group,
          name: conv.name,
          title: conv.title,
          participants: participants.map((p) => p.profile).filter(Boolean) as Profile[],
        }
      : null;
  }, [conv, participants]);

  const title = getConversationTitle(convForTitle, firstOtherProf);

  const subtitle = conv?.is_group
    ? `${participants.length}명의 대화 상대`
    : `@${firstOtherProf?.username || (firstOtherProf?.email ? (firstOtherProf.email || "").split("@")[0] : "")}`;

  const unreadFor = (m: Message) => {
    if (m.sender_id !== me) return 0;
    return otherParticipants.filter(
      (p) => p.user_id !== m.sender_id && new Date(p.last_read_at) < new Date(m.created_at),
    ).length;
  };

  const getUnreadCount = (m: Message) => {
    return participants.filter(
      (p) =>
        p.user_id !== m.sender_id &&
        (!p.last_read_at || new Date(p.last_read_at) < new Date(m.created_at)),
    ).length;
  };

  const toggleReaction = (messageId: string, emoji: string) => {
    if (!me) return;
    const currentMessageReactions = reactions[messageId] || {};
    const currentEmojiUsers = currentMessageReactions[emoji] || [];

    let nextUsers: string[];
    if (currentEmojiUsers.includes(me)) {
      nextUsers = currentEmojiUsers.filter((uid) => uid !== me);
    } else {
      nextUsers = [...currentEmojiUsers, me];
    }

    const nextMessageReactions = {
      ...currentMessageReactions,
      [emoji]: nextUsers,
    };

    if (nextUsers.length === 0) {
      delete nextMessageReactions[emoji];
    }

    const nextReactions = {
      ...reactions,
      [messageId]: nextMessageReactions,
    };

    if (Object.keys(nextMessageReactions).length === 0) {
      delete nextReactions[messageId];
    }

    setReactions(nextReactions);
    try {
      localStorage.setItem(`chat_reactions:${id}`, JSON.stringify(nextReactions));
    } catch (e) {
      console.error(e);
    }

    if (channelRef.current) {
      channelRef.current.send({
        type: "broadcast",
        event: "reaction_update",
        payload: {
          messageId,
          reactions: nextMessageReactions,
        },
      });
    }
  };

  const typingUsers = Array.from(typing)
    .map((uid) => getUserDisplayName(profileMap.get(uid)))
    .filter(Boolean) as string[];

  const filteredMessages = useMemo(() => {
    const q = searchQ.trim().toLowerCase();
    if (!q) return messages;
    return messages.filter((m) => (m.content ?? "").toLowerCase().includes(q));
  }, [messages, searchQ]);

  const activeTheme = getChatTheme(conv?.theme_slug ?? "mint");
  const isDarkTheme = activeTheme.slug === "midnight-paris" || activeTheme.slug === "lake-tahoe";

  return (
    <div
      className="mx-auto flex h-[100dvh] max-w-md flex-col bg-background relative overflow-hidden"
      style={activeTheme.vars as React.CSSProperties}
      data-theme-dark={isDarkTheme ? "true" : "false"}
    >
      {/* Header */}
      <header className="relative z-50 flex shrink-0 items-center gap-2 border-b border-border bg-background/90 px-2 py-3 pt-safe backdrop-blur text-foreground">
        <Link to="/chats" className="rounded-full p-1.5 hover:bg-secondary text-foreground">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="relative">
          {conv?.is_group ? (
            <div className="flex h-9 w-9 aspect-square shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Users className="h-4 w-4" />
            </div>
          ) : (
            <Avatar
              name={getUserDisplayName(firstOtherProf)}
              url={firstOtherProf?.avatar_url}
              size={36}
            />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 truncate text-sm font-semibold text-foreground">
            {title}
            {muted && <BellOff className="h-3 w-3 shrink-0 text-muted-foreground" />}
          </div>
          <div className="truncate text-[11px] text-muted-foreground">{subtitle}</div>
        </div>
        <button
          onClick={() => setShowSearch((s) => !s)}
          className={`rounded-full p-2 hover:bg-secondary text-foreground ${showSearch ? "bg-secondary" : ""}`}
          title="검색"
        >
          <Search className="h-4 w-4" />
        </button>
        <button
          onClick={() => setShowSidebar((s) => !s)}
          className={`rounded-full p-2 hover:bg-secondary text-foreground ${showSidebar ? "bg-secondary" : ""}`}
          title="미디어·파일 모아보기"
        >
          <FolderOpen className="h-4 w-4" />
        </button>
        <div className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation();
              e.nativeEvent.stopImmediatePropagation();
              setShowMore((s) => !s);
            }}
            className={`rounded-full p-2 hover:bg-secondary text-foreground ${showMore ? "bg-secondary" : ""}`}
            title="더보기"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
          {showMore && (
            <>
              {/* Invisible backdrop to dismiss menu on click outside */}
              <div
                className="fixed inset-0 z-40 bg-black/10 backdrop-blur-[1px]"
                onClick={() => setShowMore(false)}
              />
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  e.nativeEvent.stopImmediatePropagation();
                }}
                className="absolute right-0 top-full z-50 mt-1 w-72 max-h-[85vh] overflow-y-auto custom-scrollbar rounded-xl border border-border bg-popover shadow-2xl text-foreground animate-in fade-in zoom-in-95 duration-150"
              >
                <button
                  onClick={toggleMute}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm text-foreground hover:bg-secondary transition"
                >
                  {muted ? (
                    <>
                      <Bell className="h-4 w-4 text-foreground" />
                      <span className="text-foreground">알림 켜기</span>
                    </>
                  ) : (
                    <>
                      <BellOff className="h-4 w-4 text-foreground" />
                      <span className="text-foreground">알림 끄기</span>
                    </>
                  )}
                </button>
                <button
                  onClick={openRenameModal}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm text-foreground hover:bg-secondary transition"
                >
                  <Pencil className="h-4 w-4 text-foreground" />
                  <span className="text-foreground">이름 변경</span>
                </button>

                {/* Inline Theme Picker */}
                <button
                  onClick={() => setShowThemes((s) => !s)}
                  className="flex w-full items-center justify-between border-t border-border px-3.5 py-2.5 text-left text-sm text-foreground hover:bg-secondary transition"
                >
                  <div className="flex items-center gap-2.5">
                    <Palette className="h-4 w-4 text-foreground" />
                    <span className="text-foreground font-medium">테마 변경</span>
                  </div>
                  <ChevronDown
                    className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${
                      showThemes ? "rotate-180" : ""
                    }`}
                  />
                </button>
                {showThemes && (
                  <div className="border-t border-border bg-secondary/30 p-2.5 text-foreground animate-in fade-in duration-150">
                    <div className="grid grid-cols-3 gap-2">
                      {CHAT_THEMES.map((t) => {
                        const active = conv?.theme_slug === t.slug;
                        return (
                          <button
                            key={t.slug}
                            onClick={() => handlePickTheme(t.slug)}
                            className={`flex flex-col items-center gap-1 rounded-xl border p-1.5 text-[10px] font-medium transition text-foreground ${
                              active
                                ? "border-primary bg-background shadow-sm ring-2 ring-primary/40"
                                : "border-border/60 hover:border-border hover:bg-background/80"
                            }`}
                          >
                            <span
                              className="relative flex h-7 w-7 items-center justify-center rounded-full ring-1 ring-black/10 shadow-sm"
                              style={{ background: t.swatch }}
                            >
                              {active && <Check className="h-3.5 w-3.5 text-white drop-shadow" />}
                            </span>
                            <span className="text-foreground truncate w-full text-center leading-tight">
                              {t.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <button
                  onClick={() => {
                    setShowMore(false);
                    setShowScheduleListModal(true);
                  }}
                  className="flex w-full items-center gap-2.5 border-t border-border px-3.5 py-2.5 text-left text-sm text-foreground hover:bg-secondary transition"
                >
                  <Clock className="h-4 w-4 text-amber-500" />
                  <span className="text-foreground">
                    예약 메시지 관리{" "}
                    {scheduledMessages.length > 0 && `(${scheduledMessages.length})`}
                  </span>
                </button>
                <button
                  onClick={handleLeave}
                  className="flex w-full items-center gap-2.5 border-t border-border px-3.5 py-2.5 text-left text-sm text-destructive hover:bg-secondary transition"
                >
                  <LogOut className="h-4 w-4 text-destructive" />
                  <span className="text-destructive font-semibold">채팅방 나가기</span>
                </button>
              </div>
            </>
          )}
        </div>
      </header>

      {showSearch && (
        <div className="shrink-0 border-b border-border bg-background px-3 py-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              autoFocus
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              placeholder="이 채팅방에서 검색"
              className={`w-full rounded-full border border-input bg-secondary/40 py-2 pl-9 pr-9 text-sm outline-none focus:ring-2 focus:ring-ring ${
                isDarkTheme
                  ? "text-white caret-white placeholder:text-slate-200/90"
                  : "text-foreground placeholder:text-muted-foreground"
              }`}
            />
            {searchQ && (
              <button
                onClick={() => setSearchQ("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 hover:bg-secondary"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {pinnedMsg && (
        <div className="flex shrink-0 items-start gap-2 border-b border-border bg-primary/10 px-3 py-2">
          <Pin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-semibold uppercase text-primary">고정된 메시지</div>
            <div className="truncate text-xs text-foreground">
              {pinnedMsg.content ||
                (pinnedMsg.attachment_type?.startsWith("image/")
                  ? "📷 사진"
                  : pinnedMsg.attachment_type?.startsWith("video/")
                    ? "🎬 동영상"
                    : pinnedMsg.attachment_name
                      ? `📎 ${pinnedMsg.attachment_name}`
                      : "")}
            </div>
          </div>
          <button
            onClick={handleUnpin}
            className="rounded-full p-1 text-muted-foreground hover:bg-secondary"
            title="고정 해제"
          >
            <PinOff className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Messages */}
      <div
        ref={scrollRef}
        onScroll={(e) => {
          const target = e.currentTarget;
          const isUp = target.scrollHeight - target.scrollTop - target.clientHeight > 150;
          setShowScrollBottomBtn(isUp);
        }}
        className="flex-1 overflow-y-auto custom-scrollbar bg-background px-3 py-4 relative"
      >
        {loading ? (
          <div className="text-center text-sm text-muted-foreground">Loading…</div>
        ) : filteredMessages.length === 0 ? (
          <div className="mt-16 text-center text-sm text-muted-foreground">
            {searchQ ? "검색 결과가 없어요." : "인사부터 시작해 볼까요?"}
          </div>
        ) : (
          <ul className="space-y-1">
            {filteredMessages.map((m, i) => {
              const mine = m.sender_id === me;
              const prev = filteredMessages[i - 1];
              const showSender =
                conv?.is_group && !mine && (!prev || prev.sender_id !== m.sender_id);
              const prof = profileMap.get(m.sender_id);
              const unread = unreadFor(m);
              const isLastFromMe =
                mine &&
                (i === filteredMessages.length - 1 || filteredMessages[i + 1].sender_id !== me);
              const isEditing = editingId === m.id;
              const isMenuOpen = openMenuId === m.id;

              return (
                <li key={m.id} className={`group flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`flex max-w-[85%] flex-col ${mine ? "items-end" : "items-start"}`}
                  >
                    {showSender && (
                      <div className="mb-0.5 pl-3 text-[11px] font-medium text-muted-foreground">
                        {getUserDisplayName(prof)}
                      </div>
                    )}

                    <div
                      className={`flex items-end gap-1.5 ${mine ? "flex-row" : "flex-row-reverse"}`}
                    >
                      {/* Hover menu triggers */}
                      <div
                        className={`flex items-center gap-0.5 transition-opacity ${
                          isMenuOpen || activeEmojiMenuId === m.id
                            ? "opacity-100"
                            : "opacity-0 group-hover:opacity-100"
                        }`}
                      >
                        {/* Reaction Trigger Button */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            e.nativeEvent.stopImmediatePropagation();
                            setActiveEmojiMenuId(activeEmojiMenuId === m.id ? null : m.id);
                          }}
                          className={`rounded-full p-1 text-muted-foreground hover:bg-secondary ${
                            activeEmojiMenuId === m.id
                              ? "bg-secondary text-foreground opacity-100"
                              : ""
                          }`}
                          title="반응 추가"
                        >
                          <Smile className="h-3.5 w-3.5" />
                        </button>
                        {/* More Menu Button */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            e.nativeEvent.stopImmediatePropagation();
                            setOpenMenuId(isMenuOpen ? null : m.id);
                          }}
                          className={`rounded-full p-1 text-muted-foreground hover:bg-secondary ${
                            isMenuOpen ? "bg-secondary text-foreground opacity-100" : ""
                          }`}
                          title="메뉴"
                        >
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      {/* Time & Unread Count Indicator */}
                      <div
                        className={`flex flex-col items-${mine ? "end" : "start"} text-[10px] select-none shrink-0 mb-1`}
                      >
                        {getUnreadCount(m) > 0 && (
                          <span
                            className={`font-bold ${isDarkTheme ? "text-[#FEF08A]" : "text-amber-500"}`}
                          >
                            {getUnreadCount(m)}
                          </span>
                        )}
                        <span className="text-muted-foreground/50 text-[9px] scale-90 origin-bottom-right">
                          {new Date(m.created_at).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: false,
                          })}
                        </span>
                      </div>

                      <div
                        className="relative"
                        onMouseEnter={() => setHoveredMessageId(m.id)}
                        onMouseLeave={() => {
                          setHoveredMessageId(null);
                          setActiveEmojiMenuId(null);
                        }}
                      >
                        {/* Emoji Reactions Selection Bar */}
                        {(activeEmojiMenuId === m.id || hoveredMessageId === m.id) && (
                          <div
                            className={`absolute z-50 -top-11 ${
                              mine ? "right-0" : "left-0"
                            } flex items-center gap-0.5 rounded-full border border-border bg-popover/95 p-1 shadow-xl transition-all scale-100 opacity-100`}
                          >
                            {["👍", "❤️", "🔥", "😂", "😮", "😢"].map((emoji) => {
                              const hasReacted =
                                reactions[m.id]?.[emoji]?.includes(me || "") ?? false;
                              return (
                                <button
                                  key={emoji}
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleReaction(m.id, emoji);
                                    setActiveEmojiMenuId(null);
                                  }}
                                  className={`h-7 w-7 rounded-full text-base flex items-center justify-center transition-transform hover:scale-125 ${
                                    hasReacted ? "bg-primary/20 scale-110" : "hover:bg-secondary"
                                  }`}
                                >
                                  {emoji}
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {isEditing ? (
                          <div className="flex flex-col gap-1 rounded-3xl bg-bubble-out p-2">
                            <textarea
                              value={editText}
                              onChange={(e) => setEditText(e.target.value)}
                              rows={2}
                              className={`min-w-[200px] rounded-xl border border-input bg-background px-2 py-1 text-sm outline-none ${
                                isDarkTheme
                                  ? "text-white caret-white placeholder:text-slate-200/90"
                                  : "text-foreground placeholder:text-muted-foreground"
                              }`}
                            />
                            <div className="flex justify-end gap-1">
                              <button
                                onClick={() => setEditingId(null)}
                                className="rounded-full px-2 py-1 text-xs text-bubble-out-foreground/80 hover:bg-black/10"
                              >
                                취소
                              </button>
                              <button
                                onClick={saveEdit}
                                className="rounded-full bg-background px-2 py-1 text-xs font-semibold text-primary"
                              >
                                저장
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div
                            className={`overflow-hidden rounded-3xl cursor-pointer ${
                              m.attachment_url && !m.content ? "p-0" : "px-3.5 py-2"
                            } text-[15px] leading-snug ${
                              mine
                                ? "bg-bubble-out text-bubble-out-foreground"
                                : "bg-bubble-in text-bubble-in-foreground"
                            } select-none`}
                            onTouchStart={() => {
                              const t = setTimeout(() => {
                                setActiveEmojiMenuId(m.id);
                              }, 400);
                              longPressTimersRef.current.set(m.id, t);
                            }}
                            onTouchEnd={() => {
                              const t = longPressTimersRef.current.get(m.id);
                              if (t) {
                                clearTimeout(t);
                                longPressTimersRef.current.delete(m.id);
                              }
                            }}
                            onTouchMove={() => {
                              const t = longPressTimersRef.current.get(m.id);
                              if (t) {
                                clearTimeout(t);
                                longPressTimersRef.current.delete(m.id);
                              }
                            }}
                          >
                            {m.attachment_url && (
                              <div className={m.content ? "mb-1" : ""}>
                                <AttachmentView
                                  m={m}
                                  onOpenImage={(url, name) => setLightbox({ url, name })}
                                  isDarkTheme={isDarkTheme}
                                />
                              </div>
                            )}
                            {m.content && (
                              <div className={m.attachment_url ? "px-3.5 pb-2" : ""}>
                                {m.content}
                              </div>
                            )}
                            {bookmarkedIds.has(m.id) && (
                              <div className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-amber-500">
                                <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
                                <span>북마크됨</span>
                              </div>
                            )}
                            {m.edited_at && (
                              <div
                                className={`mt-0.5 text-[10px] opacity-60 ${m.attachment_url && !m.content ? "hidden" : ""}`}
                              >
                                (수정됨)
                              </div>
                            )}
                          </div>
                        )}

                        {isMenuOpen && (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className={`absolute z-30 mt-1 w-36 overflow-hidden rounded-xl border border-border bg-popover text-foreground shadow-xl ${
                              mine ? "right-0" : "left-0"
                            } top-full animate-in fade-in zoom-in-95 duration-150`}
                          >
                            <button
                              onClick={() => handlePin(m)}
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-secondary"
                            >
                              <Pin className="h-3.5 w-3.5" /> 상단 고정
                            </button>
                            {m.content && (
                              <button
                                onClick={() => handleCopyText(m.content ?? "")}
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-secondary"
                              >
                                <Copy className="h-3.5 w-3.5" /> 텍스트 복사
                              </button>
                            )}
                            <button
                              onClick={() => toggleBookmark(m.id)}
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-secondary"
                            >
                              <Star
                                className={`h-3.5 w-3.5 ${bookmarkedIds.has(m.id) ? "fill-amber-500 text-amber-500" : ""}`}
                              />
                              {bookmarkedIds.has(m.id) ? "북마크 해제" : "북마크 저장"}
                            </button>
                            {mine && m.content !== null && !m.attachment_url && (
                              <button
                                onClick={() => beginEdit(m)}
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-secondary"
                              >
                                <Pencil className="h-3.5 w-3.5" /> 수정
                              </button>
                            )}
                            <button
                              onClick={() => handleDelete(m)}
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-destructive hover:bg-secondary"
                            >
                              <Trash2 className="h-3.5 w-3.5" /> 삭제
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Reactions list */}
                    {reactions[m.id] && Object.keys(reactions[m.id]).length > 0 && (
                      <div
                        className={`flex flex-wrap gap-1 mt-1.5 ${mine ? "justify-end" : "justify-start"}`}
                      >
                        {Object.entries(reactions[m.id]).map(([emoji, users]) => {
                          if (!users || users.length === 0) return null;
                          const hasReacted = users.includes(me || "");
                          return (
                            <button
                              key={emoji}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleReaction(m.id, emoji);
                              }}
                              className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs transition-all border select-none ${
                                hasReacted
                                  ? isDarkTheme
                                    ? "bg-primary/35 border-primary/60 text-white"
                                    : "bg-primary/15 border-primary/30 text-primary"
                                  : isDarkTheme
                                    ? "bg-slate-800/80 hover:bg-slate-700/80 border-slate-700/50 text-slate-300"
                                    : "bg-secondary/60 hover:bg-secondary border-border/60 text-muted-foreground"
                              }`}
                            >
                              <span className="text-sm">{emoji}</span>
                              <span className="text-[10px] font-semibold">{users.length}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}

            {typingUsers.length > 0 && !searchQ && (
              <li className="flex justify-start">
                <div className="flex flex-col items-start">
                  <div className="rounded-3xl bg-bubble-in px-4 py-2.5">
                    <div className="flex items-center gap-1">
                      <span className="typing-dot h-1.5 w-1.5 rounded-full bg-muted-foreground" />
                      <span className="typing-dot h-1.5 w-1.5 rounded-full bg-muted-foreground" />
                      <span className="typing-dot h-1.5 w-1.5 rounded-full bg-muted-foreground" />
                    </div>
                  </div>
                  <div className="mt-0.5 pl-3 text-[10px] text-muted-foreground">
                    {typingUsers.slice(0, 2).join(", ")}
                    {typingUsers.length > 2 ? ` +${typingUsers.length - 2}` : ""} 입력 중…
                  </div>
                </div>
              </li>
            )}
          </ul>
        )}
      </div>

      {/* Composer */}
      <form
        onSubmit={handleSend}
        className="flex shrink-0 flex-col border-t border-border bg-background px-3 py-2 pb-safe"
      >
        {/* Pending Scheduled Messages Banner */}
        {scheduledMessages.length > 0 && (
          <div className="mb-2 flex items-center justify-between rounded-xl bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 text-xs text-amber-700 dark:text-amber-300">
            <div className="flex items-center gap-1.5 font-semibold">
              <Clock className="h-3.5 w-3.5 animate-pulse text-amber-500" />
              <span>예약된 메시지 {scheduledMessages.length}개</span>
            </div>
            <button
              type="button"
              onClick={() => setShowScheduleListModal(true)}
              className="rounded-lg bg-amber-500/20 px-2.5 py-0.5 font-bold hover:bg-amber-500/30 transition text-[11px]"
            >
              목록 보기
            </button>
          </div>
        )}

        {/* File Preview Thumbnail inside Composer */}
        {selectedFile && (
          <div className="mb-2 flex items-center justify-between rounded-xl bg-secondary/50 p-2 text-foreground">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              {filePreview ? (
                <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-border bg-black/10">
                  <img src={filePreview} alt="preview" className="h-full w-full object-cover" />
                </div>
              ) : (
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <FileText className="h-6 w-6" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div
                  className={`truncate text-xs font-semibold ${isDarkTheme ? "text-white" : "text-foreground"}`}
                >
                  {selectedFile.name}
                </div>
                <div
                  className={`text-[10px] opacity-75 ${isDarkTheme ? "text-slate-200" : "text-muted-foreground"}`}
                >
                  {formatBytes(selectedFile.size)}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={handleCancelFile}
              className={`rounded-full p-1.5 hover:bg-secondary ${
                isDarkTheme
                  ? "text-white hover:text-red-400"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              title="첨부 취소"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="flex items-end gap-1.5">
          <button
            type="button"
            onClick={handlePickFile}
            disabled={uploading}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground hover:text-foreground disabled:opacity-60"
            title="사진·동영상·파일 첨부"
          >
            {uploading ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            ) : (
              <Paperclip className="h-4 w-4" />
            )}
          </button>
          <button
            type="button"
            onClick={() => {
              setScheduleText(input.trim());
              const d = new Date(Date.now() + 10 * 60 * 1000);
              const year = d.getFullYear();
              const month = String(d.getMonth() + 1).padStart(2, "0");
              const day = String(d.getDate()).padStart(2, "0");
              const hours = String(d.getHours()).padStart(2, "0");
              const minutes = String(d.getMinutes()).padStart(2, "0");
              setScheduleDateTime(`${year}-${month}-${day}T${hours}:${minutes}`);
              setShowScheduleModal(true);
            }}
            disabled={uploading}
            className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground hover:text-amber-500 transition disabled:opacity-60"
            title="메시지 예약 전송"
          >
            <Clock className="h-4 w-4" />
            {scheduledMessages.length > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[9px] font-bold text-white shadow">
                {scheduledMessages.length}
              </span>
            )}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.txt"
            className="hidden"
            onChange={handleFile}
          />
          <input
            value={input}
            onChange={(e) => handleInputChange(e.target.value)}
            placeholder={uploading ? "업로드 중…" : "메시지"}
            disabled={uploading}
            className={`min-w-0 flex-1 rounded-full border border-input bg-background px-4 py-2.5 text-[15px] outline-none focus:ring-2 focus:ring-ring disabled:opacity-60 ${
              isDarkTheme
                ? "text-white caret-white placeholder:text-slate-200/90"
                : "text-foreground placeholder:text-muted-foreground"
            }`}
          />
          <button
            type="submit"
            disabled={(!input.trim() && !selectedFile) || uploading}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </form>

      {/* Floating Scroll to Bottom button */}
      {showScrollBottomBtn && (
        <button
          onClick={() => {
            scrollRef.current?.scrollTo({
              top: scrollRef.current.scrollHeight,
              behavior: "smooth",
            });
          }}
          className="absolute bottom-20 right-4 z-30 flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl transition-all hover:scale-110 active:scale-95 border border-primary-foreground/20 animate-in fade-in slide-in-from-bottom-2"
          title="맨 아래로 스크롤"
        >
          <ChevronDown className="h-5 w-5" />
        </button>
      )}

      {/* Right Sidebar: Media, Files & Bookmarks Archive */}
      {showSidebar && (
        <div
          className={`absolute inset-y-0 right-0 z-40 flex w-[85%] flex-col border-l border-border bg-popover shadow-2xl transition-all duration-300 ease-in-out ${
            isDarkTheme ? "text-white" : "text-foreground"
          }`}
        >
          {/* Sidebar Header */}
          <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-3.5 bg-secondary/10">
            <h3 className={`text-sm font-bold ${isDarkTheme ? "text-white" : "text-foreground"}`}>
              보관함
            </h3>
            <button
              onClick={() => setShowSidebar(false)}
              className={`rounded-full p-1.5 hover:bg-secondary ${
                isDarkTheme
                  ? "text-white hover:text-slate-300"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Tab buttons */}
          <div className="flex shrink-0 border-b border-border bg-background p-1.5 gap-1">
            <button
              onClick={() => setSidebarTab("media")}
              className={`flex-1 rounded-lg py-1.5 text-center text-xs font-semibold transition ${
                sidebarTab === "media"
                  ? "bg-primary text-primary-foreground"
                  : isDarkTheme
                    ? "text-slate-200 hover:bg-secondary/40 hover:text-white"
                    : "text-muted-foreground hover:bg-secondary/40 hover:text-foreground"
              }`}
            >
              미디어
            </button>
            <button
              onClick={() => setSidebarTab("files")}
              className={`flex-1 rounded-lg py-1.5 text-center text-xs font-semibold transition ${
                sidebarTab === "files"
                  ? "bg-primary text-primary-foreground"
                  : isDarkTheme
                    ? "text-slate-200 hover:bg-secondary/40 hover:text-white"
                    : "text-muted-foreground hover:bg-secondary/40 hover:text-foreground"
              }`}
            >
              파일
            </button>
            <button
              onClick={() => setSidebarTab("bookmarks")}
              className={`flex-1 rounded-lg py-1.5 text-center text-xs font-semibold transition ${
                sidebarTab === "bookmarks"
                  ? "bg-primary text-primary-foreground"
                  : isDarkTheme
                    ? "text-slate-200 hover:bg-secondary/40 hover:text-white"
                    : "text-muted-foreground hover:bg-secondary/40 hover:text-foreground"
              }`}
            >
              북마크
            </button>
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto custom-scrollbar bg-background p-3">
            {sidebarTab === "media" ? (
              mediaMessages.length === 0 ? (
                <div className="flex h-40 flex-col items-center justify-center text-center">
                  <div className="mb-2 rounded-full bg-secondary p-3 text-muted-foreground/60">
                    <FileText className="h-5 w-5" />
                  </div>
                  <p
                    className={`text-xs ${isDarkTheme ? "text-slate-300" : "text-muted-foreground"}`}
                  >
                    주고받은 미디어(사진·영상)가 없습니다.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {mediaMessages.map((m) => {
                    const isImg = m.attachment_type?.startsWith("image/");
                    return (
                      <div
                        key={m.id}
                        className="group relative aspect-square overflow-hidden rounded-xl border border-border bg-black/15 cursor-pointer hover:border-primary transition"
                        onClick={() => {
                          if (isImg && m.attachment_url) {
                            setLightbox({
                              url: m.attachment_url,
                              name: m.attachment_name ?? "image",
                            });
                          }
                        }}
                      >
                        {isImg ? (
                          <img
                            src={m.attachment_url!}
                            alt={m.attachment_name ?? "media"}
                            className="h-full w-full object-cover transition duration-200 hover:scale-105"
                          />
                        ) : (
                          <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-1 bg-black/30">
                            <span className="rounded-full bg-black/40 p-1 text-white">🎬</span>
                            <span className="text-[8px] text-white truncate max-w-full">
                              {m.attachment_name}
                            </span>
                          </div>
                        )}
                        <a
                          href={m.attachment_url!}
                          download={m.attachment_name ?? "file"}
                          onClick={(e) => e.stopPropagation()}
                          className="absolute bottom-1 right-1 rounded-full bg-black/65 p-1 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80"
                          title="다운로드"
                        >
                          <Download className="h-3 w-3" />
                        </a>
                      </div>
                    );
                  })}
                </div>
              )
            ) : sidebarTab === "files" ? (
              fileMessages.length === 0 ? (
                <div className="flex h-40 flex-col items-center justify-center text-center">
                  <div className="mb-2 rounded-full bg-secondary p-3 text-muted-foreground/60">
                    <FileText className="h-5 w-5" />
                  </div>
                  <p
                    className={`text-xs ${isDarkTheme ? "text-slate-300" : "text-muted-foreground"}`}
                  >
                    주고받은 파일이 없습니다.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {fileMessages.map((m) => {
                    const name = m.attachment_name ?? "file";
                    const sizeStr = m.attachment_size ? formatBytes(m.attachment_size) : "";
                    const dateStr = format(new Date(m.created_at), "yy.MM.dd HH:mm");
                    return (
                      <div
                        key={m.id}
                        className={`flex items-center gap-2.5 rounded-xl border border-border p-2.5 transition bg-secondary/25 hover:bg-secondary/45 ${
                          isDarkTheme
                            ? "hover:border-slate-500"
                            : "hover:border-muted-foreground/40"
                        }`}
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                          <FileText className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4
                            className={`truncate text-xs font-bold leading-tight ${isDarkTheme ? "text-white" : "text-foreground"}`}
                          >
                            {name}
                          </h4>
                          <div
                            className={`mt-1 flex items-center gap-1.5 text-[9px] opacity-75 ${isDarkTheme ? "text-slate-200" : "text-muted-foreground"}`}
                          >
                            <span>{sizeStr}</span>
                            <span>•</span>
                            <span>{dateStr}</span>
                          </div>
                        </div>
                        <a
                          href={m.attachment_url!}
                          download={name}
                          className={`rounded-full p-1.5 hover:bg-secondary transition ${
                            isDarkTheme
                              ? "text-white hover:text-primary"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                          title="다운로드"
                        >
                          <Download className="h-4 w-4" />
                        </a>
                      </div>
                    );
                  })}
                </div>
              )
            ) : (
              (() => {
                const bookmarkedMsgs = messages.filter((m) => bookmarkedIds.has(m.id));
                if (bookmarkedMsgs.length === 0) {
                  return (
                    <div className="flex h-40 flex-col items-center justify-center text-center p-4">
                      <div className="mb-2 rounded-full bg-amber-500/10 p-3 text-amber-500">
                        <Star className="h-5 w-5" />
                      </div>
                      <p
                        className={`text-xs font-medium ${isDarkTheme ? "text-slate-300" : "text-foreground"}`}
                      >
                        북마크된 메시지가 없습니다.
                      </p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        중요한 메시지를 클릭하여 북마크에 저장해 보세요.
                      </p>
                    </div>
                  );
                }
                return (
                  <div className="flex flex-col gap-2">
                    {bookmarkedMsgs.map((m) => {
                      const prof = profileMap.get(m.sender_id);
                      return (
                        <div
                          key={m.id}
                          className="group relative flex flex-col gap-1.5 rounded-xl border border-border p-3 transition bg-secondary/30 hover:bg-secondary/50"
                        >
                          <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground">
                            <span>{getUserDisplayName(prof)}</span>
                            <span>{format(new Date(m.created_at), "MM.dd HH:mm")}</span>
                          </div>
                          <p className="text-xs text-foreground leading-relaxed">
                            {m.content || "[첨부파일]"}
                          </p>
                          <div className="flex items-center justify-end gap-2 mt-1">
                            {m.content && (
                              <button
                                onClick={() => handleCopyText(m.content ?? "")}
                                className="flex items-center gap-1 rounded-full bg-background px-2.5 py-1 text-[10px] font-medium text-foreground hover:bg-secondary border border-border shadow-sm"
                              >
                                <Copy className="h-3 w-3" /> 복사
                              </button>
                            )}
                            <button
                              onClick={() => toggleBookmark(m.id)}
                              className="flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-1 text-[10px] font-semibold text-amber-600 hover:bg-amber-500/20"
                            >
                              <X className="h-3 w-3" /> 해제
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()
            )}
          </div>
        </div>
      )}

      {/* Image lightbox */}
      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
        >
          <button
            className="absolute right-3 top-3 rounded-full bg-white/10 p-2 text-white"
            onClick={() => setLightbox(null)}
          >
            <X className="h-5 w-5" />
          </button>
          <a
            href={lightbox.url}
            download={lightbox.name}
            onClick={(e) => e.stopPropagation()}
            className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-white/10 px-4 py-2 text-sm text-white"
          >
            <Download className="h-4 w-4" /> 다운로드
          </a>
          <img
            src={lightbox.url}
            alt={lightbox.name}
            onClick={(e) => e.stopPropagation()}
            className="max-h-full max-w-full object-contain"
          />
        </div>
      )}

      {/* Custom Theme Selector Modal */}
      {isRenameModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-xs sm:max-w-sm rounded-2xl border border-border bg-popover p-5 shadow-2xl text-foreground animate-in zoom-in-95 duration-200 space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <Pencil className="h-4 w-4 text-primary" />
                <h3 className="font-bold text-base">채팅방 이름 변경</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsRenameModalOpen(false)}
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
                onClick={() => setIsRenameModalOpen(false)}
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

      {showThemeModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-popover p-5 shadow-2xl text-foreground animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-border pb-3 mb-3">
              <div className="flex items-center gap-2">
                <Palette className="h-5 w-5 text-primary" />
                <h3 className="font-bold text-base">채팅방 테마 변경</h3>
              </div>
              <button
                onClick={() => setShowThemeModal(false)}
                className="rounded-full p-1.5 hover:bg-secondary text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              채팅창 배경과 말풍선 테마 스킨을 선택해 보세요.
            </p>
            <div className="grid grid-cols-2 gap-2.5 max-h-[60vh] overflow-y-auto pr-1">
              {CHAT_THEMES.map((t) => {
                const active = conv?.theme_slug === t.slug;
                return (
                  <button
                    key={t.slug}
                    onClick={() => {
                      handlePickTheme(t.slug);
                      setShowThemeModal(false);
                    }}
                    className={`flex items-center gap-3 rounded-xl border p-3 text-left transition hover:scale-[1.02] ${
                      active
                        ? "border-primary bg-primary/10 ring-2 ring-primary/30"
                        : "border-border bg-card hover:bg-secondary/60"
                    }`}
                  >
                    <span
                      className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-1 ring-black/10 shadow-sm"
                      style={{ background: t.swatch }}
                    >
                      {active && <Check className="h-4 w-4 text-white drop-shadow" />}
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-foreground truncate">{t.label}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {active ? "적용됨" : "선택하기"}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Delete Message Confirm Modal */}
      {deleteConfirmTarget && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-xs rounded-2xl border border-border bg-popover p-5 shadow-2xl text-foreground text-center animate-in zoom-in-95 duration-200">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <Trash2 className="h-6 w-6" />
            </div>
            <h3 className="font-bold text-base mb-1">메시지 삭제</h3>
            <p className="text-xs text-muted-foreground mb-5">
              이 메시지를 삭제할까요? 상대방 화면에서도 삭제 처리됩니다.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setDeleteConfirmTarget(null)}
                className="flex-1 rounded-xl border border-border py-2.5 text-xs font-semibold hover:bg-secondary transition"
              >
                취소
              </button>
              <button
                onClick={confirmDeleteMessage}
                className="flex-1 rounded-xl bg-destructive py-2.5 text-xs font-semibold text-destructive-foreground hover:bg-destructive/90 transition shadow-sm"
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Leave Room Confirm Modal */}
      {leaveRoomConfirmOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-xs rounded-2xl border border-border bg-popover p-5 shadow-2xl text-foreground text-center animate-in zoom-in-95 duration-200">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <LogOut className="h-6 w-6" />
            </div>
            <h3 className="font-bold text-base mb-1">채팅방 나가기</h3>
            <p className="text-xs text-muted-foreground mb-5">
              정말 이 채팅방에서 나갈까요? 채팅 목록에서 삭제됩니다.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setLeaveRoomConfirmOpen(false)}
                className="flex-1 rounded-xl border border-border py-2.5 text-xs font-semibold hover:bg-secondary transition"
              >
                취소
              </button>
              <button
                onClick={confirmLeaveRoom}
                className="flex-1 rounded-xl bg-destructive py-2.5 text-xs font-semibold text-destructive-foreground hover:bg-destructive/90 transition shadow-sm"
              >
                나가기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Schedule Message Create Modal */}
      {showScheduleModal && (
        <ScheduleModalContent
          scheduleDateTime={scheduleDateTime}
          setScheduleDateTime={setScheduleDateTime}
          scheduleText={scheduleText}
          setScheduleText={setScheduleText}
          onClose={() => setShowScheduleModal(false)}
          onSubmit={handleCreateSchedule}
        />
      )}

      {/* Schedule Message List Modal */}
      {showScheduleListModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-popover p-5 shadow-2xl text-foreground animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-border pb-3 mb-3">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-amber-500" />
                <h3 className="font-bold text-base">예약 메시지 목록</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowScheduleListModal(false)}
                className="rounded-full p-1.5 hover:bg-secondary text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {scheduledMessages.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                <Clock className="mx-auto h-8 w-8 text-muted-foreground/40 mb-2" />
                대기 중인 예약 메시지가 없습니다.
              </div>
            ) : (
              <div className="max-h-[50vh] overflow-y-auto space-y-2.5 pr-1 custom-scrollbar">
                {scheduledMessages.map((s) => {
                  const targetDate = new Date(s.scheduled_at);
                  return (
                    <div
                      key={s.id}
                      className="rounded-xl border border-border bg-secondary/30 p-3 flex flex-col gap-1.5"
                    >
                      <div className="flex items-center justify-between text-[11px] font-bold text-amber-600 dark:text-amber-400">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" />
                          <span>{format(targetDate, "yyyy.MM.dd HH:mm")} 전송 예정</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleCancelSchedule(s.id)}
                          className="text-[10px] text-destructive hover:underline font-semibold"
                        >
                          취소
                        </button>
                      </div>
                      <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">
                        {s.content}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="mt-4 pt-3 border-t border-border flex justify-between items-center">
              <button
                type="button"
                onClick={() => {
                  setShowScheduleListModal(false);
                  setShowScheduleModal(true);
                }}
                className="rounded-xl bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 transition"
              >
                + 새 예약 작성
              </button>
              <button
                type="button"
                onClick={() => setShowScheduleListModal(false)}
                className="rounded-xl border border-border px-4 py-2 text-xs font-semibold hover:bg-secondary transition"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      <FormatHelper />
    </div>
  );
}

function FormatHelper() {
  useEffect(() => {
    void format(new Date(), "HH:mm");
  }, []);
  return null;
}

function ScheduleModalContent({
  scheduleDateTime,
  setScheduleDateTime,
  scheduleText,
  setScheduleText,
  onClose,
  onSubmit,
}: {
  scheduleDateTime: string;
  setScheduleDateTime: (val: string) => void;
  scheduleText: string;
  setScheduleText: (val: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const currentObj = useMemo(() => {
    const d = new Date(scheduleDateTime);
    return isNaN(d.getTime()) ? new Date(Date.now() + 10 * 60 * 1000) : d;
  }, [scheduleDateTime]);

  const yearStr = currentObj.getFullYear();
  const monthStr = String(currentObj.getMonth() + 1).padStart(2, "0");
  const dayStr = String(currentObj.getDate()).padStart(2, "0");
  const dateOnlyStr = `${yearStr}-${monthStr}-${dayStr}`;

  const h24 = currentObj.getHours();
  const isPm = h24 >= 12;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const minute = currentObj.getMinutes();

  const updateTimeComponents = (
    newDateStr: string,
    newIsPm: boolean,
    newH12: number,
    newMin: number,
  ) => {
    let targetDateObj = new Date(`${newDateStr}T12:00:00`);
    if (isNaN(targetDateObj.getTime())) {
      targetDateObj = new Date();
    }

    const calculatedH24 = (newH12 % 12) + (newIsPm ? 12 : 0);
    targetDateObj.setHours(calculatedH24, newMin, 0, 0);

    const y = targetDateObj.getFullYear();
    const m = String(targetDateObj.getMonth() + 1).padStart(2, "0");
    const d = String(targetDateObj.getDate()).padStart(2, "0");
    const h = String(targetDateObj.getHours()).padStart(2, "0");
    const min = String(targetDateObj.getMinutes()).padStart(2, "0");

    setScheduleDateTime(`${y}-${m}-${d}T${h}:${min}`);
  };

  const addMinutes = (mins: number) => {
    const d = new Date(Date.now() + mins * 60 * 1000);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const h = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    setScheduleDateTime(`${y}-${m}-${day}T${h}:${min}`);
  };

  const setFixedPreset = (offsetDays: number, targetH24: number, targetMins: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    d.setHours(targetH24, targetMins, 0, 0);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const h = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    setScheduleDateTime(`${y}-${m}-${day}T${h}:${min}`);
  };

  const weekDays = ["일", "월", "화", "수", "목", "금", "토"];
  const dayName = weekDays[currentObj.getDay()];
  const displayDateStr = `${currentObj.getMonth() + 1}월 ${currentObj.getDate()}일(${dayName})`;
  const amPmStr = isPm ? "오후" : "오전";
  const displayTimeStr = `${amPmStr} ${String(h12).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;

  const now = new Date();
  const diffMs = currentObj.getTime() - now.getTime();
  const isFuture = diffMs > 0;

  const getRelativeText = () => {
    if (diffMs <= 0) return "미래 시간을 선택해 주세요.";
    const totalMins = Math.floor(diffMs / (1000 * 60));
    if (totalMins < 1) return "1분 이내 전송";
    if (totalMins < 60) return `약 ${totalMins}분 후 전송`;
    const hours = Math.floor(totalMins / 60);
    const remMins = totalMins % 60;
    if (hours < 24) {
      return remMins > 0 ? `약 ${hours}시간 ${remMins}분 후 전송` : `약 ${hours}시간 후 전송`;
    }
    const days = Math.floor(hours / 24);
    const remHours = hours % 24;
    return remHours > 0 ? `약 ${days}일 ${remHours}시간 후 전송` : `약 ${days}일 후 전송`;
  };

  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const tomorrowObj = new Date(now);
  tomorrowObj.setDate(tomorrowObj.getDate() + 1);
  const tomorrowStr = `${tomorrowObj.getFullYear()}-${String(tomorrowObj.getMonth() + 1).padStart(2, "0")}-${String(tomorrowObj.getDate()).padStart(2, "0")}`;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-popover p-4 shadow-2xl text-foreground animate-in zoom-in-95 duration-200 space-y-3.5">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border pb-2.5">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-amber-500" />
            <h3 className="font-bold text-base text-foreground">메시지 예약 전송</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 hover:bg-secondary text-muted-foreground hover:text-foreground transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 1. Summary Hero Card */}
        <div
          className={`rounded-xl p-3 border text-center transition-all ${
            isFuture
              ? "bg-amber-500/10 border-amber-500/30 text-amber-950 dark:text-amber-100"
              : "bg-destructive/10 border-destructive/30 text-destructive"
          }`}
        >
          <div className="text-[11px] font-semibold opacity-75">전송 예정 일시</div>
          <div className="text-xl font-black tracking-tight my-0.5">
            {displayDateStr} {displayTimeStr}
          </div>
          <div className="text-xs font-bold text-amber-600 dark:text-amber-400">
            {getRelativeText()}
          </div>
        </div>

        {/* 2. 빠른 시간 버튼 (Quick Preset Chips) */}
        <div className="space-y-1">
          <div className="text-[11px] font-bold text-muted-foreground">빠른 시간 선택</div>
          <div className="flex flex-wrap gap-1">
            {[
              { label: "+5분", action: () => addMinutes(5) },
              { label: "+10분", action: () => addMinutes(10) },
              { label: "+30분", action: () => addMinutes(30) },
              { label: "+1시간", action: () => addMinutes(60) },
              { label: "오늘 저녁 8시", action: () => setFixedPreset(0, 20, 0) },
              { label: "내일 아침 9시", action: () => setFixedPreset(1, 9, 0) },
            ].map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={p.action}
                className="rounded-lg border border-border bg-secondary/50 px-2 py-1 text-xs font-semibold hover:border-amber-500/50 hover:bg-amber-500/10 hover:text-amber-600 dark:hover:text-amber-400 transition"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* 3. 날짜 & 시간 간편 세부 설정 */}
        <div className="rounded-xl border border-border bg-secondary/20 p-3 space-y-2.5">
          {/* 날짜 선택 Row */}
          <div className="flex items-center justify-between gap-1.5">
            <span className="text-xs font-bold text-muted-foreground shrink-0">날짜</span>
            <div className="flex items-center gap-1 flex-1 justify-end">
              <button
                type="button"
                onClick={() => updateTimeComponents(todayStr, isPm, h12, minute)}
                className={`rounded-lg px-2.5 py-1 text-xs font-bold border transition ${
                  dateOnlyStr === todayStr
                    ? "bg-amber-500 text-white border-amber-500"
                    : "bg-background border-border text-foreground hover:bg-secondary"
                }`}
              >
                오늘
              </button>
              <button
                type="button"
                onClick={() => updateTimeComponents(tomorrowStr, isPm, h12, minute)}
                className={`rounded-lg px-2.5 py-1 text-xs font-bold border transition ${
                  dateOnlyStr === tomorrowStr
                    ? "bg-amber-500 text-white border-amber-500"
                    : "bg-background border-border text-foreground hover:bg-secondary"
                }`}
              >
                내일
              </button>
              <input
                type="date"
                value={dateOnlyStr}
                onChange={(e) => {
                  if (e.target.value) {
                    updateTimeComponents(e.target.value, isPm, h12, minute);
                  }
                }}
                className="rounded-lg border border-input bg-background px-2 py-1 text-xs font-semibold outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>
          </div>

          {/* 시간 (AM/PM & 시) Row */}
          <div className="flex items-center justify-between gap-1.5">
            <span className="text-xs font-bold text-muted-foreground shrink-0">시간</span>
            <div className="flex items-center gap-1.5 flex-1 justify-end">
              {/* AM/PM */}
              <div className="flex rounded-lg border border-border bg-background p-0.5">
                <button
                  type="button"
                  onClick={() => updateTimeComponents(dateOnlyStr, false, h12, minute)}
                  className={`rounded px-2 py-0.5 text-xs font-bold transition ${
                    !isPm ? "bg-amber-500 text-white" : "text-muted-foreground"
                  }`}
                >
                  오전
                </button>
                <button
                  type="button"
                  onClick={() => updateTimeComponents(dateOnlyStr, true, h12, minute)}
                  className={`rounded px-2 py-0.5 text-xs font-bold transition ${
                    isPm ? "bg-amber-500 text-white" : "text-muted-foreground"
                  }`}
                >
                  오후
                </button>
              </div>

              {/* 시 셀렉트 */}
              <select
                value={h12}
                onChange={(e) =>
                  updateTimeComponents(dateOnlyStr, isPm, parseInt(e.target.value, 10), minute)
                }
                className="rounded-lg border border-input bg-background px-2 py-1 text-xs font-bold outline-none focus:ring-1 focus:ring-amber-500"
              >
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((h) => (
                  <option key={h} value={h}>
                    {h}시
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 분 (Minute) Row */}
          <div className="flex items-center justify-between gap-1.5">
            <span className="text-xs font-bold text-muted-foreground shrink-0">분</span>
            <div className="flex items-center gap-1 flex-1 justify-end">
              <button
                type="button"
                onClick={() => updateTimeComponents(dateOnlyStr, isPm, h12, minute - 5)}
                className="rounded-lg border border-border bg-background px-2 py-1 text-xs font-bold hover:bg-secondary transition"
              >
                -5분
              </button>
              <button
                type="button"
                onClick={() => updateTimeComponents(dateOnlyStr, isPm, h12, minute - 1)}
                className="rounded-lg border border-border bg-background px-2 py-1 text-xs font-bold hover:bg-secondary transition"
              >
                -1분
              </button>
              <div className="flex items-center gap-0.5 bg-background border border-input rounded-lg px-2 py-0.5">
                <input
                  type="number"
                  min={0}
                  max={59}
                  value={minute}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    if (!isNaN(val)) {
                      const clamped = Math.max(0, Math.min(59, val));
                      updateTimeComponents(dateOnlyStr, isPm, h12, clamped);
                    }
                  }}
                  className="w-8 text-center font-bold text-xs bg-transparent outline-none"
                />
                <span className="text-xs font-bold text-muted-foreground">분</span>
              </div>
              <button
                type="button"
                onClick={() => updateTimeComponents(dateOnlyStr, isPm, h12, minute + 1)}
                className="rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400 px-2 py-1 text-xs font-bold hover:bg-amber-500/20 transition"
              >
                +1분
              </button>
              <button
                type="button"
                onClick={() => updateTimeComponents(dateOnlyStr, isPm, h12, minute + 5)}
                className="rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400 px-2 py-1 text-xs font-bold hover:bg-amber-500/20 transition"
              >
                +5분
              </button>
            </div>
          </div>
        </div>

        {/* 4. 메시지 내용 */}
        <div>
          <label className="block text-xs font-bold text-foreground mb-1">
            💬 예약 메시지 내용
          </label>
          <textarea
            value={scheduleText}
            onChange={(e) => setScheduleText(e.target.value)}
            placeholder="지정한 일시에 전송될 메시지를 입력하세요"
            rows={2}
            className="w-full rounded-xl border border-input bg-background p-2.5 text-xs outline-none focus:ring-2 focus:ring-amber-500 resize-none font-medium"
          />
        </div>

        {/* 5. Footer Buttons */}
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-border py-2 text-xs font-bold hover:bg-secondary transition text-foreground"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={!isFuture || !scheduleText.trim()}
            className="flex-1 rounded-xl bg-amber-500 py-2 text-xs font-bold text-white hover:bg-amber-600 transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            ⏰ 예약 완료
          </button>
        </div>
      </div>
    </div>
  );
}
