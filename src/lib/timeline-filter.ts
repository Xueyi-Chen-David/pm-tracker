import type { ProjectStatus } from "@prisma/client";

// 時程藍圖 / 週報的專案狀態篩選。放在一般模組（不是 "use client" 元件檔）：
// 伺服器端頁面要直接呼叫 parseTimelineStatuses，從 client 模組 import 的函式在伺服器上不能呼叫。

/** 可勾選的專案狀態（依序顯示）。 */
export const TIMELINE_STATUS_OPTIONS: { value: ProjectStatus; label: string }[] = [
  { value: "ACTIVE", label: "進行中" },
  { value: "COMPLETED", label: "已完成" },
  { value: "CANCELLED", label: "已取消" },
];

export const TIMELINE_DEFAULT_STATUSES: ProjectStatus[] = ["ACTIVE"];

/** ?status=ACTIVE,COMPLETED → 狀態清單；沒帶時用預設（只看進行中）。 */
export function parseTimelineStatuses(raw: string | undefined): ProjectStatus[] {
  if (raw === undefined) return TIMELINE_DEFAULT_STATUSES;
  const valid = new Set(TIMELINE_STATUS_OPTIONS.map((o) => o.value));
  return raw.split(",").filter((s): s is ProjectStatus => valid.has(s as ProjectStatus));
}
