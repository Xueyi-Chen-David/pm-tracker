import type { TrainingFormat, TrainingStatus } from "@prisma/client";

export const TRAINING_FORMAT: Record<
  TrainingFormat,
  { label: string; badge: string }
> = {
  ONLINE: { label: "線上課程", badge: "bg-blue-100 text-blue-700 border-blue-200" },
  VIDEO: { label: "影片", badge: "bg-violet-100 text-violet-700 border-violet-200" },
  DOCUMENT: {
    label: "文件閱讀",
    badge: "bg-slate-100 text-slate-600 border-slate-200",
  },
  IN_PERSON: {
    label: "實體課程",
    badge: "bg-amber-100 text-amber-700 border-amber-200",
  },
  EXTERNAL: {
    label: "外部 / 認證",
    badge: "bg-emerald-100 text-emerald-700 border-emerald-200",
  },
};

export const TRAINING_STATUS: Record<
  TrainingStatus,
  { label: string; badge: string; dot: string }
> = {
  NOT_STARTED: {
    label: "未開始",
    badge: "bg-slate-100 text-slate-600 border-slate-200",
    dot: "bg-slate-400",
  },
  IN_PROGRESS: {
    label: "進行中",
    badge: "bg-blue-100 text-blue-700 border-blue-200",
    dot: "bg-blue-500",
  },
  COMPLETED: {
    label: "已完成",
    badge: "bg-emerald-100 text-emerald-700 border-emerald-200",
    dot: "bg-emerald-500",
  },
};

export const TRAINING_FORMAT_OPTIONS = (
  Object.keys(TRAINING_FORMAT) as TrainingFormat[]
).map((v) => ({ value: v, label: TRAINING_FORMAT[v].label }));

export const TRAINING_STATUS_ORDER: TrainingStatus[] = [
  "NOT_STARTED",
  "IN_PROGRESS",
  "COMPLETED",
];

/** 常用課程分類（可自訂輸入）。 */
export const TRAINING_CATEGORIES = [
  "新人訓練",
  "法遵 / 合規",
  "專業技能",
  "職場安全",
  "資訊安全",
  "領導管理",
  "一般",
];

/** 逾期：有到期日、尚未完成、且已過期。 */
export function isTrainingOverdue(
  dueDate: Date | string | null,
  status: TrainingStatus,
): boolean {
  if (!dueDate || status === "COMPLETED") return false;
  const d = typeof dueDate === "string" ? new Date(dueDate) : dueDate;
  return d.getTime() < Date.now();
}

/** 需重訓：已完成、課程設有有效月數、且完成日 + 月數已過。 */
export function needsRenewal(
  completedAt: Date | string | null,
  renewMonths: number | null | undefined,
): boolean {
  if (!completedAt || !renewMonths) return false;
  const c = typeof completedAt === "string" ? new Date(completedAt) : completedAt;
  const expiry = new Date(c);
  expiry.setMonth(expiry.getMonth() + renewMonths);
  return expiry.getTime() < Date.now();
}

/** 預估時數的可讀標籤。 */
export function estMinLabel(min: number | null | undefined): string | null {
  if (!min || min <= 0) return null;
  if (min < 60) return `${min} 分鐘`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} 小時 ${m} 分` : `${h} 小時`;
}
