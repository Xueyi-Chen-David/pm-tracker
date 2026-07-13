/**
 * CRM 顯示 / 衍生邏輯（純函式，server 與 client 皆可用）。
 * 銷售管線 4 階段（LEAD→QUALIFIED→PROPOSAL→NEGOTIATION），成交/流失後離開管線。
 */
import type { CrmStage, CrmDealStatus } from "@prisma/client";

/** 管線階段順序（＝看板欄位順序）。 */
export const CRM_STAGES: readonly CrmStage[] = [
  "LEAD",
  "QUALIFIED",
  "PROPOSAL",
  "NEGOTIATION",
] as const;

export const CRM_STAGE_META: Record<
  CrmStage,
  { label: string; dot: string; head: string }
> = {
  LEAD: { label: "潛在", dot: "bg-slate-400", head: "border-t-slate-400" },
  QUALIFIED: { label: "已確認", dot: "bg-sky-500", head: "border-t-sky-500" },
  PROPOSAL: { label: "提案報價", dot: "bg-violet-500", head: "border-t-violet-500" },
  NEGOTIATION: { label: "議約中", dot: "bg-amber-500", head: "border-t-amber-500" },
};

export const CRM_STAGE_OPTIONS = CRM_STAGES.map((s) => ({
  value: s,
  label: CRM_STAGE_META[s].label,
}));

export const CRM_STATUS_META: Record<
  CrmDealStatus,
  { label: string; badge: string }
> = {
  OPEN: { label: "進行中", badge: "bg-blue-100 text-blue-700 border-blue-200" },
  WON: {
    label: "成交",
    badge: "bg-emerald-100 text-emerald-700 border-emerald-200",
  },
  LOST: { label: "流失", badge: "bg-rose-100 text-rose-700 border-rose-200" },
};

/** 活動類型（電話 / 會議 / Email / 備註 / 待辦）。 */
export const CRM_ACTIVITY_TYPES = [
  { value: "note", label: "備註", icon: "📝" },
  { value: "call", label: "電話", icon: "📞" },
  { value: "email", label: "Email", icon: "✉️" },
  { value: "meeting", label: "會議", icon: "🤝" },
  { value: "task", label: "待辦", icon: "✅" },
] as const;

export const CRM_ACTIVITY_LABEL: Record<string, string> = Object.fromEntries(
  CRM_ACTIVITY_TYPES.map((t) => [t.value, t.label]),
);
export const CRM_ACTIVITY_ICON: Record<string, string> = Object.fromEntries(
  CRM_ACTIVITY_TYPES.map((t) => [t.value, t.icon]),
);

/** 金額格式（日圓，含千分位）。 */
export function fmtMoney(v: number): string {
  return "¥" + Math.round(v || 0).toLocaleString("ja-JP");
}

/** 精簡金額（大額縮寫，卡片用）：¥1.2M / ¥350K / ¥900。 */
export function fmtMoneyShort(v: number): string {
  const n = Math.round(v || 0);
  if (n >= 1_000_000) return `¥${(n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0)}M`;
  if (n >= 10_000) return `¥${(n / 1_000).toFixed(0)}K`;
  return "¥" + n.toLocaleString("ja-JP");
}
