import type { AllMemberEventRow } from "@/server/queries";
import { leaveStatusMeta } from "@/lib/leave-approval";
import { memberEventBadge } from "@/lib/constants";
import { fmtDate } from "@/lib/date";
import { cn } from "@/lib/utils";
import { AttachmentLink } from "@/components/attachment-field";
import { MemberAvatar } from "@/components/leave/member-avatar";
import { MemberName } from "@/components/member-name";
import { ApprovalFlowInline } from "@/components/leave/approval-flow-inline";

/**
 * 一列出差 / 事件登記：狀態 / 登記人 / 期間 / 類型 / 備註 / 簽核流程 / 操作。
 * 欄位對齊 LeaveRequestTableRow，兩者在同一張 ApprovalTable 交錯排列時視覺一致。
 */
export function MemberEventTableRow({
  ev,
  showRequester,
  actions,
}: {
  ev: AllMemberEventRow;
  showRequester?: boolean;
  actions?: React.ReactNode;
}) {
  const status = leaveStatusMeta(ev.status);
  const sameDay = !ev.endDate || +new Date(ev.startDate) === +new Date(ev.endDate);
  const range = sameDay
    ? fmtDate(ev.startDate)
    : `${fmtDate(ev.startDate)} – ${fmtDate(ev.endDate)}`;

  return (
    <tr className="hover:bg-muted/30 align-top">
      <td className="px-4 py-3">
        <span
          className={cn(
            "inline-block rounded-full border px-2 py-0.5 text-xs font-medium",
            status.badge,
          )}
        >
          {status.label}
        </span>
      </td>
      {showRequester && (
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <MemberAvatar u={ev.user} />
            <div className="min-w-0">
              <MemberName u={ev.user} className="text-sm font-medium" />
              <div className="text-muted-foreground text-xs">
                登記日期：{fmtDate(ev.createdAt)}
              </div>
            </div>
          </div>
        </td>
      )}
      <td className="px-4 py-3 whitespace-nowrap">{range}</td>
      <td className="px-4 py-3">
        <span
          className={cn(
            "inline-block rounded-full border px-2 py-0.5 text-xs font-medium",
            memberEventBadge(ev.type),
          )}
        >
          {ev.type}
        </span>
      </td>
      <td className="max-w-56 px-4 py-3">
        <p className="line-clamp-2 whitespace-pre-wrap">{ev.note || "—"}</p>
        {ev.attachment && (
          <AttachmentLink
            attachment={ev.attachment}
            name={ev.attachmentName}
            className="mt-1"
          />
        )}
      </td>
      <td className="px-4 py-3">
        <ApprovalFlowInline approvals={ev.approvals} finalStatus={ev.status} />
      </td>
      <td className="px-4 py-3 text-right">{actions}</td>
    </tr>
  );
}
