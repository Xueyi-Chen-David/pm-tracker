/**
 * 請假簽核（Leave approval）的純邏輯與顯示常數 —— 前後端共用，故不 import db / server-only。
 *
 * 流程：員工送出請假申請 → 依組織設定的「簽核關卡」逐關簽核 → 全部核准才寫入出席月曆。
 * 每一關的簽核人可以是「申請人的直屬主管」(MANAGER，送出時動態解析) 或「指定成員」(MEMBER)。
 */

/** 簽核人解析方式。 */
export const APPROVER_TYPES = ["MANAGER", "MEMBER"] as const;
export type ApproverType = (typeof APPROVER_TYPES)[number];

export const APPROVER_TYPE_LABEL: Record<string, string> = {
  MANAGER: "直屬主管",
  MEMBER: "指定成員",
};

/** 請假申請狀態。 */
export type LeaveStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

export const LEAVE_STATUS: Record<
  LeaveStatus,
  { label: string; badge: string }
> = {
  PENDING: { label: "待簽核", badge: "bg-amber-100 text-amber-700 border-amber-200" },
  APPROVED: { label: "已核准", badge: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  REJECTED: { label: "已駁回", badge: "bg-rose-100 text-rose-700 border-rose-200" },
  CANCELLED: { label: "已取消", badge: "bg-slate-100 text-slate-500 border-slate-200" },
};

/** 單一簽核關卡的狀態（某申請的其中一關）。 */
export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED";

export const APPROVAL_STATUS: Record<
  ApprovalStatus,
  { label: string; badge: string }
> = {
  PENDING: { label: "待簽", badge: "bg-amber-100 text-amber-700 border-amber-200" },
  APPROVED: { label: "已核准", badge: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  REJECTED: { label: "已駁回", badge: "bg-rose-100 text-rose-700 border-rose-200" },
};

export function leaveStatusMeta(status: string) {
  return LEAVE_STATUS[status as LeaveStatus] ?? LEAVE_STATUS.PENDING;
}
export function approvalStatusMeta(status: string) {
  return APPROVAL_STATUS[status as ApprovalStatus] ?? APPROVAL_STATUS.PENDING;
}

/** 組織簽核關卡設定（解析用最小形狀）。 */
export type ApprovalStepConfig = {
  approverType: string; // "MANAGER" | "MEMBER"
  approverMemberId: string | null;
};

/**
 * 把組織的簽核關卡解析成「這次申請」的實際簽核人序列（membership id，依序）。
 * 過濾規則：
 *   - 無法解析的關卡（MANAGER 但申請人沒有主管、MEMBER 但沒指定 / 該成員已不在）→ 略過。
 *   - 簽核人＝申請人本人 → 略過（不能簽自己的假）。
 *   - 與「前一關」相同的簽核人 → 併關（避免同一人連續簽兩次）。
 * validMemberIds 給定時，會濾掉已不存在 / 停用的簽核成員。
 */
export function resolveApprovalChain(
  steps: ApprovalStepConfig[],
  requesterMemberId: string,
  directManagerId: string | null,
  validMemberIds?: Set<string>,
): string[] {
  const out: string[] = [];
  for (const s of steps) {
    let approver: string | null = null;
    if (s.approverType === "MEMBER") approver = s.approverMemberId ?? null;
    else if (s.approverType === "MANAGER") approver = directManagerId;
    if (!approver) continue;
    if (validMemberIds && !validMemberIds.has(approver)) continue;
    if (approver === requesterMemberId) continue;
    if (out.length > 0 && out[out.length - 1] === approver) continue;
    out.push(approver);
  }
  return out;
}

const DAY_MS = 24 * 3600 * 1000;

/**
 * [start, end]（含）之間的工作天數（週一~週五）。start/end 應為 UTC 午夜（對應 @db.Date）。
 * end 早於 start 回 0。供請假天數的顯示 / 統計（與出席月曆只記平日一致）。
 */
export function countWorkdays(start: Date, end: Date): number {
  if (end.getTime() < start.getTime()) return 0;
  let n = 0;
  for (let t = start.getTime(); t <= end.getTime(); t += DAY_MS) {
    const wd = new Date(t).getUTCDay();
    if (wd !== 0 && wd !== 6) n += 1;
  }
  return n;
}
