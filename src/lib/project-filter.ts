import type {
  Health,
  Priority,
  ProjectStatus,
  ProjectType,
} from "@prisma/client";
import type { ProjectOverview } from "@/server/queries";
import { HEALTH, PRIORITY, PROJECT_STATUS, PROJECT_TYPE } from "@/lib/constants";

// ── 排序 ───────────────────────────────────────────────────────────────────

export type SortKey =
  | "default"
  | "name"
  | "type"
  | "status"
  | "priority"
  | "health"
  | "progress"
  | "target"
  | "updated";

export type SortDir = "asc" | "desc";

/** 工具列「排序」下拉的有序選項。 */
export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "default", label: "預設順序" },
  { value: "name", label: "名稱" },
  { value: "priority", label: "優先序" },
  { value: "health", label: "健康度" },
  { value: "progress", label: "進度" },
  { value: "target", label: "截止日" },
  { value: "status", label: "狀態" },
  { value: "type", label: "類型" },
  { value: "updated", label: "最近更新" },
];

/** 每個排序欄位「第一次點選」時最直覺的方向。 */
export const SORT_DEFAULT_DIR: Record<SortKey, SortDir> = {
  default: "asc",
  name: "asc",
  type: "asc",
  status: "asc",
  priority: "desc", // 緊急 → 低
  health: "desc", // 紅 → 綠
  progress: "desc", // 高完成度在前
  target: "asc", // 最近到期在前
  updated: "desc", // 最新在前
};

// 數值越大＝排序上「越大」（搭配方向決定先後）
const PRIORITY_RANK: Record<Priority, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
  URGENT: 3,
};
const HEALTH_RANK: Record<Health, number> = { GREEN: 0, YELLOW: 1, RED: 2 };
const STATUS_RANK: Record<ProjectStatus, number> = {
  NOT_STARTED: 0,
  ACTIVE: 1,
  ON_HOLD: 2,
  COMPLETED: 3,
  CANCELLED: 4,
};
const TYPE_RANK: Record<ProjectType, number> = {
  PROJECT: 0,
  ROUTINE: 1,
  ONE_TIME: 2,
};

function tiebreak(a: ProjectOverview, b: ProjectOverview): number {
  return a.name.localeCompare(b.name, "zh-Hant");
}

function primaryCompare(
  key: Exclude<SortKey, "default" | "target">,
  a: ProjectOverview,
  b: ProjectOverview,
): number {
  switch (key) {
    case "name":
      return a.name.localeCompare(b.name, "zh-Hant");
    case "type":
      return TYPE_RANK[a.type] - TYPE_RANK[b.type];
    case "status":
      return STATUS_RANK[a.status] - STATUS_RANK[b.status];
    case "priority":
      return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    case "health":
      return HEALTH_RANK[a.health] - HEALTH_RANK[b.health];
    case "progress":
      return a.progress - b.progress;
    case "updated":
      return a.updatedAt.getTime() - b.updatedAt.getTime();
  }
}

/** 依排序鍵與方向回傳新陣列；`default` 保留資料庫原順序（sortOrder）。 */
export function sortProjects(
  projects: ProjectOverview[],
  key: SortKey,
  dir: SortDir,
): ProjectOverview[] {
  if (key === "default") return projects;
  const mul = dir === "asc" ? 1 : -1;
  return [...projects].sort((a, b) => {
    // 截止日：無日期一律排在最後，不受方向影響
    if (key === "target") {
      const av = a.targetDate ? a.targetDate.getTime() : null;
      const bv = b.targetDate ? b.targetDate.getTime() : null;
      if (av === null && bv === null) return tiebreak(a, b);
      if (av === null) return 1;
      if (bv === null) return -1;
      return av !== bv ? (av - bv) * mul : tiebreak(a, b);
    }
    const c = primaryCompare(key, a, b);
    return c !== 0 ? c * mul : tiebreak(a, b);
  });
}

// ── 篩選 ───────────────────────────────────────────────────────────────────

export type ProjectFilters = {
  q?: string;
  type?: ProjectType;
  status?: ProjectStatus;
  priority?: Priority;
  health?: Health;
  /** userId，或 "none" 代表未指派負責人。 */
  owner?: string;
};

export function filterProjects(
  projects: ProjectOverview[],
  f: ProjectFilters,
): ProjectOverview[] {
  return projects.filter((p) => {
    if (f.type && p.type !== f.type) return false;
    if (f.status && p.status !== f.status) return false;
    if (f.priority && p.priority !== f.priority) return false;
    if (f.health && p.health !== f.health) return false;
    if (f.owner) {
      if (f.owner === "none") {
        if (p.ownerId) return false;
      } else if (p.ownerId !== f.owner) {
        return false;
      }
    }
    if (f.q) {
      const q = f.q.toLowerCase();
      const hay = `${p.name} ${p.description ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

// ── 視窗（tabs）篩選 ───────────────────────────────────────────────────────

/** 視窗條件：狀態 / 類型（空＝不限）；exclude=true 時顯示「不符合」者（反向）。 */
export type ViewSpec = {
  statuses: ProjectStatus[];
  types: ProjectType[];
  exclude: boolean;
};

export function matchesView(p: ProjectOverview, v: ViewSpec): boolean {
  const hasStatus = v.statuses.length > 0;
  const hasType = v.types.length > 0;
  if (!hasStatus && !hasType) return true; // 無條件＝全體
  const statusMatch = !hasStatus || v.statuses.includes(p.status);
  const typeMatch = !hasType || v.types.includes(p.type);
  const matched = statusMatch && typeMatch;
  return v.exclude ? !matched : matched;
}

export function filterByView(
  projects: ProjectOverview[],
  v: ViewSpec,
): ProjectOverview[] {
  return projects.filter((p) => matchesView(p, v));
}

/** 視窗條件的人類可讀摘要（給 tooltip / 說明用）。 */
export function describeView(v: ViewSpec): string {
  const parts: string[] = [];
  if (v.statuses.length)
    parts.push(v.statuses.map((s) => PROJECT_STATUS[s].label).join("、"));
  if (v.types.length)
    parts.push(v.types.map((t) => PROJECT_TYPE[t].label).join("、"));
  if (parts.length === 0) return "全部專案";
  return `${v.exclude ? "排除" : "只看"} ${parts.join(" + ")}`;
}

// ── 參數解析（server 端，從 searchParams 取值）─────────────────────────────

function asKey<T extends string>(
  value: string | undefined,
  valid: Record<T, unknown>,
): T | undefined {
  return value && value in valid ? (value as T) : undefined;
}

export function parseFilters(sp: Record<string, string | undefined>): ProjectFilters {
  const q = sp.q?.trim();
  const owner = sp.owner?.trim();
  return {
    q: q || undefined,
    type: asKey(sp.type, PROJECT_TYPE),
    status: asKey(sp.status, PROJECT_STATUS),
    priority: asKey(sp.priority, PRIORITY),
    health: asKey(sp.health, HEALTH),
    owner: owner || undefined,
  };
}

export function hasActiveFilters(f: ProjectFilters): boolean {
  return Boolean(f.q || f.type || f.status || f.priority || f.health || f.owner);
}

const SORT_KEYS = new Set(SORT_OPTIONS.map((o) => o.value));

export function parseSort(value: string | undefined): SortKey {
  return value && SORT_KEYS.has(value as SortKey) ? (value as SortKey) : "default";
}

export function parseDir(value: string | undefined, key: SortKey): SortDir {
  if (value === "asc" || value === "desc") return value;
  return SORT_DEFAULT_DIR[key];
}
