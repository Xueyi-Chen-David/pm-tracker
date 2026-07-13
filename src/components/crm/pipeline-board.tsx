"use client";

import { Plus } from "lucide-react";
import type { CrmStage, CrmDealStatus } from "@prisma/client";
import { CRM_STAGES, CRM_STAGE_META, fmtMoneyShort } from "@/lib/crm";
import { cn } from "@/lib/utils";
import { DealDialog } from "@/components/crm/deal-dialog";
import { DealCard } from "@/components/crm/deal-card";
import type { OwnerLite } from "@/components/okr/key-result-row";

export type ContactLite = { id: string; name: string; company: string | null };

export type DealView = {
  id: string;
  title: string;
  value: number;
  stage: CrmStage;
  status: CrmDealStatus;
  contact: ContactLite | null;
  owner: OwnerLite | null;
  expectedCloseDate: string | null;
  note: string | null;
  activityCount: number;
};

export function PipelineBoard({
  deals,
  members,
  contacts,
}: {
  deals: DealView[];
  members: OwnerLite[];
  contacts: ContactLite[];
}) {
  const byStage = new Map<CrmStage, DealView[]>();
  for (const s of CRM_STAGES) byStage.set(s, []);
  for (const d of deals) byStage.get(d.stage)?.push(d);

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {CRM_STAGES.map((stage) => {
        const list = byStage.get(stage) ?? [];
        const sum = list.reduce((s, d) => s + d.value, 0);
        const meta = CRM_STAGE_META[stage];
        return (
          <div
            key={stage}
            className="bg-muted/30 flex w-72 shrink-0 flex-col rounded-xl border"
          >
            <div
              className={cn(
                "bg-card flex items-center gap-2 rounded-t-xl border-t-4 px-3 py-2",
                meta.head,
              )}
            >
              <span className={cn("h-2 w-2 rounded-full", meta.dot)} />
              <span className="text-sm font-semibold">{meta.label}</span>
              <span className="text-muted-foreground text-xs">{list.length}</span>
              <span className="text-muted-foreground ml-auto text-xs tabular-nums">
                {fmtMoneyShort(sum)}
              </span>
            </div>
            <div className="max-h-[calc(100dvh-19rem)] flex-1 space-y-2 overflow-y-auto p-2">
              {list.map((d) => (
                <DealCard
                  key={d.id}
                  deal={d}
                  members={members}
                  contacts={contacts}
                />
              ))}
              <DealDialog
                members={members}
                contacts={contacts}
                defaultStage={stage}
                trigger={
                  <button
                    type="button"
                    className="text-muted-foreground hover:bg-muted hover:text-foreground flex w-full items-center justify-center gap-1 rounded-lg border border-dashed py-1.5 text-xs"
                  >
                    <Plus className="h-3.5 w-3.5" /> 新增商機
                  </button>
                }
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
