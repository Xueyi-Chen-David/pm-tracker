/**
 * 任務（Task）的顯示/彙總邏輯（純函式，server 與 client 皆可用）。
 *
 * 合併「專案與任務」頁：每個 Project 卡片下掛多條 Task。卡片的彙總進度/健康度
 * 由底下任務即時算出（rollupTasks），並在任務異動時回寫到 Project，
 * 讓時程藍圖 / 週報 / 總覽 / 連動的季度 KR 全都讀到同一份當下值。
 *
 * Task 沿用 KrStatus enum（NOT_STARTED / IN_PROGRESS / DONE / BLOCKED / CANCELLED）。
 */
import type { Health, KrStatus } from "@prisma/client";

// 任務狀態的顯示樣式（與 OKR 的 KR 狀態一致）。
export { KR_STATUS as TASK_STATUS } from "@/lib/okr";

export type TaskRollup = {
  /** 0-100，各任務進度平均（不計「取消」）。 */
  progress: number;
  doneCount: number;
  /** 納入計算的任務數（不計「取消」）。 */
  total: number;
  /** 有紅則紅、有黃則黃、否則綠。 */
  health: Health;
};

type RollupTask = { status: KrStatus; health: Health; progress: number };

/**
 * 由任務算專案彙總。只計非「取消」者；沒有可計任務時 total=0（呼叫端據此決定
 * 是否回寫 Project —— 無任務時保留專案自身手動設定的進度/健康度）。
 */
export function rollupTasks(tasks: RollupTask[]): TaskRollup {
  const counted = tasks.filter((t) => t.status !== "CANCELLED");
  const total = counted.length;
  const doneCount = counted.filter((t) => t.status === "DONE").length;
  const progress =
    total === 0
      ? 0
      : Math.round(
          counted.reduce((s, t) => s + (t.progress || 0), 0) / total,
        );
  let health: Health = "GREEN";
  if (counted.some((t) => t.health === "RED")) health = "RED";
  else if (counted.some((t) => t.health === "YELLOW")) health = "YELLOW";
  return { progress, doneCount, total, health };
}
