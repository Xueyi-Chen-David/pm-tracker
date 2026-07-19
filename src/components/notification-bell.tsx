"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { format } from "date-fns";
import {
  markNotificationRead,
  markAllNotificationsRead,
} from "@/server/actions/notifications";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type NotificationItem = {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  createdAt: string | Date;
};

export function NotificationBell({
  items,
  unread,
}: {
  items: NotificationItem[];
  unread: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  // 樂觀已讀：點下去 UI 立刻反映（不必等 server + refresh）。以「本地已讀集合 / 全部已讀」
  // 疊在 server props 之上；等 refresh 帶回真正的 read 狀態後（資料指紋改變），於 render 階段
  // 重置這層樂觀狀態——用 React 建議的「prop 改變即重置 state」寫法，不放進 effect。
  const [readIds, setReadIds] = useState<Set<string>>(() => new Set());
  const [allRead, setAllRead] = useState(false);

  const snapshot =
    items.map((i) => `${i.id}:${i.read ? 1 : 0}`).join(",") + `|${unread}`;
  const [prevSnapshot, setPrevSnapshot] = useState(snapshot);
  if (snapshot !== prevSnapshot) {
    setPrevSnapshot(snapshot);
    setReadIds(new Set());
    setAllRead(false);
  }

  const isRead = (it: NotificationItem) =>
    allRead || it.read || readIds.has(it.id);
  const newlyRead = allRead
    ? unread
    : items.filter((it) => !it.read && readIds.has(it.id)).length;
  const displayUnread = Math.max(0, unread - newlyRead);

  function openItem(it: NotificationItem) {
    if (!it.read) setReadIds((prev) => new Set(prev).add(it.id)); // 立即已讀
    if (it.link) setOpen(false); // 只有要跳頁時才關閉；否則留著讓已讀變化看得見
    start(async () => {
      if (!it.read) await markNotificationRead(it.id);
      if (it.link) router.push(it.link);
      router.refresh();
    });
  }

  function readAll() {
    setAllRead(true); // 立即全部已讀
    start(async () => {
      await markAllNotificationsRead();
      router.refresh();
    });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="hover:bg-muted relative inline-flex h-8 w-8 items-center justify-center rounded-md"
        title="通知"
      >
        <Bell className="h-4.5 w-4.5" />
        {displayUnread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">
            {displayUnread > 9 ? "9+" : displayUnread}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-medium">通知</span>
          {displayUnread > 0 && (
            <button
              onClick={readAll}
              disabled={pending}
              className="text-primary text-xs hover:underline disabled:opacity-50"
            >
              全部標為已讀
            </button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {items.length === 0 ? (
            <p className="text-muted-foreground px-3 py-6 text-center text-sm">
              目前沒有通知
            </p>
          ) : (
            items.map((it) => (
              <button
                key={it.id}
                onClick={() => openItem(it)}
                className={cn(
                  "hover:bg-muted/60 block w-full border-b px-3 py-2 text-left transition-colors last:border-0",
                  !isRead(it) && "bg-primary/5",
                )}
              >
                <div className="flex items-start gap-2">
                  {!isRead(it) && (
                    <span className="bg-primary mt-1.5 h-2 w-2 shrink-0 rounded-full" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{it.title}</div>
                    {it.body && (
                      <div className="text-muted-foreground truncate text-xs">
                        {it.body}
                      </div>
                    )}
                    <div className="text-muted-foreground mt-0.5 text-[11px]">
                      {format(new Date(it.createdAt), "M/d HH:mm")}
                    </div>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
