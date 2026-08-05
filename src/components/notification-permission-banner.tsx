"use client";

import { useState, useSyncExternalStore } from "react";
import { Bell, X } from "lucide-react";
import { pushSupported, subscribeThisDevice } from "@/lib/push-client";
import { Button } from "@/components/ui/button";

/** 「不再詢問」的記錄——關掉一次就永久記住（跟 checkin-reminder 的每日鍵不同，這個沒有隔天重來）。 */
const DISMISS_KEY = "pp:push-banner-dismissed";
const DISMISS_EVENT = "pp:push-banner-dismissed";

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false; // 隱私模式 / 停用儲存：頂多這次關不掉，不影響功能。
  }
}

function writeDismissed() {
  try {
    localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    /* 存不進去就算了。 */
  }
  window.dispatchEvent(new CustomEvent(DISMISS_EVENT));
}

function subscribeDismissed(onChange: () => void) {
  window.addEventListener(DISMISS_EVENT, onChange);
  window.addEventListener("storage", onChange); // 其他分頁做過決定也同步收起
  return () => {
    window.removeEventListener(DISMISS_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** 是否該顯示橫幅：支援＋權限尚未決定（default，已同意/已拒絕都不顯示）＋沒被關掉過。 */
function computeShouldShow(): boolean {
  if (!pushSupported()) return false;
  if (Notification.permission !== "default") return false;
  return !readDismissed();
}

/**
 * 供其他全域浮動元件（如番茄鐘膠囊）讀「橫幅現在佔不佔底部」，好讓自己讓開，
 * 不用真的耦合，只是讀同一份外部狀態。
 */
export function useShowNotificationBanner(): boolean {
  return useSyncExternalStore(subscribeDismissed, computeShouldShow, () => false);
}

/**
 * 全域最下方「要不要開啟桌面通知」的細條——(app)/layout 掛載一次，橫跨畫面全寬。
 * 用 useSyncExternalStore 讀「該不該顯示」（SSR 一律回傳 false，避免 hydration 落差；
 * 跟 checkin-reminder.tsx 同一招），按右邊 ✕ 或按「開啟」做出選擇後 dispatch 事件即時
 * 收起，且永久記住（localStorage），不再出現。已經開啟過（權限已是 granted）就不會顯示。
 * 跟 /me 個人資料頁的「桌面通知」開關操作同一份瀏覽器訂閱（src/lib/push-client.ts）
 * ——那是「事後想改主意」，這裡是「第一次的邀請」。
 *
 * 用按鈕點擊觸發 Notification.requestPermission()：這是使用者手勢，iOS Safari 只認
 * 這種呼叫方式，掛載時自動彈的話會直接被當拒絕。
 */
export function NotificationPermissionBanner() {
  const show = useShowNotificationBanner();
  const [busy, setBusy] = useState(false);

  function dismiss() {
    writeDismissed();
  }

  async function enable() {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission === "granted") await subscribeThisDevice();
    } catch {
      /* 使用者拒絕 / 瀏覽器擋掉：不特別處理，下面照樣收起橫幅。 */
    } finally {
      writeDismissed(); // 不論同意或拒絕，這個決定就算問過了，不再問第二次
      setBusy(false);
    }
  }

  if (!show) return null;

  return (
    <div className="no-print animate-in fade-in slide-in-from-bottom-2 bg-card fixed inset-x-0 bottom-0 z-40 border-t shadow-[0_-2px_8px_rgba(0,0,0,0.06)] duration-300">
      <div className="mx-auto flex max-w-[90rem] items-center gap-2.5 px-4 py-2 sm:px-6 lg:px-8">
        <span className="bg-primary/10 text-primary flex h-7 w-7 shrink-0 items-center justify-center rounded-full">
          <Bell className="h-4 w-4" />
        </span>
        <p className="min-w-0 flex-1 truncate text-sm">要開啟桌面通知嗎？</p>
        <Button size="sm" disabled={busy} onClick={enable} className="shrink-0">
          開啟
        </Button>
        <button
          type="button"
          onClick={dismiss}
          disabled={busy}
          title="永久關閉，不再詢問"
          className="text-muted-foreground hover:bg-muted hover:text-foreground shrink-0 rounded-md p-1.5 transition-colors disabled:opacity-50"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">永久關閉，不再詢問</span>
        </button>
      </div>
    </div>
  );
}
