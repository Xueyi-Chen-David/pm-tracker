/**
 * CRM 顯示 / 衍生邏輯（純函式，server 與 client 皆可用）。
 * 銷售管線階段改為「每組織可自訂」（DealStage 資料表）；此處只留預設種子與色彩表。
 */
import type { CrmDealStatus } from "@prisma/client";

/** 新組織種下的預設階段（可事後新增 / 編輯 / 改順序）。key 為穩定鍵。 */
export const DEFAULT_DEAL_STAGES = [
  { key: "LEAD", label: "潛在", color: "slate" },
  { key: "CONTACTED", label: "已接觸", color: "sky" },
  { key: "REPLIED", label: "已回覆", color: "cyan" },
  { key: "MEETING", label: "會議", color: "violet" },
  { key: "TRIAL", label: "試用", color: "amber" },
  { key: "ACTIVE", label: "正式服務", color: "emerald" },
  { key: "FAILED", label: "已失敗", color: "rose" },
  { key: "PAUSED", label: "暫停追蹤", color: "zinc" },
] as const;

type StageColorMeta = { dot: string; head: string; chip: string };

/** 階段可選色彩 → tailwind 類別（dot 圓點 / head 欄位上緣 / chip 時間線徽章）。 */
export const STAGE_COLORS: Record<string, StageColorMeta> = {
  slate: { dot: "bg-slate-400", head: "border-t-slate-400", chip: "bg-slate-100 text-slate-700" },
  zinc: { dot: "bg-zinc-400", head: "border-t-zinc-400", chip: "bg-zinc-100 text-zinc-700" },
  sky: { dot: "bg-sky-500", head: "border-t-sky-500", chip: "bg-sky-100 text-sky-700" },
  blue: { dot: "bg-blue-500", head: "border-t-blue-500", chip: "bg-blue-100 text-blue-700" },
  cyan: { dot: "bg-cyan-500", head: "border-t-cyan-500", chip: "bg-cyan-100 text-cyan-700" },
  teal: { dot: "bg-teal-500", head: "border-t-teal-500", chip: "bg-teal-100 text-teal-700" },
  violet: { dot: "bg-violet-500", head: "border-t-violet-500", chip: "bg-violet-100 text-violet-700" },
  indigo: { dot: "bg-indigo-500", head: "border-t-indigo-500", chip: "bg-indigo-100 text-indigo-700" },
  amber: { dot: "bg-amber-500", head: "border-t-amber-500", chip: "bg-amber-100 text-amber-700" },
  orange: { dot: "bg-orange-500", head: "border-t-orange-500", chip: "bg-orange-100 text-orange-700" },
  emerald: { dot: "bg-emerald-500", head: "border-t-emerald-500", chip: "bg-emerald-100 text-emerald-700" },
  green: { dot: "bg-green-500", head: "border-t-green-500", chip: "bg-green-100 text-green-700" },
  rose: { dot: "bg-rose-500", head: "border-t-rose-500", chip: "bg-rose-100 text-rose-700" },
  pink: { dot: "bg-pink-500", head: "border-t-pink-500", chip: "bg-pink-100 text-pink-700" },
};

export const STAGE_COLOR_NAMES = Object.keys(STAGE_COLORS);

/** 取色彩 meta（未知色回退 slate）。 */
export function stageColor(color: string | null | undefined): StageColorMeta {
  return (color && STAGE_COLORS[color]) || STAGE_COLORS.slate;
}

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
