"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import type { CrmStage, CrmDealStatus } from "@prisma/client";
import { CRM_STAGES, CRM_STAGE_META, fmtMoneyShort } from "@/lib/crm";
import { moveDealStage } from "@/server/actions/crm";
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
  const router = useRouter();
  const [pending, start] = useTransition();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<CrmStage | null>(null);

  const byStage = new Map<CrmStage, DealView[]>();
  for (const s of CRM_STAGES) byStage.set(s, []);
  for (const d of deals) byStage.get(d.stage)?.push(d);

  function endDrag() {
    setDragId(null);
    setOverStage(null);
  }

  function drop(stage: CrmStage) {
    const id = dragId;
    endDrag();
    if (!id) return;
    const deal = deals.find((d) => d.id === id);
    if (!deal || deal.stage === stage) return; // 沒換階段就不動
    start(async () => {
      try {
        await moveDealStage(id, stage);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "移動失敗");
      }
    });
  }

  return (
    <div className={cn("flex gap-3 overflow-x-auto pb-2", pending && "opacity-60")}>
      {CRM_STAGES.map((stage) => {
        const list = byStage.get(stage) ?? [];
        const sum = list.reduce((s, d) => s + d.value, 0);
        const meta = CRM_STAGE_META[stage];
        const isOver = overStage === stage;
        return (
          <div
            key={stage}
            onDragOver={(e) => {
              e.preventDefault(); // 允許放下
              e.dataTransfer.dropEffect = "move";
              if (!isOver) setOverStage(stage);
            }}
            onDrop={(e) => {
              e.preventDefault();
              drop(stage);
            }}
            className={cn(
              "bg-muted/30 flex w-72 shrink-0 flex-col rounded-xl border transition-shadow",
              isOver && dragId && "ring-primary ring-2",
            )}
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
                <div
                  key={d.id}
                  draggable
                  onDragStart={(e) => {
                    setDragId(d.id);
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", d.id);
                  }}
                  onDragEnd={endDrag}
                  className={cn(
                    "cursor-grab active:cursor-grabbing",
                    dragId === d.id && "opacity-50",
                  )}
                >
                  <DealCard deal={d} members={members} contacts={contacts} />
                </div>
              ))}
              {isOver && dragId && (
                <div className="border-primary/50 text-muted-foreground rounded-lg border border-dashed py-2 text-center text-xs">
                  放到「{meta.label}」
                </div>
              )}
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
