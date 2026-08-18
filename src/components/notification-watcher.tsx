"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  getRecentUnreadNotifications,
  markNotificationRead,
} from "@/server/actions/notifications";

/**
 * 站內即時彈窗（Slack 式）：輪詢「掛載後新建的未讀通知」，逐則以 toast 跳出。
 * 桌面推播（PushManager）在分頁沒開時跳；這個在分頁開著時補上即時彈窗，兩者互補。
 * 點「查看」→ 標為已讀並前往連結。
 *
 * 有新通知就順手 router.refresh() 目前這頁（不等使用者點 toast）：有人送出打卡補登 /
 * 請假 / 出差事件時，簽核者 / 管理者如果剛好開著相關頁面，資料會在下一次輪詢
 * （最多 25 秒，或切回分頁時立即）自動變新，不用自己手動重新整理才看得到。
 */
export function NotificationWatcher() {
  const router = useRouter();
  const since = useRef<string>(new Date().toISOString());
  const seen = useRef<Set<string>>(new Set());

  useEffect(() => {
    let stopped = false;

    async function poll() {
      if (document.visibilityState === "hidden") return;
      try {
        const rows = await getRecentUnreadNotifications(since.current);
        if (stopped || rows.length === 0) return;
        for (const n of rows) {
          if (seen.current.has(n.id)) continue;
          seen.current.add(n.id);
          toast(n.title, {
            description: n.body ?? undefined,
            action: n.link
              ? {
                  label: "查看",
                  onClick: () => {
                    void markNotificationRead(n.id);
                    router.push(n.link as string);
                  },
                }
              : undefined,
          });
        }
        const last = rows[rows.length - 1];
        if (last) since.current = last.createdAt;
        // 不管有沒有點 toast 都刷新——見檔頭註解。
        router.refresh();
      } catch {
        // 靜默：輪詢失敗不打擾使用者。
      }
    }

    const id = setInterval(poll, 25_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    void poll();

    return () => {
      stopped = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);

  return null;
}
