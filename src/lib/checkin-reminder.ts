/**
 * 「今天忘了打卡」提醒的判斷邏輯：純函式，方便測試，也讓前後端用同一套規則。
 *
 * 設計前提是「提醒但不騷擾」，所以規則寫得比「沒打卡就叫」保守很多：
 *   - 有寬限時間：上班時間過了一段才提（預設 10:00），不會一早就催人。
 *   - 只提醒還有意義的那一張卡：沒打上班卡就講上班，打了上班沒打下班才講下班
 *     （下班另等到 18:30 之後）；兩者不會同時出現。
 *   - 當天請假 / 出差 / 休假 / 人工清除 → 本來就不用打卡，完全不提。
 *   - 已送出補打卡申請 → 人已經處理過了，不再嘮叨。
 *   - 週末不提。
 * 「使用者今天已經按過『不再提醒』」不在這裡判斷——那是瀏覽器端的偏好，
 * 見 components/checkin-reminder.tsx。
 */

/** 上班卡的寬限：台灣時間 10:00 之後才提醒（分鐘數，自午夜起算）。 */
export const REMIND_IN_AFTER_MIN = 10 * 60;

/** 下班卡的寬限：台灣時間 18:30 之後才提醒。 */
export const REMIND_OUT_AFTER_MIN = 18 * 60 + 30;

/** Asia/Taipei 全年固定 UTC+8（無日光節約時間）。 */
const TAIPEI_UTC_OFFSET_MIN = 8 * 60;

/**
 * 目前的「台灣當地時刻」自午夜起算的分鐘數（0–1439）。
 *
 * 刻意不看裝置時區：打卡日（CheckIn.date）是以伺服器 UTC 日期記的，全站也都以
 * 台灣時間為準；若這裡改讀裝置本地時間，出國 / 時區設錯的人會在奇怪的時間被提醒。
 */
export function taipeiMinutesOfDay(nowMs: number): number {
  const min = Math.floor(nowMs / 60_000) + TAIPEI_UTC_OFFSET_MIN;
  return ((min % 1440) + 1440) % 1440;
}

/** 分鐘數 → "HH:mm"（顯示「現在幾點」用）。 */
export function formatClock(minutesOfDay: number): string {
  const h = Math.floor(minutesOfDay / 60);
  const m = minutesOfDay % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** 提醒的種類：上班卡 / 下班卡。 */
export type CheckInReminderKind = "in" | "out";

/**
 * 判斷提醒所需的「今日事實」，由伺服器算好丟給前端（前端只負責看時鐘）。
 * 企業未啟用打卡、或正在預覽他人視角時，伺服器直接給 null，不會有任何提醒。
 */
export type CheckInReminderFacts = {
  /** 打卡日 yyyy-MM-dd（＝ CheckIn.date，也是「今天不再提醒」的記錄鍵）。 */
  todayStr: string;
  /** 今天是週末（不提醒）。 */
  weekend: boolean;
  /** 今天已有有效的上班 / 下班打卡。 */
  hasIn: boolean;
  hasOut: boolean;
  /** 今天是請假 / 出差 / 在家工作 / 休假 / 已被人工清除 → 不需要打卡。 */
  dayOff: boolean;
  /** 今天已送出、還在審核中的補打卡申請（該種類）。 */
  pendingIn: boolean;
  pendingOut: boolean;
  /** 今天最早的上班打卡時間 "HH:mm"（下班提醒的說明文字用）。 */
  inAtLabel: string | null;
};

/**
 * 現在該不該提醒、提醒哪一張卡；不需要提醒時回傳 null。
 * minutesOfDay＝台灣當地時刻（見 taipeiMinutesOfDay）。
 */
export function checkInReminderKind(
  facts: CheckInReminderFacts,
  minutesOfDay: number,
): CheckInReminderKind | null {
  if (facts.weekend || facts.dayOff) return null;
  if (!facts.hasIn) {
    // 沒打上班卡：過了寬限就提醒；已申請補打卡則安靜。
    if (facts.pendingIn) return null;
    return minutesOfDay >= REMIND_IN_AFTER_MIN ? "in" : null;
  }
  if (!facts.hasOut) {
    // 有上班沒下班：傍晚之後才提（白天講下班卡只會被當噪音）。
    if (facts.pendingOut) return null;
    return minutesOfDay >= REMIND_OUT_AFTER_MIN ? "out" : null;
  }
  return null;
}
