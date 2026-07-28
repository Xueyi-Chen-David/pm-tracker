"use client";

import { useEffect } from "react";
import { savePushSubscription } from "@/server/actions/push";

// 登入後自動註冊 Service Worker 並訂閱 Web Push（預設開啟：權限未決定就主動詢問）。
// 未設定 NEXT_PUBLIC_VAPID_PUBLIC_KEY 時整組停用（只留站內鈴鐺）。渲染 null。

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

function urlBase64ToBuffer(base64: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const buffer = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
  return buffer;
}

export function PushManager() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator))
      return;

    let cancelled = false;
    (async () => {
      try {
        // 一律註冊 SW：PWA「加到主畫面 / 安裝」在 Android 上需要有已註冊的 SW
        // 才會出現安裝提示，跟有沒有設定推播金鑰無關。
        const reg = await navigator.serviceWorker.register("/sw.js");
        if (
          !VAPID_PUBLIC_KEY ||
          !("PushManager" in window) ||
          !("Notification" in window)
        )
          return;
        // 預設開啟：尚未決定就詢問通知權限。
        let permission = Notification.permission;
        if (permission === "default") {
          permission = await Notification.requestPermission();
        }
        if (cancelled || permission !== "granted") return;

        const existing = await reg.pushManager.getSubscription();
        const sub =
          existing ??
          (await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToBuffer(VAPID_PUBLIC_KEY),
          }));
        if (cancelled) return;

        const json = sub.toJSON();
        if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return;
        await savePushSubscription({
          endpoint: json.endpoint,
          keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
          userAgent: navigator.userAgent,
        });
      } catch {
        // 瀏覽器不支援 / 使用者拒絕 / 註冊失敗 → 靜默略過（站內鈴鐺照常）。
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
