import webpush from "web-push";
import { VAPID_PUBLIC_KEY } from "./vapid-config";

const VAPID_PRIVATE_KEY =
  process.env.VAPID_PRIVATE_KEY || "dOJLMFuDss7oQesWfZdAakdOGYC9l-kz61n-8H6oIFs";

try {
  webpush.setVapidDetails(
    "mailto:support@lhjoon.app",
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );
} catch (e) {
  console.warn("[web-push] Initialization warning:", e);
}

export interface PushNotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  url?: string;
  tag?: string;
}

export async function sendWebPushNotification(
  subscriptionInput: string | object,
  payload: PushNotificationPayload
): Promise<boolean> {
  try {
    const subscription =
      typeof subscriptionInput === "string"
        ? JSON.parse(subscriptionInput)
        : subscriptionInput;

    if (!subscription || !subscription.endpoint) {
      return false;
    }

    await webpush.sendNotification(
      subscription,
      JSON.stringify({
        title: payload.title || "새 메시지",
        body: payload.body || "새로운 메시지가 도착했습니다.",
        icon: payload.icon || "/icon-192.png",
        badge: payload.badge || "/favicon.png",
        url: payload.url || "/chats",
        tag: payload.tag || "chat-message",
      })
    );
    return true;
  } catch (err) {
    console.warn("[web-push] Notification send failed:", err);
    return false;
  }
}
