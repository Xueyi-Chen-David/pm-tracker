"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Trash2, CalendarClock } from "lucide-react";
import { toggleActivityDone, deleteActivity } from "@/server/actions/crm";
import { fmtDate, isOverdue } from "@/lib/date";
import { cn } from "@/lib/utils";
import { DealDialog } from "@/components/crm/deal-dialog";
import type { OwnerLite } from "@/components/okr/key-result-row";
import type {
  DealView,
  ContactLite,
  StageView,
  FollowUpView,
} from "@/components/crm/types";

/** 今日跟進總覽：彙整所有商機底下未完成的「待辦」活動，不用逐張商機翻找。 */
export function FollowUpsList({
  followUps,
  deals,
  members,
  contacts,
  stages,
}: {
  followUps: FollowUpView[];
  deals: DealView[];
  members: OwnerLite[];
  contacts: ContactLite[];
  stages: StageView[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const dealById = new Map(deals.map((d) => [d.id, d]));

  function run(fn: () => Promise<{ ok: boolean; error?: string } | void>) {
    start(async () => {
      try {
        const res = await fn();
        if (res && !res.ok) {
          toast.error(res.error ?? "操作失敗");
          return;
        }
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "操作失敗");
      }
    });
  }

  if (followUps.length === 0) {
    return (
      <div className="text-muted-foreground rounded-xl border border-dashed py-16 text-center">
        目前沒有待跟進事項。在商機裡新增「待辦」型活動，會出現在這裡。
      </div>
    );
  }

  return (
    <div className="bg-card divide-y overflow-hidden rounded-xl border">
      {followUps.map((f) => {
        const deal = dealById.get(f.deal.id);
        const overdue = isOverdue(f.dueDate, false);
        const dealLabel =
          deal?.contact?.company || deal?.contact?.name
            ? `${f.deal.title} · ${deal.contact!.company || deal.contact!.name}`
            : f.deal.title;
        return (
          <div
            key={f.id}
            className="hover:bg-muted/40 group flex items-start gap-2 px-3 py-2.5"
          >
            <button
              type="button"
              disabled={pending}
              title="標記完成"
              onClick={() => run(() => toggleActivityDone(f.id, true))}
              className="text-muted-foreground hover:bg-muted mt-0.5 rounded p-1"
            >
              <Check className="h-3.5 w-3.5" />
            </button>
            <div className="min-w-0 flex-1">
              <div className="text-sm break-words whitespace-pre-wrap">
                {f.body}
              </div>
              <div className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-2 text-xs">
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
                {f.dueDate && (
                  <span
                    className={cn(
                      "inline-flex items-center gap-0.5",
                      overdue && "text-rose-600",
                    )}
                  >
                    <CalendarClock className="h-3 w-3" />
                    到期 {fmtDate(f.dueDate)}
                  </span>
                )}
              </div>
            </div>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => deleteActivity(f.id))}
              className="text-muted-foreground hover:text-destructive rounded p-1 opacity-0 group-hover:opacity-100"
              title="刪除"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
