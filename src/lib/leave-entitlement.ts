/**
 * 特別休假年資與天數（勞基法§38）純計算 —— 前後端共用。
 *
 * §38 給假標準（依同一雇主 / 事業單位繼續工作期間）：
 *   6 個月以上未滿 1 年：3 日
 *   1 年以上未滿 2 年：7 日
 *   2 年以上未滿 3 年：10 日
 *   3 年以上未滿 5 年：每年 14 日
 *   5 年以上未滿 10 年：每年 15 日
 *   10 年以上：每 1 年加給 1 日，加至 30 日為止
 *
 * 註：本計算以「到職日至指定日的連續年資」對應當前應有天數（近似週年制當年度額度），
 * 供顯示 / 額度追蹤；實際排休 / 遞延仍以公司制度（週年制 / 曆年制）為準。
 */

const DAY_MS = 24 * 3600 * 1000;

/** 到職日至 asOf 的連續年資（小數年）。asOf 預設今天由呼叫端傳入（純函式不取現在時間）。 */
export function serviceYears(hire: Date, asOf: Date): number {
  const ms = asOf.getTime() - hire.getTime();
  if (ms <= 0) return 0;
  return ms / (365.25 * DAY_MS);
}

/** 依年資（小數年）給特休天數（§38）。 */
export function specialLeaveDaysForYears(years: number): number {
  if (years < 0.5) return 0;
  if (years < 1) return 3;
  if (years < 2) return 7;
  if (years < 3) return 10;
  if (years < 5) return 14;
  if (years < 10) return 15;
  // 10 年（含）以上：15 + (完整年資 − 9)，上限 30。10yr→16、24yr→30。
  const y = Math.floor(years);
  return Math.min(30, 15 + (y - 9));
}

/** 由到職日與指定日直接給特休天數。無到職日回 null（未知）。 */
export function specialLeaveDays(
  hire: Date | null | undefined,
  asOf: Date,
): number | null {
  if (!hire) return null;
  return specialLeaveDaysForYears(serviceYears(hire, asOf));
}

/** 年資的中文顯示（如「3 年 2 個月」）。無到職日回「—」。 */
export function formatSeniority(
  hire: Date | null | undefined,
  asOf: Date,
): string {
  if (!hire) return "—";
  const y = serviceYears(hire, asOf);
  if (y <= 0) return "未到職";
  const totalMonths = Math.floor(y * 12);
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  if (years === 0) return `${months} 個月`;
  if (months === 0) return `${years} 年`;
  return `${years} 年 ${months} 個月`;
}
