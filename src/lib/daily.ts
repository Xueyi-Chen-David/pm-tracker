/** 每日報告的小工具（純函式，server 與 client 共用）。 */

/** 數量顯示：整數不帶小數，其餘最多兩位。 */
export function fmtQty(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}
