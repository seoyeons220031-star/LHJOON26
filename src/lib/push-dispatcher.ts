import { supabase } from "@/integrations/supabase/client";
import { sendWebPushNotification } from "./push-server";

export async function sendPushForMessage(data: {
  conversationId: string;
  senderId: string;
  text: string;
}) {
  const { conversationId, senderId, text } = data;
  if (!conversationId || !senderId) return { success: false, reason: "Missing params" };

  try {
    // 1. Get sender profile
    const { data: senderProf } = await supabase
      .from("profiles")
      .select("display_name, username")
      .eq("id", senderId)
      .maybeSingle();

    const senderName = senderProf?.display_name || senderProf?.username || "상대방";

    // 2. Find conversation participants other than sender
    const { data: participants } = await supabase
      .from("conversation_participants")
      .select("user_id, muted")
      .eq("conversation_id", conversationId)
      .neq("user_id", senderId);

    if (!participants || participants.length === 0) {
      return { success: true, count: 0 };
    }

    const unmutedUserIds = participants.filter((p) => !p.muted).map((p) => p.user_id);
    if (unmutedUserIds.length === 0) return { success: true, count: 0 };

    // 3. Retrieve subscriptions
    const { data: profilesWithSub } = await supabase
      .from("profiles")
      .select("id, push_subscription")
      .in("id", unmutedUserIds);

    const subscriptionsToNotify: string[] = [];

    for (const p of profilesWithSub || []) {
      if (p.push_subscription) {
        subscriptionsToNotify.push(p.push_subscription);
      }
    }

    try {
      const { data: pushSubRows } = await supabase
        .from("user_push_subscriptions")
        .select("subscription")
        .in("user_id", unmutedUserIds);

      for (const row of pushSubRows || []) {
        if (row.subscription && !subscriptionsToNotify.includes(row.subscription)) {
          subscriptionsToNotify.push(row.subscription);
        }
      }
    } catch {
      // Optional fallback table
    }

    if (subscriptionsToNotify.length === 0) return { success: true, count: 0 };

    const payload = {
      title: `${senderName}님의 메시지`,
      body: text || "새로운 메시지가 도착했습니다.",
      icon: "/icon-192.png",
      badge: "/favicon.png",
      url: `/chat/${conversationId}`,
      tag: `chat-${conversationId}`,
    };

    let count = 0;
    for (const subStr of subscriptionsToNotify) {
      const ok = await sendWebPushNotification(subStr, payload);
      if (ok) count++;
    }

    return { success: true, count };
  } catch (err) {
    console.warn("[push-dispatcher] Error:", err);
    return { success: false, error: String(err) };
  }
}
