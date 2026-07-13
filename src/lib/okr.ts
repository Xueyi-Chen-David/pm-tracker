/**
 * OKR 的顯示/衍生邏輯（純函式，server 與 client 皆可用）。
 *
 * 核心：OKR 是「即時鏡子」。一條 KR 若連到 Project，其 狀態/進度/健康度
 * 改讀「專案當下值」（resolveKr）；未連的用自身欄位。Objective 的彙總
 * 由底下 KR 的當下值即時算出（rollupObjective）。
 */
import type { Health, KrStatus, ProjectStatus } from "@prisma/client";

type Meta = { label: string; badge: string };

/** KR 狀態的顯示樣式（對齊系統既有 badge 風格）。 */
export const KR_STATUS: Record<KrStatus, Meta> = {
  NOT_STARTED: { label: "未開始", badge: "bg-slate-100 text-slate-600 border-slate-200" },
  IN_PROGRESS: { label: "進行中", badge: "bg-blue-100 text-blue-700 border-blue-200" },
  DONE: { label: "已完成", badge: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  BLOCKED: { label: "延宕", badge: "bg-rose-100 text-rose-700 border-rose-200" },
  CANCELLED: { label: "取消", badge: "bg-red-50 text-red-400 border-red-100 line-through" },
};

export const KR_STATUS_OPTIONS = (Object.keys(KR_STATUS) as KrStatus[]).map(
  (v) => ({ value: v, label: KR_STATUS[v].label }),
);

/** 專案狀態 → KR 狀態（連專案時用專案狀態衍生）。 */
const PROJECT_TO_KR_STATUS: Record<ProjectStatus, KrStatus> = {
  NOT_STARTED: "NOT_STARTED",
  ACTIVE: "IN_PROGRESS",
  ON_HOLD: "BLOCKED",
  COMPLETED: "DONE",
  CANCELLED: "CANCELLED",
};

export type ProjectSnapshot = {
  id: string;
  name: string;
  status: ProjectStatus;
  health: Health;
  progress: number;
};

export type ResolvableKr = {
  kind: string;
  status: KrStatus;
  health: Health;
  progress: number;
  project: ProjectSnapshot | null;
};

export type ResolvedKr = {
  status: KrStatus;
  health: Health;
  progress: number;
  /** 是否連到專案（＝狀態由專案即時帶入）。 */
  linked: boolean;
  project: ProjectSnapshot | null;
};

/** 解析一條 KR 的「當下」狀態：連專案讀專案值，否則用自身欄位。 */
export function resolveKr(kr: ResolvableKr): ResolvedKr {
  if (kr.project) {
    return {
      status: PROJECT_TO_KR_STATUS[kr.project.status],
      health: kr.project.health,
      progress: kr.project.progress,
      linked: true,
      project: kr.project,
    };
  }
  return {
    status: kr.status,
    health: kr.health,
    progress: kr.progress,
    linked: false,
    project: null,
  };
}

export type ObjectiveRollup = {
  progress: number; // 0-100，各 KR 當下進度平均
  doneCount: number;
  total: number;
  health: Health; // 有紅則紅、有黃則黃、否則綠
};

/**
 * 由已解析的 KR 算 Objective 彙總。
 * 只計 kind==="kr" 且非「取消」者；沒有可計 KR 時進度 0、健康度綠。
 */
export function rollupObjective(
  krs: { kind: string; resolved: ResolvedKr }[],
): ObjectiveRollup {
  const counted = krs.filter(
    (k) => k.kind === "kr" && k.resolved.status !== "CANCELLED",
  );
  const total = counted.length;
  const doneCount = counted.filter((k) => k.resolved.status === "DONE").length;
  const progress =
    total === 0
      ? 0
      : Math.round(
          counted.reduce((s, k) => s + (k.resolved.progress || 0), 0) / total,
        );
  let health: Health = "GREEN";
  if (counted.some((k) => k.resolved.health === "RED")) health = "RED";
  else if (counted.some((k) => k.resolved.health === "YELLOW")) health = "YELLOW";
  return { progress, doneCount, total, health };
}

/** 依當前日期猜「本季」cycle 標籤，如 "2026 Q3"。 */
export function currentCycle(now = new Date()): string {
  const q = Math.floor(now.getMonth() / 3) + 1;
  return `${now.getFullYear()} Q${q}`;
}

// ── 季度 cycle 工具（季度 OKR：先選年份，再分 Q1–Q4） ──────────────

export const QUARTERS = [1, 2, 3, 4] as const;

/** 各季對應月份（顯示用）。 */
export const QUARTER_MONTHS: Record<number, string> = {
  1: "1–3 月",
  2: "4–6 月",
  3: "7–9 月",
  4: "10–12 月",
};

/** 目前年份字串，如 "2026"。 */
export function currentYear(now = new Date()): string {
  return String(now.getFullYear());
}

/** 組出季度 cycle 標籤：quarterCycle("2026", 3) → "2026 Q3"。 */
export function quarterCycle(year: string, q: number): string {
  return `${year} Q${q}`;
}

/** 從 cycle 取年份："2026 Q3" / "2026" → "2026"。 */
export function cycleYear(cycle: string): string {
  return cycle.split(" ")[0] ?? cycle;
}

/** 從季度 cycle 取季別："2026 Q3" → 3；非季度格式回 null。 */
export function cycleQuarter(cycle: string): number | null {
  const m = cycle.match(/Q([1-4])/);
  return m ? Number(m[1]) : null;
}
