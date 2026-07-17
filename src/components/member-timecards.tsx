"use client";

import { useState } from "react";
import {
  AttendanceTimecard,
  type TimecardDay,
} from "@/components/attendance-timecard";

export type MemberTimecard = {
  userId: string;
  label: string;
  days: TimecardDay[];
};

/**
 * 「出席狀況」頁的每人打卡時間（需 attendance.view_punch_times 權限；由頁面決定是否渲染）。
 *
 * 月曆格子只有 28px，塞不下時間，所以另闢一區：挑一位成員，看他本月每天實際的
 * 上 / 下班時間與在勤時數——與本人在「打卡 / 出勤」看到的是同一份打卡紙。
 */
export function MemberTimecards({
  members,
  todayStr,
}: {
  members: MemberTimecard[];
  todayStr: string;
}) {
  const [userId, setUserId] = useState(() => members[0]?.userId ?? "");
  const current = members.find((m) => m.userId === userId) ?? members[0];
  if (!current) return null;

  return (
    <AttendanceTimecard
      days={current.days}
      todayStr={todayStr}
      title="打卡時間"
      emptyHint={`${current.label} 本月尚無打卡紀錄。`}
      headerExtra={
        <select
          value={current.userId}
          onChange={(e) => setUserId(e.currentTarget.value)}
          className="border-input focus-visible:border-ring h-8 max-w-[14rem] min-w-0 rounded-md border bg-transparent px-2 text-sm outline-none dark:bg-input/30"
          title="選擇要查看打卡時間的成員"
        >
          {members.map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.label}
            </option>
          ))}
        </select>
      }
    />
  );
}
