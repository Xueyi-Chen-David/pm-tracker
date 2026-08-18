"use client";

import { CalendarClock, Check } from "lucide-react";
import { CRM_ACTIVITY_ICON, CRM_ACTIVITY_LABEL } from "@/lib/crm";
import { fmtDate, fmtDateTime } from "@/lib/date";
import { displayInitial, primaryName } from "@/lib/display";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DealDialog } from "@/components/crm/deal-dialog";
import type { OwnerLite } from "@/components/okr/key-result-row";
import type {
  ActivityLogView,
  ContactLite,
  DealView,
  StageView,
} from "@/components/crm/types";

/**
 * 「跟進紀錄」：全部商機底下所有活動（備註／電話／Email／會議／待辦）的完整時間軸，
 * 不像 FollowUpsList 只挑未完成的待辦——這裡是誰、什麼時候、做了什麼，一次看完，
 * 不用逐張商機打開才看得到。依時間新到舊排序（見 getCrmActivityLog）。
 */
export function ActivityLogList({
  logs,
  deals,
  members,
  contacts,
  stages,
}: {
  logs: ActivityLogView[];
  deals: DealView[];
  members: OwnerLite[];
  contacts: ContactLite[];
  stages: StageView[];
}) {
  const dealById = new Map(deals.map((d) => [d.id, d]));

  if (logs.length === 0) {
    return (
      <div className="text-muted-foreground rounded-xl border border-dashed py-16 text-center">
        還沒有任何跟進紀錄。在商機裡新增活動（備註／電話／Email／會議／待辦），會出現在這裡。
      </div>
    );
  }

  return (
    <div className="bg-card divide-y overflow-hidden rounded-xl border">
      {logs.map((log) => {
        const deal = dealById.get(log.deal.id);
        const dealLabel =
          log.deal.contact?.company || log.deal.contact?.name
            ? `${log.deal.title} · ${log.deal.contact!.company || log.deal.contact!.name}`
            : log.deal.title;
        return (
          <div key={log.id} className="flex items-start gap-2.5 px-3 py-2.5">
            <Avatar className="mt-0.5 h-6 w-6 shrink-0">
              {log.author?.image && <AvatarImage src={log.author.image} alt="" />}
              <AvatarFallback className="text-[10px]">
                {log.author ? displayInitial(log.author) : "?"}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="text-muted-foreground flex flex-wrap items-center gap-1.5 text-xs">
                <span aria-hidden>{CRM_ACTIVITY_ICON[log.type] ?? "📝"}</span>
                <span className="text-foreground font-medium">
                  {log.author ? primaryName(log.author) : "（未知）"}
                </span>
                <span>{CRM_ACTIVITY_LABEL[log.type] ?? log.type}</span>
                {log.type === "task" && (
                  <span
                    className={cn(
                      "inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px]",
                      log.done
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-amber-100 text-amber-700",
                    )}
                  >
                    {log.done && <Check className="h-2.5 w-2.5" />}
                    {log.done ? "已完成" : "未完成"}
                  </span>
                )}
                <span className="ml-auto shrink-0">{fmtDateTime(log.createdAt)}</span>
              </div>
              <div className="mt-1 text-sm break-words whitespace-pre-wrap">
                {log.body}
              </div>
              <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-2 text-xs">
                {deal ? (
                  <DealDialog
                    deal={deal}
                    members={members}
                    contacts={contacts}
                    stages={stages}
                    trigger={
                      <button
                        type="button"
                        className="hover:text-foreground hover:underline"
                      >
                        {dealLabel}
                      </button>
                    }
                  />
                ) : (
                  <span>{dealLabel}</span>
                )}
                {log.dueDate && (
                  <span className="inline-flex items-center gap-0.5">
                    <CalendarClock className="h-3 w-3" />
                    到期 {fmtDate(log.dueDate)}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
