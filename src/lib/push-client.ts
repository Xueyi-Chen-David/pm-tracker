// 瀏覽器端 Web Push（桌面通知）訂閱 / 取消訂閱的共用邏輯。
// 三處使用者都需要同一套動作，抽出來避免各刻一份 base64 轉換 + subscribe 樣板碼：
//   - PushManager：登入後靜默補訂閱（僅當權限「已經」是 granted，不主動彈原生詢問）。
//   - NotificationPermissionBanner：App 最下方的小橫幅，使用者按「開啟」才詢問權限。
//   - NotificationSettingsToggle：/me 個人資料頁的桌面通知開關（可手動關閉／重新開啟）。
// 訂閱天生綁「這個瀏覽器 / 這台裝置」，沒有跨裝置的單一開關——三處都只操作目前這個 SW registration。

import {
  savePushSubscription,
  removePushSubscription,
} from "@/server/actions/push";

export const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

/** 瀏覽器 + 環境是否具備跳出桌面通知的條件（未設定 VAPID 金鑰時整組視為不支援）。 */
export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window &&
    !!VAPID_PUBLIC_KEY
  );
}

function urlBase64ToBuffer(base64: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const buffer = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
  return buffer;
}

/** 註冊 Service Worker（冪等）。PWA「加到主畫面」在 Android 上需要它，跟有沒有推播金鑰無關。 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js");
  } catch {
    return null;
  }
}

/**
 * 訂閱這台裝置的推播並寫回伺服器。呼叫前 `Notification.permission` 必須已是 "granted"
 * ——何時去 request 由呼叫端決定（使用者手勢觸發，或已經同意過就靜默補訂閱）。
 */
export async function subscribeThisDevice(): Promise<boolean> {
  if (!VAPID_PUBLIC_KEY || Notification.permission !== "granted") return false;
  const reg = await registerServiceWorker();
  if (!reg) return false;
  const existing = await reg.pushManager.getSubscription();
  const sub =
    existing ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToBuffer(VAPID_PUBLIC_KEY),
    }));
  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return false;
  await savePushSubscription({
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    userAgent: navigator.userAgent,
  });
  return true;
}

/** 這個瀏覽器目前是否有作用中的推播訂閱（只看瀏覽器端狀態）。 */
export async function hasActiveSubscription(): Promise<boolean> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return false;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return !!sub;
}

/** 取消這台裝置的訂閱：瀏覽器端 unsubscribe + 從伺服器刪掉這筆紀錄。 */
export async function unsubscribeThisDevice(): Promise<void> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  await removePushSubscription(endpoint);
}
