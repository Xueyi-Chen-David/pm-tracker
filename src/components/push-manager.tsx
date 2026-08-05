"use client";

import { useEffect } from "react";
import { registerServiceWorker, subscribeThisDevice } from "@/lib/push-client";

/**
 * 登入後掛載一次：一律註冊 Service Worker（PWA 安裝提示在 Android 上需要它，
 * 跟有沒有設定推播金鑰無關），若這個瀏覽器的通知權限「已經」是 granted 就靜默補訂閱
 * （例如換了分頁 / 重新登入，先前已同意過）。
 *
 * 第一次詢問權限改由 NotificationPermissionBanner 用按鈕觸發（使用者手勢）：
 * iOS Safari 的 Notification.requestPermission 只認使用者手勢中的呼叫，在 effect
 * 裡直接呼叫會被當成非手勢觸發而直接視為拒絕；改成手勢觸發後，桌面版也一併換成
 * 「先講清楚要幹嘛，使用者按了才問」而不是登入就跳原生瀏覽器詢問。
 * 未設定 NEXT_PUBLIC_VAPID_PUBLIC_KEY 時整組停用（只留站內鈴鐺）。渲染 null。
 */
export function PushManager() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    let cancelled = false;
    (async () => {
      try {
        await registerServiceWorker();
        if (cancelled) return;
        if (!("Notification" in window) || Notification.permission !== "granted")
          return;
        await subscribeThisDevice();
      } catch {
        // 瀏覽器不支援 / 註冊失敗 → 靜默略過（站內鈴鐺照常）。
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
