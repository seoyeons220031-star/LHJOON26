import { createFileRoute, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getActiveConversation } from "@/lib/active-conversation";
import type { ConversationSummary, Message } from "@/lib/chat";
import { listConversations, getConversationTitle } from "@/lib/chat";

let sharedAudioCtx: AudioContext | null = null;
let isAudioUnlocked = false;

function unlockAudio() {
  if (isAudioUnlocked && sharedAudioCtx && sharedAudioCtx.state === "running") return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    if (!sharedAudioCtx) {
      sharedAudioCtx = new AudioCtx();
    }

    if (sharedAudioCtx.state === "suspended") {
      sharedAudioCtx.resume().then(() => {
        isAudioUnlocked = true;
      }).catch(() => {});
    } else {
      isAudioUnlocked = true;
    }

    // Play ultra-short silent sound to warm up mobile audio buffer
    const buffer = sharedAudioCtx.createBuffer(1, 1, 22050);
    const source = sharedAudioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(sharedAudioCtx.destination);
    source.start(0);
  } catch (e) {
    console.warn("Audio unlock failed:", e);
  }
}

// Global user interaction listener to unlock audio & ask notification permissions on mobile/pad
if (typeof window !== "undefined") {
  const unlockEvents = ["touchstart", "touchend", "click", "pointerdown", "keydown"];
  const handleUserInteraction = () => {
    unlockAudio();
    if ("Notification" in window && Notification.permission === "default") {
      try {
        Notification.requestPermission().catch(() => {});
      } catch {
        // ignore
      }
    }
  };
  unlockEvents.forEach((ev) => {
    window.addEventListener(ev, handleUserInteraction, { passive: true });
  });
}

function playNotificationSound() {
  // 1. Mobile Vibration (if supported by mobile/tablet OS)
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate([150, 80, 150]);
    } catch {
      // ignore
    }
  }

  // 2. Clear Chime sound via Web Audio API
  try {
    unlockAudio();
    const ctx = sharedAudioCtx;
    if (!ctx) return;

    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = "sine";
    osc2.type = "sine";

    // Clear dual tone chime (C6 -> G6)
    osc1.frequency.setValueAtTime(1046.5, now);
    osc2.frequency.setValueAtTime(1567.98, now + 0.08);

    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(now);
    osc1.stop(now + 0.12);
    osc2.start(now + 0.08);
    osc2.stop(now + 0.4);
  } catch (e) {
    console.warn("Notification sound error:", e);
  }
}

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async () => {
    if (typeof window === "undefined") {
      return { user: null };
    }
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Global in-app push notifications for new messages & friend updates
  useEffect(() => {
    let meId: string | null = null;
    supabase.auth.getUser().then(({ data }) => {
      meId = data.user?.id ?? null;
    });

    const showToastWithSound = async (m: Message) => {
      if (!meId) {
        const { data } = await supabase.auth.getUser();
        meId = data.user?.id ?? null;
      }
      if (meId && m.sender_id === meId) return;

      // Look up conversation metadata from cache first
      let convs = qc.getQueryData<ConversationSummary[]>(["conversations"]);
      if (!convs) {
        try {
          convs = await listConversations();
          qc.setQueryData(["conversations"], convs);
        } catch {
          convs = [];
        }
      }
      const conv = convs.find((c) => c.id === m.conversation_id);
      if (conv?.muted) return;

      const sender = conv?.participants?.find((p) => p && p.id === m.sender_id);
      const senderEmailPrefix = sender?.email ? (sender.email || "").split("@")[0] : "";
      const senderName =
        sender?.display_name?.trim() ||
        senderEmailPrefix ||
        sender?.username ||
        (conv ? getConversationTitle(conv) : "상대방");
      const preview = m.content?.trim()
        ? m.content
        : m.attachment_type?.startsWith("image/")
          ? "📷 사진"
          : m.attachment_type?.startsWith("video/")
            ? "🎬 동영상"
            : m.attachment_name
              ? `📎 ${m.attachment_name}`
              : "새 메시지가 도착했습니다.";

      // Play notification chime
      playNotificationSound();

      // Show floating Toast banner
      toast(senderName, {
        description: preview,
        action: {
          label: "열기",
          onClick: () => navigate({ to: "/chat/$id", params: { id: m.conversation_id } }),
        },
      });

      // System Notification (Web Push Notification standard) at OS level
      if (
        typeof window !== "undefined" &&
        "Notification" in window &&
        Notification.permission === "granted"
      ) {
        try {
          if ("serviceWorker" in navigator) {
            navigator.serviceWorker.ready.then((registration) => {
              registration.showNotification(senderName, {
                body: preview,
                icon: "/lhjoon-logo.png",
                badge: "/favicon.png",
                vibrate: [200, 100, 200],
                tag: m.conversation_id,
                data: { url: `/chat/${m.conversation_id}` },
              });
            });
          } else {
            new Notification(senderName, {
              body: preview,
              icon: "/lhjoon-logo.png",
              badge: "/favicon.png",
              vibrate: [200, 100, 200],
            });
          }
        } catch (e) {
          console.warn("System notification error:", e);
        }
      }

      qc.invalidateQueries({ queryKey: ["conversations"] });
    };

    const channel = supabase
      .channel("notification-channel")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const msg = payload.new as Message;
          if (msg && msg.sender_id !== meId) {
            showToastWithSound(msg);
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "friendships" },
        async (payload) => {
          qc.invalidateQueries({ queryKey: ["friends"] });
          qc.invalidateQueries({ queryKey: ["conversations"] });

          const newRow = payload.new as { user_id?: string; friend_id?: string; status?: string } | null;
          if (!meId) {
            const { data } = await supabase.auth.getUser();
            meId = data.user?.id ?? null;
          }

          if (newRow && meId && (newRow.friend_id === meId || newRow.user_id === meId)) {
            playNotificationSound();
            if (payload.eventType === "INSERT") {
              toast("새 친구 소식", {
                description: "친구 요청 또는 새로운 친구가 추가되었습니다.",
              });
            } else if (payload.eventType === "UPDATE") {
              toast("친구 정보 업데이트", {
                description: "친구 목록 상태가 업데이트되었습니다.",
              });
            }
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [navigate, qc]);

  if (!mounted) {
    return null;
  }

  return <Outlet />;
}
