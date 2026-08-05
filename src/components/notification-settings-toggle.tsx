"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import {
  pushSupported,
  hasActiveSubscription,
  subscribeThisDevice,
  unsubscribeThisDevice,
} from "@/lib/push-client";
import { Switch } from "@/components/ui/switch";

type Status = "loading" | "unsupported" | "denied" | "off" | "on";

/**
 * /me 個人資料頁（本人）的「桌面通知」開關。訂閱天生綁「這個瀏覽器」，沒有跨裝置的
 * 單一開關，所以這裡只反映＋操作目前這台裝置的訂閱狀態——跟最下方小橫幅
 * （NotificationPermissionBanner）共用同一套邏輯（src/lib/push-client.ts），
 * 那是「第一次的邀請」，這裡是「事後想改主意」（含關掉重開）。
 */
export function NotificationSettingsToggle() {
  const [status, setStatus] = useState<Status>("loading");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!pushSupported()) {
        if (!cancelled) setStatus("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        if (!cancelled) setStatus("denied");
        return;
      }
      if (Notification.permission === "default") {
        if (!cancelled) setStatus("off");
        return;
      }
      const active = await hasActiveSubscription();
      if (!cancelled) setStatus(active ? "on" : "off");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function toggle(next: boolean) {
    setPending(true);
    try {
      if (next) {
        if (Notification.permission === "default") {
          const permission = await Notification.requestPermission();
          if (permission !== "granted") {
            setStatus(permission === "denied" ? "denied" : "off");
            return;
          }
        }
        if (Notification.permission !== "granted") return;
        setStatus((await subscribeThisDevice()) ? "on" : "off");
      } else {
        await unsubscribeThisDevice();
        setStatus("off");
      }
    } finally {
      setPending(false);
    }
  }

  if (status === "unsupported") return null; // 這台裝置 / 瀏覽器本來就不支援，連分隔線都不留

  return (
    <div className="flex items-center gap-3 border-t pt-4">
      <span className="bg-muted flex h-8 w-8 shrink-0 items-center justify-center rounded-full">
        <Bell className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">桌面通知</div>
        <div className="text-muted-foreground text-xs">
          {status === "denied"
            ? "已在瀏覽器封鎖，請至瀏覽器的網站設定手動開啟"
            : "在這個瀏覽器跳出新通知的桌面提示"}
        </div>
      </div>
      <Switch
        checked={status === "on"}
        disabled={status === "loading" || status === "denied" || pending}
        onCheckedChange={toggle}
      />
    </div>
  );
}
