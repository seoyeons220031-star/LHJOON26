// Service Worker for LHJOON Web Push Notifications
self.addEventListener("install", function (event) {
  console.log("[Service Worker] Installing Service Worker...");
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  console.log("[Service Worker] Activating Service Worker...");
  return self.clients.claim();
});

self.addEventListener("push", function (event) {
  console.log("[Service Worker] Push Event Received.");
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: "새 메시지", body: event.data.text() };
    }
  }

  const title = data.title || "새 메시지";
  const options = {
    body: data.body || "새로운 메시지가 도착했습니다.",
    icon: data.icon || "/icon-192.png",
    badge: data.badge || "/favicon.png",
    vibrate: [200, 100, 200],
    tag: data.tag || "chat-notification",
    data: {
      url: data.url || "/chats",
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("message", function (event) {
  if (event.data && event.data.type === "SHOW_NOTIFICATION") {
    const { title, body, icon, badge, url, tag } = event.data;
    const options = {
      body: body || "새로운 메시지가 도착했습니다.",
      icon: icon || "/icon-192.png",
      badge: badge || "/favicon.png",
      vibrate: [200, 100, 200],
      tag: tag || "chat-notification",
      data: { url: url || "/chats" },
    };
    event.waitUntil(self.registration.showNotification(title || "새 메시지", options));
  }
});

self.addEventListener("notificationclick", function (event) {
  console.log("[Service Worker] Notification Clicked.");
  event.notification.close();

  const urlToOpen = event.notification.data ? event.notification.data.url : "/chats";
  const targetUrl = new URL(urlToOpen, self.location.origin).href;

  event.waitUntil(
    clients
      .matchAll({
        type: "window",
        includeUncontrolled: true,
      })
      .then(function (windowClients) {
        for (let i = 0; i < windowClients.length; i++) {
          let client = windowClients[i];
          const clientUrl = new URL(client.url, self.location.origin).href;
          if ("focus" in client) {
            client.focus();
            if ("navigate" in client && clientUrl !== targetUrl) {
              client.navigate(targetUrl);
            }
            return;
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      }),
  );
});
