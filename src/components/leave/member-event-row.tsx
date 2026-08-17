import { CalendarRange } from "lucide-react";
import { memberEventBadge } from "@/lib/constants";
import { fmtDate } from "@/lib/date";
import { cn } from "@/lib/utils";
import { AttachmentLink } from "@/components/attachment-field";

export type MemberEventRowData = {
  id: string;
  type: string;
  startDate: Date | string;
  endDate: Date | string | null;
  note: string | null;
  attachment?: string | null;
  attachmentName?: string | null;
};

/**
 * 一列事件（出差 / 在家工作 / 外出…）的唯讀展示：型別 badge +（可選）登記人 + 日期 +
 * 備註 + 附件。與請假申請合併成同一條時間軸時（見 lib/leave-timeline.ts、
 * request-card.tsx 的 compact 模式）用同樣的列高與留白，兩種資料視覺一致，不會忽寬忽窄。
 */
export function MemberEventRow({
  ev,
  /** 顯示登記人姓名（全體總覽用）；只看自己的清單則不傳。 */
  requesterLabel,
  footer,
}: {
  ev: MemberEventRowData;
  requesterLabel?: string;
  footer?: React.ReactNode;
}) {
  const sameDay = !ev.endDate || +new Date(ev.startDate) === +new Date(ev.endDate);
  return (
    <div className="hover:bg-muted/40 flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-sm">
      <span
        className={cn(
          "shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium",
          memberEventBadge(ev.type),
        )}
      >
        {ev.type}
      </span>
      {requesterLabel && (
        <span className="shrink-0 font-medium">{requesterLabel}</span>
      )}
      <span className="text-muted-foreground inline-flex shrink-0 items-center gap-1">
        <CalendarRange className="h-3.5 w-3.5" />
        {fmtDate(ev.startDate)}
        {!sameDay && ev.endDate ? ` – ${fmtDate(ev.endDate)}` : ""}
      </span>
      {ev.note && (
        <span className="text-muted-foreground min-w-0 flex-1 truncate">
          {ev.note}
        </span>
      )}
      {ev.attachment && (
        <AttachmentLink attachment={ev.attachment} name={ev.attachmentName} />
      )}
      {footer && <span className="ml-auto shrink-0">{footer}</span>}
    </div>
  );
}
