import type {
  ProjectType,
  ProjectStatus,
  Health,
  Priority,
  MemberRole,
  MilestoneStatus,
} from "@prisma/client";

type Meta = {
  label: string;
  /** tailwind 類別：背景/文字/邊框，用於 badge */
  badge: string;
  /** 純色點（紅黃綠燈等） */
  dot?: string;
};

export const PROJECT_TYPE: Record<ProjectType, Meta & { hint: string }> = {
  ROUTINE: {
    label: "常態型",
    hint: "持續進行、無明確結束日（如維運、讀書會）",
    badge: "bg-sky-100 text-sky-700 border-sky-200",
  },
  PROJECT: {
    label: "專案型",
    hint: "有起訖、目標明確的階段性工作",
    badge: "bg-violet-100 text-violet-700 border-violet-200",
  },
  ONE_TIME: {
    label: "一次性",
    hint: "單次任務，完成即結束",
    badge: "bg-amber-100 text-amber-700 border-amber-200",
  },
};

export const PROJECT_STATUS: Record<ProjectStatus, Meta> = {
  NOT_STARTED: { label: "未開始", badge: "bg-slate-100 text-slate-600 border-slate-200" },
  ACTIVE: { label: "進行中", badge: "bg-blue-100 text-blue-700 border-blue-200" },
  ON_HOLD: { label: "暫停", badge: "bg-zinc-100 text-zinc-600 border-zinc-200" },
  COMPLETED: { label: "已完成", badge: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  CANCELLED: { label: "已取消", badge: "bg-red-50 text-red-400 border-red-100 line-through" },
};

// RAG 紅黃綠燈 —— 整個系統「一眼看問題」的核心
export const HEALTH: Record<Health, Meta> = {
  GREEN: {
    label: "順利",
    badge: "bg-emerald-100 text-emerald-700 border-emerald-200",
    dot: "bg-emerald-500",
  },
  YELLOW: {
    label: "需注意",
    badge: "bg-amber-100 text-amber-700 border-amber-200",
    dot: "bg-amber-500",
  },
  RED: {
    label: "有阻礙",
    badge: "bg-red-100 text-red-700 border-red-200",
    dot: "bg-red-500",
  },
};

export const PRIORITY: Record<Priority, Meta> = {
  LOW: { label: "低", badge: "bg-slate-100 text-slate-500 border-slate-200" },
  MEDIUM: { label: "中", badge: "bg-sky-100 text-sky-600 border-sky-200" },
  HIGH: { label: "高", badge: "bg-orange-100 text-orange-700 border-orange-200" },
  URGENT: { label: "緊急", badge: "bg-red-100 text-red-700 border-red-200" },
};

export const MEMBER_ROLE: Record<MemberRole, Meta> = {
  OWNER: { label: "負責人", badge: "bg-violet-100 text-violet-700 border-violet-200" },
  MEMBER: { label: "成員", badge: "bg-slate-100 text-slate-600 border-slate-200" },
  VIEWER: { label: "檢視者", badge: "bg-zinc-100 text-zinc-500 border-zinc-200" },
};

export const MILESTONE_STATUS: Record<MilestoneStatus, Meta> = {
  PLANNED: { label: "規劃中", badge: "bg-slate-100 text-slate-600 border-slate-200", dot: "bg-slate-400" },
  IN_PROGRESS: { label: "進行中", badge: "bg-blue-100 text-blue-700 border-blue-200", dot: "bg-blue-500" },
  DONE: { label: "已完成", badge: "bg-emerald-100 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
  MISSED: { label: "已逾期", badge: "bg-red-100 text-red-700 border-red-200", dot: "bg-red-500" },
};

// 下拉選單用的有序選項
export const PROJECT_TYPE_OPTIONS = (Object.keys(PROJECT_TYPE) as ProjectType[]).map((v) => ({
  value: v,
  label: PROJECT_TYPE[v].label,
}));
export const PROJECT_STATUS_OPTIONS = (Object.keys(PROJECT_STATUS) as ProjectStatus[]).map((v) => ({
  value: v,
  label: PROJECT_STATUS[v].label,
}));
export const HEALTH_OPTIONS = (Object.keys(HEALTH) as Health[]).map((v) => ({
  value: v,
  label: HEALTH[v].label,
}));
export const PRIORITY_OPTIONS = (Object.keys(PRIORITY) as Priority[]).map((v) => ({
  value: v,
  label: PRIORITY[v].label,
}));
export const MEMBER_ROLE_OPTIONS = (Object.keys(MEMBER_ROLE) as MemberRole[]).map((v) => ({
  value: v,
  label: MEMBER_ROLE[v].label,
}));
export const MILESTONE_STATUS_OPTIONS = (Object.keys(MILESTONE_STATUS) as MilestoneStatus[]).map(
  (v) => ({ value: v, label: MILESTONE_STATUS[v].label }),
);

// 會議類別（預設選項，使用者也可自訂輸入）
export const MEETING_CATEGORIES = [
  "全體會議",
  "研發部會議",
  "經營會議",
  "業務會議",
  "其他",
];

const MEETING_BADGE: Record<string, string> = {
  全體會議: "bg-violet-100 text-violet-700 border-violet-200",
  研發部會議: "bg-blue-100 text-blue-700 border-blue-200",
  經營會議: "bg-amber-100 text-amber-700 border-amber-200",
  業務會議: "bg-emerald-100 text-emerald-700 border-emerald-200",
};

/** 會議類別的 badge 樣式（未知類別給中性色）。 */
export function meetingCategoryBadge(category: string): string {
  return MEETING_BADGE[category] ?? "bg-slate-100 text-slate-600 border-slate-200";
}

// 成員事件類型（請假 / 出差 等；可自訂輸入）
export const MEMBER_EVENT_TYPES = [
  "請假",
  "出差",
  "在家工作",
  "外出",
  "其他",
];

const MEMBER_EVENT_BADGE: Record<string, string> = {
  請假: "bg-rose-100 text-rose-700 border-rose-200",
  出差: "bg-blue-100 text-blue-700 border-blue-200",
  在家工作: "bg-emerald-100 text-emerald-700 border-emerald-200",
  外出: "bg-amber-100 text-amber-700 border-amber-200",
};

/** 成員事件類型的 badge 樣式（未知類型給中性色）。 */
export function memberEventBadge(type: string): string {
  return (
    MEMBER_EVENT_BADGE[type] ?? "bg-slate-100 text-slate-600 border-slate-200"
  );
}
