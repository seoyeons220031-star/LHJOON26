export const VAPID_PUBLIC_KEY =
  import.meta.env?.VITE_VAPID_PUBLIC_KEY ||
  "BIZxzFmhXpSG1yLglOFyGgkoU00rZWfVAsth-ibZOVWglQ3HgR5PVIzbqkOaxs34nCxwciZpXj0pGUT8nx3Ywuw";

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
