/**
 * 台灣國定假日——供「出席狀況」年度假日匯入使用（純函式，前後端共用）。
 *
 * 只列「紀念日及節日實施辦法」中日期逐年固定、完全不受農曆影響的假日，
 * 年年都能放心用公式算出來：
 *   1/1  元旦
 *   2/28 和平紀念日
 *   4/4  兒童節
 *   5/1  勞動節
 *   10/10 國慶日
 *
 * 農曆假期（除夕、春節初一～初三、端午節、中秋節）與清明節（隨民族掃墓節，多數
 * 年份落在 4/4 或 4/5，但仍可能因政府公告調整）逐年會變動，沒有公式能可靠推算，
 * 故刻意不在此自動產生錯誤日期——匯入畫面會提示這些假期需比照政府行政機關
 * 辦公日曆表自行輸入（沿用既有的「手動新增」）。
 */

export type FixedHoliday = { month: number; day: number; name: string };

export const TW_FIXED_HOLIDAYS: readonly FixedHoliday[] = [
  { month: 1, day: 1, name: "元旦" },
  { month: 2, day: 28, name: "和平紀念日" },
  { month: 4, day: 4, name: "兒童節" },
  { month: 5, day: 1, name: "勞動節" },
  { month: 10, day: 10, name: "國慶日" },
] as const;

export type HolidayDate = { date: string; name: string };

/** 給定年份，算出當年度「日期固定」的國定假日（yyyy-mm-dd + 名稱），依日期排序。 */
export function fixedHolidaysForYear(year: number): HolidayDate[] {
  return TW_FIXED_HOLIDAYS.map((h) => ({
    date: `${year}-${String(h.month).padStart(2, "0")}-${String(h.day).padStart(2, "0")}`,
    name: h.name,
  })).sort((a, b) => a.date.localeCompare(b.date));
}
