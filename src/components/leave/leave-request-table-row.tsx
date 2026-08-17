import type { LeaveRequestRow } from "@/server/queries";
import { leaveStatusMeta } from "@/lib/leave-approval";
import { fmtDate } from "@/lib/date";
import { cn } from "@/lib/utils";
import { AttachmentLink } from "@/components/attachment-field";
import { MemberAvatar } from "@/components/leave/member-avatar";
import { MemberName } from "@/components/member-name";
import { ApprovalFlowInline } from "@/components/leave/approval-flow-inline";

/** 一列請假申請：狀態 / 申請人 / 期間‧天數 / 假別 / 事由 / 簽核流程 / 操作。見 ApprovalTable。 */
export function LeaveRequestTableRow({
  req,
  showRequester,
  actions,
}: {
  req: LeaveRequestRow;
  showRequester?: boolean;
  actions?: React.ReactNode;
}) {
  const status = leaveStatusMeta(req.status);
  const isHourly = !!(req.startTime && req.endTime);
  const sameDay = +new Date(req.startDate) === +new Date(req.endDate);
  const range = isHourly
    ? `${fmtDate(req.startDate)} ${req.startTime}–${req.endTime}`
    : fmtDate(req.startDate) + (sameDay ? "" : ` – ${fmtDate(req.endDate)}`);
  const amountLabel = isHourly
    ? req.hours
      ? `${req.hours} 小時`
      : null
    : req.days > 0
      ? `${req.days} 天`
      : null;

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
            <MemberAvatar u={req.member.user} />
            <div className="min-w-0">
              <MemberName u={req.member.user} className="text-sm font-medium" />
              <div className="text-muted-foreground text-xs">
                申請日期：{fmtDate(req.createdAt)}
              </div>
            </div>
          </div>
        </td>
      )}
      <td className="px-4 py-3 whitespace-nowrap">
        <div>{range}</div>
        {amountLabel && (
          <div className="text-muted-foreground text-xs">{amountLabel}</div>
        )}
      </td>
      <td className="px-4 py-3">
        {req.leaveType ? (
          <span
            className="inline-block rounded-full border px-2 py-0.5 text-xs font-medium"
            style={{
              borderColor: req.leaveType.color ?? "#cbd5e1",
              color: req.leaveType.color ?? "#475569",
            }}
          >
            {req.leaveType.name}
          </span>
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        )}
      </td>
      <td className="max-w-56 px-4 py-3">
        <p className="line-clamp-2 whitespace-pre-wrap">{req.reason || "—"}</p>
        {req.attachment && (
          <AttachmentLink
            attachment={req.attachment}
            name={req.attachmentName}
            className="mt-1"
          />
        )}
      </td>
      <td className="px-4 py-3">
        <ApprovalFlowInline approvals={req.approvals} finalStatus={req.status} />
      </td>
      <td className="px-4 py-3 text-right">{actions}</td>
    </tr>
  );
}
