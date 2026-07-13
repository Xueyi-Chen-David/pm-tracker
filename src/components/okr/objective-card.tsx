"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CalendarClock,
  ChevronDown,
  ChevronRight,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { createKeyResult, deleteObjective } from "@/server/actions/okr";
import { resolveKr, rollupObjective } from "@/lib/okr";
import { fmtDateShort } from "@/lib/date";
import { HealthDot } from "@/components/badges";
import { MemberName } from "@/components/member-name";
import { Button } from "@/components/ui/button";
import { ObjectiveDialog } from "@/components/okr/objective-dialog";
import {
  KeyResultRow,
  type KrView,
  type OwnerLite,
  type ProjectLite,
} from "@/components/okr/key-result-row";

export type ObjectiveView = {
  id: string;
  title: string;
  description: string | null;
  cycle: string;
  targetDate: string | null;
  owner: OwnerLite | null;
  keyResults: KrView[];
};

export function ObjectiveCard({
  objective,
  index,
  members,
  projects,
  cycles,
  level,
}: {
  objective: ObjectiveView;
  index: number;
  members: OwnerLite[];
  projects: ProjectLite[];
  cycles: string[];
  level: "ANNUAL" | "QUARTERLY";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [adding, setAdding] = useState(false);
  const [pending, start] = useTransition();

  const rollup = rollupObjective(
    objective.keyResults.map((k) => ({ kind: k.kind, resolved: resolveKr(k) })),
  );

  function addKr(title: string) {
    const t = title.trim();
    if (!t) return;
    start(async () => {
      try {
        await createKeyResult({ objectiveId: objective.id, title: t });
        setAdding(false);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "新增失敗");
      }
    });
  }

  function removeObjective() {
    if (!confirm(`刪除目標「${objective.title}」及其所有 KR？`)) return;
    start(async () => {
      try {
        await deleteObjective(objective.id);
        toast.success("已刪除目標");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "刪除失敗");
      }
    });
  }

  return (
    <section className="bg-card overflow-hidden rounded-xl border shadow-sm">
      {/* 卡頭 */}
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-primary bg-primary/10 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold"
          title={open ? "收合" : "展開"}
        >
          {index + 1}
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold">{objective.title}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-2">
            {objective.targetDate && (
              <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2 py-0.5 text-[11px] font-medium text-orange-700">
                <CalendarClock className="h-3 w-3" />
                {fmtDateShort(objective.targetDate)}
              </span>
            )}
            {objective.owner && (
              <span className="text-muted-foreground inline-flex items-center gap-1 text-[11px]">
                <MemberName u={objective.owner} className="min-w-0" />
              </span>
            )}
          </div>
        </div>

        {/* 彙總 */}
        <div className="flex items-center gap-2.5">
          <HealthDot health={rollup.health} />
          <div className="bg-muted hidden h-2 w-32 overflow-hidden rounded-full sm:block">
            <div
              className="h-full rounded-full bg-violet-600"
              style={{ width: `${rollup.progress}%` }}
            />
          </div>
          <span className="w-9 text-right text-sm font-bold tabular-nums">
            {rollup.progress}%
          </span>
          <span className="text-muted-foreground w-14 text-xs">
            {rollup.doneCount}/{rollup.total} 完成
          </span>
          <ObjectiveDialog
            members={members}
            cycles={cycles}
            defaultCycle={objective.cycle}
            level={level}
            objective={{
              id: objective.id,
              title: objective.title,
              description: objective.description,
              cycle: objective.cycle,
              targetDate: objective.targetDate,
              ownerId: objective.owner?.id ?? null,
            }}
            trigger={
              <button
                type="button"
                className="text-muted-foreground hover:bg-muted rounded-md p-1.5"
                title="編輯目標"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            }
          />
          <button
            type="button"
            onClick={removeObjective}
            disabled={pending}
            className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive rounded-md p-1.5"
            title="刪除目標"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="text-muted-foreground"
          >
            {open ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      {/* KR 表 */}
      {open && (
        <div className="border-t">
          {objective.keyResults.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px]">
                <thead>
                <tr className="bg-muted/40 text-muted-foreground text-[11px]">
                  <th className="py-1.5 pr-2 pl-3 text-left font-medium">Key Result</th>
                  <th className="px-2 py-1.5 text-left font-medium">負責人</th>
                  <th className="px-2 py-1.5 text-left font-medium">狀態</th>
                  <th className="px-2 py-1.5 text-left font-medium">進度</th>
                  <th className="px-2 py-1.5 text-center font-medium">健康</th>
                  <th className="w-48 px-2 py-1.5 text-left font-medium">這週備註</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {objective.keyResults.map((kr) => (
                  <KeyResultRow
                    key={kr.id}
                    kr={kr}
                    members={members}
                    projects={projects}
                  />
                ))}
              </tbody>
              </table>
            </div>
          )}

          {/* 新增 KR */}
          <div className="px-3 py-2">
            {adding ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  addKr(String(fd.get("title") ?? ""));
                }}
                className="flex items-center gap-2"
              >
                <input
                  name="title"
                  autoFocus
                  placeholder="KR 名稱…"
                  className="border-input h-8 flex-1 rounded-md border bg-transparent px-2 text-sm outline-none"
                />
                <Button type="submit" size="sm" disabled={pending}>
                  新增
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setAdding(false)}
                >
                  取消
                </Button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm"
              >
                <Plus className="h-4 w-4" /> 新增 Key Result
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
