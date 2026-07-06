import type { PrismaClient, Prisma } from "@prisma/client";
import {
  eventAttendanceEffect,
  type AttendanceEffect,
} from "@/lib/constants";

// 成員事件 ↔ 出席月曆 的同步（純資料層，傳入 Prisma client 以便測試）。
//   請假 → 缺席；出差 / 在家工作 → 在外工作（圈圈）；其餘不影響。
// 一律以「目前所有成員事件」重算，只動自動（auto）紀錄，人工紀錄一律保留。

const DAY_MS = 24 * 3600 * 1000;

/** 列出 [start, end]（含）之間所有平日（週一~週五）的 UTC 午夜日期。 */
export function weekdaysInRange(start: Date, end: Date): Date[] {
  const days: Date[] = [];
  for (let t = start.getTime(); t <= end.getTime(); t += DAY_MS) {
    const wd = new Date(t).getUTCDay();
    if (wd !== 0 && wd !== 6) days.push(new Date(t));
  }
  return days;
}

type EventRow = { type: string; startDate: Date; endDate: Date | null };

/**
 * 某天由所有事件推導出的出席效果；請假（缺席）優先於出差/在家工作（在外工作）。
 * 回傳 null＝該天沒有任何會影響出席的事件。
 */
function effectForDate(
  events: EventRow[],
  date: Date,
): { effect: AttendanceEffect; type: string } | null {
  const t = date.getTime();
  let offsite: { effect: AttendanceEffect; type: string } | null = null;
  for (const e of events) {
    const s = e.startDate.getTime();
    const en = (e.endDate ?? e.startDate).getTime();
    if (t < s || t > en) continue;
    const eff = eventAttendanceEffect(e.type);
    if (!eff) continue;
    if (eff === "absent") return { effect: "absent", type: e.type }; // 缺席優先
    offsite ??= { effect: "offsite", type: e.type };
  }
  return offsite;
}

/**
 * 依「目前所有成員事件」重算指定平日的自動出席紀錄。
 * - 該天有事件效果：建立 / 更新一筆自動紀錄（缺席或在外工作）。
 * - 該天已無事件效果：刪掉原本的自動紀錄。
 * - 人工紀錄（auto=false）：一律不動（人工優先）。
 * 建立 / 刪除 請假・出差・在家工作 事件後呼叫，傳入受影響的平日清單。
 */
export async function recomputeAttendance(
  db: PrismaClient,
  orgId: string,
  userId: string,
  createdById: string,
  dates: Date[],
) {
  if (!dates.length) return;
  const maxDate = new Date(Math.max(...dates.map((d) => d.getTime())));

  const [events, existing] = await Promise.all([
    db.memberEvent.findMany({
      where: { organizationId: orgId, userId, startDate: { lte: maxDate } },
      select: { type: true, startDate: true, endDate: true },
    }),
    db.attendanceRecord.findMany({
      where: { organizationId: orgId, userId, date: { in: dates } },
      select: { id: true, date: true, auto: true },
    }),
  ]);
  const exByTime = new Map(existing.map((r) => [r.date.getTime(), r]));

  const ops: Prisma.PrismaPromise<unknown>[] = [];
  for (const date of dates) {
    const ex = exByTime.get(date.getTime());
    if (ex && !ex.auto) continue; // 人工紀錄：保留，不動
    const win = effectForDate(events, date);

    if (!win) {
      if (ex) ops.push(db.attendanceRecord.delete({ where: { id: ex.id } }));
      continue;
    }
    const present = win.effect !== "absent";
    const offsite = win.effect === "offsite";
    if (ex) {
      ops.push(
        db.attendanceRecord.update({
          where: { id: ex.id },
          data: { present, offsite, reason: win.type },
        }),
      );
    } else {
      ops.push(
        db.attendanceRecord.create({
          data: {
            organizationId: orgId,
            userId,
            date,
            present,
            offsite,
            reason: win.type,
            auto: true,
            createdById,
          },
        }),
      );
    }
  }
  if (ops.length) await db.$transaction(ops);
}
