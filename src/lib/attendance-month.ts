/**
 * 出勤「月份」的共用組裝邏輯——由 /attendance（全體）與 /checkin（個人）共用。
 *
 * 這裡的規則（尤其自動缺席的認定）必須兩頁一致：同一天在「出席狀況」被標成缺席、
 * 在個人「打卡 / 出勤」卻是空白，使用者只會覺得系統壞了。故集中在此，不各自實作。
 */
import type { GridDay, GridMember } from "@/components/attendance-grid";
import type { TimecardDay } from "@/components/attendance-timecard";
import type { AttendanceMonthMember } from "@/server/queries";

const WEEKDAY_LABEL = ["日", "一", "二", "三", "四", "五", "六"];

/** yyyy-MM → { year, month(1-12) }；無效則回退到指定的預設。 */
export function parseMonth(
  s: string | undefined,
  fallback: { year: number; month: number },
): { year: number; month: number } {
  if (s && /^\d{4}-\d{2}$/.test(s)) {
    const [y, m] = s.split("-").map(Number);
    if (y && m && m >= 1 && m <= 12) return { year: y, month: m };
  }
  return fallback;
}

/** { year, month } → "yyyy-MM"。 */
export function ym(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** 該月的起訖（UTC，end＝下月一號不含）與逐日格子。 */
export function monthRange(year: number, month: number) {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const days: GridDay[] = Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1;
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    return {
      day,
      dateStr: `${ym(year, month)}-${String(day).padStart(2, "0")}`,
      weekday,
      weekend: weekday === 0 || weekday === 6,
      label: `${month}/${day}（${WEEKDAY_LABEL[weekday]}）`,
    };
  });
  return { start, end, days };
}

/**
 * 把查詢結果組成月曆格子。
 *
 * 自動缺席（純顯示層、不寫 DB）：企業有開打卡、平日、落在 [第一次打卡日, 今天) 之間、
 * 且當天完全沒有紀錄 → 標記為「未打卡」缺席。被人工「清除」過的日子要尊重人工，
 * 不可再自動標缺席（否則清除後隔天又自己長回來）。免打卡的成員（checkInExempt）不判。
 */
export function buildGridMembers(
  rows: AttendanceMonthMember[],
  days: GridDay[],
  opts: {
    /** 企業已啟用打卡，且已有第一筆打卡（anchorStr 非 null）才會自動判缺席。 */
    autoAbsentEnabled: boolean;
    /** 該企業第一次打卡的日期 yyyy-MM-dd；在此之前不追溯。 */
    anchorStr: string | null;
    todayStr: string;
    /** 組織年度假日（日期 → 名稱）：當天沒有個人紀錄的人（新進 / 未追蹤）也顯示放假。 */
    orgHolidays?: Map<string, string | null>;
  },
): GridMember[] {
  return rows.map((m) => {
    const marks: GridMember["marks"] = {};
    const clearedDates = new Set<string>();
    for (const r of m.attendanceRecords) {
      const ds = r.date.toISOString().slice(0, 10);
      if (r.cleared) {
        clearedDates.add(ds);
        continue;
      }
      marks[ds] = {
        present: r.present,
        reason: r.reason,
        offsite: r.offsite,
        holiday: r.holiday,
        leave: r.leave,
        leaveHours: r.leaveHours ?? null,
        leaveTypeName: r.leaveType?.name ?? null,
      };
    }
    if (opts.orgHolidays) {
      for (const d of days) {
        if (d.weekend) continue;
        if (clearedDates.has(d.dateStr) || marks[d.dateStr]) continue; // 個人紀錄優先
        if (!opts.orgHolidays.has(d.dateStr)) continue;
        marks[d.dateStr] = {
          present: false,
          reason: opts.orgHolidays.get(d.dateStr) ?? null,
          offsite: false,
          holiday: true,
          leave: false,
          leaveHours: null,
          leaveTypeName: null,
        };
      }
    }
    if (opts.autoAbsentEnabled && !m.checkInExempt) {
      for (const d of days) {
        if (d.weekend) continue; // 週末不判缺席
        if (d.dateStr >= opts.todayStr) continue; // 今天與未來還能補打卡
        if (opts.anchorStr && d.dateStr < opts.anchorStr) continue; // 導入打卡前不追溯
        if (clearedDates.has(d.dateStr)) continue; // 人工清除過：尊重人工
        if (marks[d.dateStr]) continue; // 已有紀錄一律優先
        marks[d.dateStr] = {
          present: false,
          reason: "未打卡",
          offsite: false,
          holiday: false,
          leave: false,
          leaveHours: null,
          leaveTypeName: null,
        };
      }
    }
    return {
      id: m.id,
      name: m.name,
      nickname: m.nickname,
      useNickname: m.useNickname,
      email: m.email,
      image: m.image,
      isBoss: m.isBoss,
      marks,
    };
  });
}

export type PunchRow = {
  userId?: string;
  date: Date;
  at: Date;
  kind: string;
  method: string | null;
};

/**
 * 把某人整月的打卡彙整成「打卡紙」：每天取最早的上班與最晚的下班。
 * 只列到今天為止（未來的日子沒有意義）。
 */
export function buildTimecardDays(
  punches: PunchRow[],
  days: GridDay[],
  todayStr: string,
): TimecardDay[] {
  const byDate = new Map<string, PunchRow[]>();
  for (const c of punches) {
    const ds = c.date.toISOString().slice(0, 10);
    const arr = byDate.get(ds) ?? [];
    arr.push(c);
    byDate.set(ds, arr);
  }
  return days
    .filter((d) => d.dateStr <= todayStr)
    .map((d) => {
      const punchesOfDay = byDate.get(d.dateStr) ?? [];
      const ins = punchesOfDay.filter((p) => p.kind === "in");
      const outs = punchesOfDay.filter((p) => p.kind === "out");
      const firstIn = ins[0];
      const lastOut = outs[outs.length - 1];
      return {
        day: d.day,
        dateStr: d.dateStr,
        weekday: d.weekday,
        weekend: d.weekend,
        inAt: firstIn?.at.toISOString() ?? null,
        outAt: lastOut?.at.toISOString() ?? null,
        inMethod: firstIn?.method ?? null,
        outMethod: lastOut?.method ?? null,
      };
    });
}
