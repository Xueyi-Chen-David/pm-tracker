"use client";

import { CalendarClock, MessageSquare } from "lucide-react";
import { fmtMoney } from "@/lib/crm";
import { fmtDateShort } from "@/lib/date";
import { displayInitial } from "@/lib/display";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DealDialog } from "@/components/crm/deal-dialog";
import type { OwnerLite } from "@/components/okr/key-result-row";
import type {
  DealView,
  ContactLite,
  StageView,
} from "@/components/crm/pipeline-board";

const todayStr = () => new Date().toISOString().slice(0, 10);

export function DealCard({
  deal,
  members,
  contacts,
  stages,
  onMove,
}: {
  deal: DealView;
  members: OwnerLite[];
  contacts: ContactLite[];
  stages: StageView[];
  /** 換階段（會由看板開啟原因視窗後才真正移動）。 */
  onMove: (toKey: string) => void;
}) {
  const overdue = !!deal.expectedCloseDate && deal.expectedCloseDate < todayStr();

  return (
    <div className="bg-card rounded-lg border p-2.5 shadow-sm">
      <DealDialog
        deal={deal}
        members={members}
        contacts={contacts}
        stages={stages}
        trigger={
          <button type="button" className="block w-full text-left">
            <div className="text-sm font-medium break-words">{deal.title}</div>
            {(deal.contact?.company || deal.contact?.name) && (
              <div className="text-muted-foreground mt-0.5 truncate text-xs">
                {deal.contact.company || deal.contact.name}
              </div>
            )}
            <div className="mt-1.5 flex items-center gap-2">
              <span className="text-sm font-semibold tabular-nums">
                {fmtMoney(deal.value)}
              </span>
              {deal.activityCount > 0 && (
                <span className="text-muted-foreground inline-flex items-center gap-0.5 text-[11px]">
                  <MessageSquare className="h-3 w-3" />
                  {deal.activityCount}
                </span>
              )}
              <span className="ml-auto flex items-center gap-1.5">
                {deal.expectedCloseDate && (
                  <span
                    className={cn(
                      "inline-flex items-center gap-0.5 text-[11px]",
                      overdue ? "text-rose-600" : "text-muted-foreground",
                    )}
                  >
                    <CalendarClock className="h-3 w-3" />
                    {fmtDateShort(deal.expectedCloseDate)}
                  </span>
                )}
                {deal.owner && (
                  <Avatar className="h-5 w-5">
                    {deal.owner.image && (
                      <AvatarImage src={deal.owner.image} alt="" />
                    )}
                    <AvatarFallback className="text-[8px]">
                      {displayInitial(deal.owner)}
                    </AvatarFallback>
                  </Avatar>
                )}
              </span>
            </div>
          </button>
        }
      />

      {/* 快速移動階段（也可直接拖曳卡片） */}
      <div className="mt-2 border-t pt-1.5">
        <select
          value={deal.stage}
          onChange={(e) => onMove(e.target.value)}
          className="text-muted-foreground hover:bg-muted h-6 w-full rounded border-none bg-transparent text-[11px] outline-none"
          title="移動到其他階段"
        >
          {stages.map((s) => (
            <option key={s.key} value={s.key}>
              {s.key === deal.stage ? s.label : `移到：${s.label}`}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
