import type { PrismaClient } from "@prisma/client";
import { eventTypeMarksAbsent } from "@/lib/constants";

// 請假事件 ↔ 出席月曆 的同步邏輯（純資料層，傳入 Prisma client 以便測試）。
// 只處理「缺席」類型（目前只有請假）；出差 / 在家工作 / 外出 不動出席紀錄。

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

/**
 * 請假事件 → 出席月曆：把範圍內每個平日標記為缺席（自動）。
 * - 尚無紀錄：新增一筆自動缺席（reason = 事件類型）。
 * - 已是自動紀錄：更新為缺席並刷新原因。
 * - 已是人工紀錄（autoAbsent=false）：尊重人工設定，不覆蓋。
 */
export async function applyEventAbsence(
  db: PrismaClient,
  orgId: string,
  userId: string,
  type: string,
  createdById: string,
  start: Date,
  end: Date,
) {
  const days = weekdaysInRange(start, end);
  if (!days.length) return;

  const existing = await db.attendanceRecord.findMany({
    where: { organizationId: orgId, userId, date: { in: days } },
    select: { date: true, autoAbsent: true },
  });
  const byTime = new Map(existing.map((r) => [r.date.getTime(), r]));

  const toCreate = days.filter((d) => !byTime.has(d.getTime()));
  const toRefresh = days.filter((d) => byTime.get(d.getTime())?.autoAbsent);

  await db.$transaction([
    ...(toCreate.length
      ? [
          db.attendanceRecord.createMany({
            data: toCreate.map((date) => ({
              organizationId: orgId,
              userId,
              date,
              present: false,
              reason: type,
              autoAbsent: true,
              createdById,
            })),
            skipDuplicates: true,
          }),
        ]
      : []),
    ...toRefresh.map((date) =>
      db.attendanceRecord.updateMany({
        where: { organizationId: orgId, userId, date },
        data: { present: false, reason: type },
      }),
    ),
  ]);
}

/**
 * 刪除請假事件後回收自動缺席紀錄：範圍內每個平日，若已無其他請假事件覆蓋，
 * 就刪掉那天的「自動」缺席（autoAbsent=true）。人工紀錄一律保留。
 * 注意：呼叫前應已把被刪的事件從 DB 移除，避免它自己算進「仍被覆蓋」。
 */
export async function removeEventAbsence(
  db: PrismaClient,
  orgId: string,
  userId: string,
  start: Date,
  end: Date,
) {
  const days = weekdaysInRange(start, end);
  if (!days.length) return;

  // 此人其餘（尚存）、開始日不晚於本範圍結束的事件——用來判斷是否仍被覆蓋。
  const others = await db.memberEvent.findMany({
    where: { organizationId: orgId, userId, startDate: { lte: end } },
    select: { type: true, startDate: true, endDate: true },
  });
  const absentOthers = others.filter((e) => eventTypeMarksAbsent(e.type));
  const covered = (date: Date) =>
    absentOthers.some((e) => {
      const s = e.startDate.getTime();
      const en = (e.endDate ?? e.startDate).getTime();
      return date.getTime() >= s && date.getTime() <= en;
    });

  const toDelete = days.filter((d) => !covered(d));
  if (!toDelete.length) return;

  await db.attendanceRecord.deleteMany({
    where: {
      organizationId: orgId,
      userId,
      autoAbsent: true,
      date: { in: toDelete },
    },
  });
}
