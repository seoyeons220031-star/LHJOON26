import { createFileRoute, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getActiveConversation } from "@/lib/active-conversation";
import type { ConversationSummary, Message } from "@/lib/chat";
import { listConversations } from "@/lib/chat";

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

  // Global in-app push notifications for new messages in any conversation
  // the user participates in. RLS ensures we only receive messages we can see.
  useEffect(() => {
    let meId: string | null = null;
    supabase.auth.getUser().then(({ data }) => {
      meId = data.user?.id ?? null;
    });

    const channel = supabase
      .channel("global-notifications")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        async (payload) => {
          const m = payload.new as Message;
          if (!meId || m.sender_id === meId) return;
          if (m.conversation_id === getActiveConversation()) return;

          // Look up conversation metadata (mute + title) from cache first
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
            (conv?.is_group ? (conv.title ?? "그룹") : "새 메시지");
          const preview = m.content?.trim()
            ? m.content
            : m.attachment_type?.startsWith("image/")
              ? "📷 사진"
              : m.attachment_type?.startsWith("video/")
                ? "🎬 동영상"
                : m.attachment_name
                  ? `📎 ${m.attachment_name}`
                  : "새 메시지";

          toast(senderName, {
            description: preview,
            action: {
              label: "열기",
              onClick: () => navigate({ to: "/chat/$id", params: { id: m.conversation_id } }),
            },
          });

          // Trigger real system notification (Web Push Notification standard) at OS level
          if (
            typeof window !== "undefined" &&
            "Notification" in window &&
            Notification.permission === "granted"
          ) {
            if ("serviceWorker" in navigator) {
              navigator.serviceWorker.ready
                .then((registration) => {
                  registration.showNotification(senderName, {
                    body: preview,
                    icon: "/lhjoon-logo.png",
                    badge: "/favicon.png",
                    vibrate: [200, 100, 200],
                    tag: m.conversation_id, // Debounces alerts from the same chat room
                    data: {
                      url: `/chat/${m.conversation_id}`,
                    },
                  });
                })
                .catch((e) => {
                  console.error("[SW Notification Error]", e);
                });
            } else {
              new Notification(senderName, {
                body: preview,
                icon: "/lhjoon-logo.png",
                badge: "/favicon.png",
                vibrate: [200, 100, 200],
              });
            }
          }

          qc.invalidateQueries({ queryKey: ["conversations"] });
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
