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
} from "@/components/crm/types";

const todayStr = () => new Date().toISOString().slice(0, 10);

export function DealCard({
  deal,
  members,
  contacts,
  stages,
}: {
  deal: DealView;
  members: OwnerLite[];
  contacts: ContactLite[];
  stages: StageView[];
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
    </div>
  );
}
