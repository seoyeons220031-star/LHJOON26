import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Outlet, Link, createRootRouteWithContext, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { Toaster } from "sonner";

import { reportLovableError } from "../lib/lovable-error-reporting";
import { supabase } from "@/integrations/supabase/client";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold">404</h1>
        <h2 className="mt-4 text-xl font-semibold">Page not found</h2>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">Try refreshing the page.</p>
        <div className="mt-6 flex justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Try again
          </button>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      router.invalidate();
      if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
    });
    return () => sub.subscription.unsubscribe();
  }, [queryClient, router]);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    // Helper to convert VAPID public key string to Uint8Array
    const urlBase64ToUint8Array = (base64String: string) => {
      const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
      const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
      const rawData = window.atob(base64);
      const outputArray = new Uint8Array(rawData.length);
      for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
      }
      return outputArray;
    };

    const setupPushSubscription = async (reg: ServiceWorkerRegistration) => {
      try {
        if (!reg.pushManager) {
          console.log("[Push Manager] Not supported on this browser.");
          return;
        }

        let sub = await reg.pushManager.getSubscription();
        if (!sub) {
          console.log("[Push Subscription] Subscribing with public key...");
          const publicKey =
            "BEl62iS7_Jl9nw5dbM87Fh-7_A3g6T0K_3g7_T1-9A8J4_Q-F62_f8e_r8_W9A9_A8J4_Q";
          const convertedKey = urlBase64ToUint8Array(publicKey);
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: convertedKey,
          });
        }
        console.log("[Push Subscription] Subscription object obtained:", JSON.stringify(sub));
        localStorage.setItem("push_subscription", JSON.stringify(sub));
      } catch (err) {
        console.warn("[Push Subscription] Setup failed or skipped:", err);
      }
    };

    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        console.log("[Service Worker] Registered with scope:", reg.scope);

        if ("Notification" in window) {
          if (Notification.permission === "default") {
            // Prompt permission after 2 seconds to ensure user is settled
            setTimeout(() => {
              Notification.requestPermission().then((permission) => {
                console.log("[Notification Permission] Granted:", permission === "granted");
                if (permission === "granted") {
                  setupPushSubscription(reg);
                  new Notification("Chatterbox Live", {
                    body: "알림 권한이 허용되었습니다! 실시간 알림을 수신할 수 있습니다.",
                    icon: "/lhjoon-logo.png",
                    badge: "/favicon.png",
                    vibrate: [200, 100, 200],
                  });
                }
              });
            }, 2000);
          } else if (Notification.permission === "granted") {
            setupPushSubscription(reg);
          }
        }
      })
      .catch((err) => {
        console.error("[Service Worker] Registration failed:", err);
      });
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      <Toaster position="top-center" richColors />
    </QueryClientProvider>
  );
}
