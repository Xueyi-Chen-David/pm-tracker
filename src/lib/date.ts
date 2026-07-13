import {
  startOfWeek,
  endOfWeek,
  format,
  addWeeks,
  isValid,
  parseISO,
} from "date-fns";

const WEEK_OPTS = { weekStartsOn: 1 as const }; // 週一為一週起點

/** 某日期所屬週的週一（時間歸零，作為 WeeklyUpdate.weekStart 的唯一鍵） */
export function weekStartOf(date: Date | string = new Date()): Date {
  const d = typeof date === "string" ? parseISO(date) : date;
  const start = startOfWeek(isValid(d) ? d : new Date(), WEEK_OPTS);
  // 用 UTC 午夜，避免時區把日期推前一天（對應 @db.Date）
  return new Date(
    Date.UTC(start.getFullYear(), start.getMonth(), start.getDate()),
  );
}

/** 本週週一 */
export function thisWeekStart(): Date {
  return weekStartOf(new Date());
}

/** 今天的 UTC 午夜（對應 @db.Date，避免時區位移）。 */
export function todayUtc(): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()));
}

/** n 天前的 UTC 午夜（趨勢 / 歷史起點用）。 */
export function daysAgoUtc(days: number): Date {
  return new Date(todayUtc().getTime() - days * 24 * 3600 * 1000);
}

/** 與某週相差 n 週的週一（n 可為負） */
export function shiftWeek(weekStart: Date | string, n: number): Date {
  return weekStartOf(addWeeks(weekStartOf(weekStart), n));
}

/** 週標籤，例：「6/22 – 6/28」 */
export function weekLabel(weekStart: Date | string): string {
  const start = weekStartOf(weekStart);
  const end = endOfWeek(start, WEEK_OPTS);
  return `${format(start, "M/d")} – ${format(end, "M/d")}`;
}

/** 週標籤（含年份），例：「2026/6/22 – 6/28」 */
export function weekLabelFull(weekStart: Date | string): string {
  const start = weekStartOf(weekStart);
  const end = endOfWeek(start, WEEK_OPTS);
  return `${format(start, "yyyy/M/d")} – ${format(end, "M/d")}`;
}

export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? parseISO(d) : d;
  return isValid(date) ? format(date, "yyyy/MM/dd") : "—";
}

/** 年月日順序的精簡日期（含年份），例：「2026/07/14」。 */
export function fmtDateShort(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? parseISO(d) : d;
  return isValid(date) ? format(date, "yyyy/MM/dd") : "—";
}

/** <input type="date"> 用的 yyyy-MM-dd */
export function toDateInput(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? parseISO(d) : d;
  return isValid(date) ? format(date, "yyyy-MM-dd") : "";
}

/** 是否逾期：targetDate 已過且尚未完成 */
export function isOverdue(
  targetDate: Date | string | null | undefined,
  completed: boolean,
): boolean {
  if (!targetDate || completed) return false;
  const date = typeof targetDate === "string" ? parseISO(targetDate) : targetDate;
  return isValid(date) && date.getTime() < Date.now();
}
