"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Pencil } from "lucide-react";
import { fmtMoneyShort, stageColor } from "@/lib/crm";
import { moveDealStage } from "@/server/actions/crm";
import { cn } from "@/lib/utils";
import { DealDialog } from "@/components/crm/deal-dialog";
import { DealCard } from "@/components/crm/deal-card";
import { StageDialog } from "@/components/crm/stage-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import type { OwnerLite } from "@/components/okr/key-result-row";
import type { ContactLite, StageView, DealView } from "@/components/crm/types";

// 相容既有 import：型別實際定義在 ./types（見該檔說明的循環依賴問題）。
export type { ContactLite, StageView, DealView } from "@/components/crm/types";

export function PipelineBoard({
  deals,
  members,
  contacts,
  stages,
}: {
  deals: DealView[];
  members: OwnerLite[];
  contacts: ContactLite[];
  stages: StageView[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  const [move, setMove] = useState<{ dealId: string; to: StageView } | null>(null);

  const byStage = new Map<string, DealView[]>();
  for (const s of stages) byStage.set(s.key, []);
  for (const d of deals) byStage.get(d.stage)?.push(d);

  function endDrag() {
    setDragId(null);
    setOverKey(null);
  }

  /** 拖放 / 下拉觸發：開啟原因視窗（沒換階段就忽略）。 */
  function requestMove(dealId: string, toKey: string) {
    const to = stages.find((s) => s.key === toKey);
    const deal = deals.find((d) => d.id === dealId);
    if (!to || !deal || deal.stage === toKey) return;
    setMove({ dealId, to });
  }

  function confirmMove(reason: string) {
    const mv = move;
    setMove(null);
    if (!mv) return;
    start(async () => {
      try {
        const res = await moveDealStage(mv.dealId, mv.to.key, reason);
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "移動失敗");
      }
    });
  }

  return (
    <>
      <div
        className={cn(
          "flex h-full gap-3 overflow-x-auto pb-2",
          pending && "opacity-60",
        )}
      >
        {stages.map((stage) => {
          const list = byStage.get(stage.key) ?? [];
          const sum = list.reduce((s, d) => s + d.value, 0);
          const col = stageColor(stage.color);
          const isOver = overKey === stage.key;
          return (
            <div
              key={stage.id}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (!isOver) setOverKey(stage.key);
              }}
              onDrop={(e) => {
                e.preventDefault();
                const id = dragId;
                endDrag();
                if (id) requestMove(id, stage.key);
              }}
              className={cn(
                "bg-muted/30 flex h-full w-72 shrink-0 flex-col rounded-xl border transition-shadow",
                isOver && dragId && "ring-primary ring-2",
              )}
            >
              <div
                className={cn(
                  "bg-card flex items-center gap-2 rounded-t-xl border-t-4 px-3 py-2",
                  col.head,
                )}
              >
                <span className={cn("h-2 w-2 rounded-full", col.dot)} />
                <span className="text-sm font-semibold">{stage.label}</span>
                <span className="text-muted-foreground text-xs">
                  {list.length}
                </span>
                <span className="text-muted-foreground ml-auto text-xs tabular-nums">
                  {fmtMoneyShort(sum)}
                </span>
                <StageDialog
                  stage={stage}
                  trigger={
                    <button
                      type="button"
                      title="編輯階段"
                      className="text-muted-foreground hover:bg-muted -mr-1 rounded p-1"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                  }
                />
              </div>

              {stage.note && (
                <div className="text-muted-foreground border-b px-3 py-1 text-[11px] break-words whitespace-pre-wrap">
                  {stage.note}
                </div>
              )}

              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
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
                    <DealCard
                      deal={d}
                      members={members}
                      contacts={contacts}
                      stages={stages}
                    />
                  </div>
                ))}
                {isOver && dragId && (
                  <div className="border-primary/50 text-muted-foreground rounded-lg border border-dashed py-2 text-center text-xs">
                    放到「{stage.label}」
                  </div>
                )}
                <DealDialog
                  members={members}
                  contacts={contacts}
                  stages={stages}
                  defaultStage={stage.key}
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

        {/* 新增階段 */}
        <div className="w-56 shrink-0">
          <StageDialog
            trigger={
              <button
                type="button"
                className="text-muted-foreground hover:bg-muted hover:text-foreground flex w-full items-center justify-center gap-1 rounded-xl border border-dashed py-3 text-sm"
              >
                <Plus className="h-4 w-4" /> 新增階段
              </button>
            }
          />
        </div>
      </div>

      <MoveReasonDialog
        key={move ? `${move.dealId}:${move.to.key}` : "none"}
        move={move}
        pending={pending}
        onCancel={() => setMove(null)}
        onConfirm={confirmMove}
      />
    </>
  );
}

function MoveReasonDialog({
  move,
  pending,
  onCancel,
  onConfirm,
}: {
  move: { dealId: string; to: StageView } | null;
  pending: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");

  return (
    <Dialog open={!!move} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>移動到「{move?.to.label}」</DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="mv-reason">原因（選填）</Label>
          <Textarea
            id="mv-reason"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="為什麼移到這個階段？會記入客戶的階段時間線。"
          />
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            disabled={pending}
          >
            取消
          </Button>
          <Button type="button" onClick={() => onConfirm(reason)} disabled={pending}>
            確定移動
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
