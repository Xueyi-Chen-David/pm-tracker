"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ChevronDown } from "lucide-react";
import { getMemberEventsAction } from "@/server/actions/member-events";
import { MemberEventsPanel } from "@/components/member-events-panel";
import { NON_LEAVE_EVENT_TYPES } from "@/lib/constants";
import type { MemberEventRowData } from "@/components/leave/member-event-row";

type MemberOption = { userId: string; label: string };

/**
 * 「請假 / 出差」頁的「代他人登記」區塊：具出勤管理權限者選一位成員，查看 / 登記 /
 * 刪除他的出差 / 事件。自己的請假與事件已併入同一頁的主時間軸（見 checkin/page.tsx），
 * 不會出現在這裡，避免同一筆自己的事件在頁面上重複出現。
 *
 * 預設收合——這是次要動作（幫別人做事），不該搶走主時間軸的版面。
 * 呼叫端只在 members 非空時才渲染本元件。
 */
export function LeaveEventsSection({ members }: { members: MemberOption[] }) {
  const [open, setOpen] = useState(false);
  const [targetUserId, setTargetUserId] = useState("");
  const [events, setEvents] = useState<MemberEventRowData[]>([]);
  const [pending, start] = useTransition();

  function switchTarget(userId: string) {
    setTargetUserId(userId);
    if (!userId) {
      setEvents([]);
      return;
    }
    start(async () => {
      try {
        const res = await getMemberEventsAction(userId);
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        setEvents(res.events);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "讀取失敗");
      }
    });
  }

  return (
    <div className="border-t pt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-muted-foreground flex items-center gap-1 text-sm hover:text-foreground"
      >
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? "" : "-rotate-90"}`} />
        代他人登記出差 / 事件
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground shrink-0">選擇成員</span>
            <select
              value={targetUserId}
              onChange={(e) => switchTarget(e.target.value)}
              className="border-input bg-transparent dark:bg-input/30 h-9 min-w-0 flex-1 rounded-md border px-2 text-sm outline-none sm:max-w-xs"
            >
              <option value="">請選擇……</option>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          {targetUserId &&
            (pending ? (
              <p className="text-muted-foreground text-sm">讀取中…</p>
            ) : (
              <MemberEventsPanel
                key={targetUserId}
                userId={targetUserId}
                events={events}
                types={NON_LEAVE_EVENT_TYPES}
              />
            ))}
        </div>
      )}
    </div>
  );
}
