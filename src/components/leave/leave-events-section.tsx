"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { getMemberEventsAction } from "@/server/actions/member-events";
import { MemberEventsPanel } from "@/components/member-events-panel";
import { NON_LEAVE_EVENT_TYPES } from "@/lib/constants";

type EventItem = {
  id: string;
  type: string;
  startDate: Date | string;
  endDate: Date | string | null;
  note: string | null;
};

type MemberOption = { userId: string; label: string };

/**
 * 請假簽核頁的「請假 / 出差 / 事件」分頁（原個人資料頁的區塊搬過來）。
 * 一般成員只能登記 / 檢視自己的事件；有出勤管理權限者可切換檢視對象，替他人登記。
 */
export function LeaveEventsSection({
  myUserId,
  myLabel,
  initialEvents,
  canManageAttendance,
  members,
}: {
  myUserId: string;
  myLabel: string;
  initialEvents: EventItem[];
  canManageAttendance: boolean;
  members: MemberOption[] | null;
}) {
  const [targetUserId, setTargetUserId] = useState(myUserId);
  const [events, setEvents] = useState(initialEvents);
  const [, start] = useTransition();

  function switchTarget(userId: string) {
    setTargetUserId(userId);
    if (userId === myUserId) {
      setEvents(initialEvents);
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

  const others = (members ?? []).filter((m) => m.userId !== myUserId);

  return (
    <div className="space-y-3">
      {canManageAttendance && others.length > 0 && (
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground shrink-0">檢視對象</span>
          <select
            value={targetUserId}
            onChange={(e) => switchTarget(e.target.value)}
            className="border-input bg-transparent dark:bg-input/30 h-9 min-w-0 flex-1 rounded-md border px-2 text-sm outline-none sm:max-w-xs"
          >
            <option value={myUserId}>{myLabel}（自己）</option>
            {others.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
      )}
      <MemberEventsPanel
        key={targetUserId}
        userId={targetUserId}
        events={events}
        types={NON_LEAVE_EVENT_TYPES}
      />
    </div>
  );
}
