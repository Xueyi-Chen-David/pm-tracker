"use client";

import {
  cloneElement,
  isValidElement,
  useEffect,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2, Check } from "lucide-react";
import {
  createDeal,
  updateDeal,
  deleteDeal,
  setDealStatus,
  addActivity,
  toggleActivityDone,
  deleteActivity,
  listDealActivities,
  listDealStageChanges,
} from "@/server/actions/crm";
import { CRM_ACTIVITY_TYPES, CRM_ACTIVITY_ICON, stageColor } from "@/lib/crm";
import { fmtDate } from "@/lib/date";
import { primaryName, type NameSource } from "@/lib/display";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import type {
  DealView,
  ContactLite,
  StageView,
} from "@/components/crm/pipeline-board";

type StageChange = {
  id: string;
  fromStage: string | null;
  toStage: string;
  reason: string | null;
  changedAt: Date | string;
  changedBy: NameSource | null;
};

const inputCls =
  "border-input h-9 w-full rounded-md border bg-transparent px-2 text-sm outline-none focus:border-ring";

type Activity = {
  id: string;
  type: string;
  body: string;
  dueDate: Date | string | null;
  done: boolean;
  createdAt: Date | string;
};

export function DealDialog({
  trigger,
  members,
  contacts,
  stages,
  deal,
  defaultStage,
}: {
  trigger: React.ReactElement;
  members: OwnerLite[];
  contacts: ContactLite[];
  stages: StageView[];
  deal?: DealView;
  defaultStage?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [changes, setChanges] = useState<StageChange[]>([]);
  const editing = !!deal;
  const firstStage = defaultStage ?? stages[0]?.key ?? "LEAD";
  const stageMap = new Map(stages.map((s) => [s.key, s]));

  // 開啟編輯時載入活動時間軸 + 階段歷程。
  useEffect(() => {
    if (open && deal) {
      listDealActivities(deal.id)
        .then(setActivities)
        .catch(() => setActivities([]));
      listDealStageChanges(deal.id)
        .then(setChanges)
        .catch(() => setChanges([]));
    }
  }, [open, deal]);

  function refreshActivities() {
    if (deal) listDealActivities(deal.id).then(setActivities).catch(() => {});
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const input = {
      title: String(fd.get("title") ?? "").trim(),
      value: Number(fd.get("value") ?? 0) || 0,
      stage: String(fd.get("stage") ?? firstStage),
      contactId: String(fd.get("contactId") ?? "") || null,
      ownerId: String(fd.get("ownerId") ?? "") || null,
      expectedCloseDate: String(fd.get("expectedCloseDate") ?? "") || null,
      note: String(fd.get("note") ?? "").trim() || null,
    };
    if (!input.title) return setError("請輸入商機名稱");
    start(async () => {
      try {
        if (editing) await updateDeal(deal.id, input);
        else await createDeal(input);
        setOpen(false);
        toast.success(editing ? "已更新商機" : "已新增商機");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "儲存失敗");
      }
    });
  }

  function run(fn: () => Promise<void>, after?: () => void) {
    start(async () => {
      try {
        await fn();
        after?.();
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "操作失敗");
      }
    });
  }

  const openDialog = () => {
    setError(null);
    setOpen(true);
  };

  return (
    <>
      {isValidElement(trigger)
        ? cloneElement(trigger as React.ReactElement<{ onClick?: () => void }>, {
            onClick: openDialog,
          })
        : trigger}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "編輯商機" : "新增商機"}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="d-title">商機名稱</Label>
              <Input
                id="d-title"
                name="title"
                required
                defaultValue={deal?.title ?? ""}
                placeholder="例：井上酒造 導入 AI 客服"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="d-value">金額（¥）</Label>
                <Input
                  id="d-value"
                  name="value"
                  type="number"
                  min={0}
                  step={1000}
                  defaultValue={deal?.value ?? 0}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="d-stage">階段</Label>
                <select
                  id="d-stage"
                  name="stage"
                  defaultValue={deal?.stage ?? firstStage}
                  className={inputCls}
                >
                  {stages.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="d-contact">聯絡人 / 客戶</Label>
                <select
                  id="d-contact"
                  name="contactId"
                  defaultValue={deal?.contact?.id ?? ""}
                  className={inputCls}
                >
                  <option value="">—</option>
                  {contacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.company ? `${c.name}（${c.company}）` : c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="d-owner">負責人</Label>
                <select
                  id="d-owner"
                  name="ownerId"
                  defaultValue={deal?.owner?.id ?? ""}
                  className={inputCls}
                >
                  <option value="">—</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name || m.email}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="d-close">預計成交日</Label>
              <Input
                id="d-close"
                name="expectedCloseDate"
                type="date"
                defaultValue={deal?.expectedCloseDate ?? ""}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="d-note">備註</Label>
              <Textarea
                id="d-note"
                name="note"
                rows={2}
                defaultValue={deal?.note ?? ""}
              />
            </div>

            {error && (
              <p className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm">
                {error}
              </p>
            )}

            <DialogFooter className="gap-2">
              {editing && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    if (confirm(`刪除商機「${deal.title}」？`))
                      run(() => deleteDeal(deal.id), () => setOpen(false));
                  }}
                  className="text-destructive hover:bg-destructive/10 mr-auto inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-sm"
                >
                  <Trash2 className="h-4 w-4" /> 刪除
                </button>
              )}
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
                disabled={pending}
              >
                取消
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "儲存中…" : editing ? "儲存" : "新增"}
              </Button>
            </DialogFooter>
          </form>

          {/* 成交 / 流失 + 活動時間軸（僅編輯） */}
          {editing && (
            <div className="space-y-3 border-t pt-3">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-xs">結果：</span>
                <StatusButton
                  active={deal.status === "WON"}
                  cls="border-emerald-300 text-emerald-700 data-[on=true]:bg-emerald-600"
                  onClick={() => run(() => setDealStatus(deal.id, "WON"))}
                  disabled={pending}
                >
                  成交
                </StatusButton>
                <StatusButton
                  active={deal.status === "LOST"}
                  cls="border-rose-300 text-rose-700 data-[on=true]:bg-rose-600"
                  onClick={() => run(() => setDealStatus(deal.id, "LOST"))}
                  disabled={pending}
                >
                  流失
                </StatusButton>
                {deal.status !== "OPEN" && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => setDealStatus(deal.id, "OPEN"))}
                    className="text-muted-foreground hover:bg-muted rounded-md border px-2 py-1 text-xs"
                  >
                    重新開啟
                  </button>
                )}
              </div>

              <StageTimeline changes={changes} stageMap={stageMap} />

              <ActivitySection
                dealId={deal.id}
                activities={activities}
                pending={pending}
                onOptimistic={(a) => setActivities((prev) => [a, ...prev])}
                onChanged={refreshActivities}
                run={run}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/** 階段歷程時間線：一目了然看客戶從哪個階段走到哪個階段、何時、原因。 */
function StageTimeline({
  changes,
  stageMap,
}: {
  changes: StageChange[];
  stageMap: Map<string, StageView>;
}) {
  if (changes.length === 0) return null;
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">階段歷程</div>
      <ol className="border-muted relative ml-1 space-y-3 border-l pl-4">
        {changes.map((c) => {
          const st = stageMap.get(c.toStage);
          const col = stageColor(st?.color);
          const from = c.fromStage ? stageMap.get(c.fromStage) : null;
          return (
            <li key={c.id} className="relative">
              <span
                className={cn(
                  "ring-background absolute top-1 -left-[1.35rem] h-2.5 w-2.5 rounded-full ring-2",
                  col.dot,
                )}
              />
              <div className="flex flex-wrap items-center gap-1.5">
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-xs font-medium",
                    col.chip,
                  )}
                >
                  {st?.label ?? c.toStage}
                </span>
                {from && (
                  <span className="text-muted-foreground text-[11px]">
                    ← {from.label}
                  </span>
                )}
                <span className="text-muted-foreground ml-auto text-[11px]">
                  {fmtDate(new Date(c.changedAt))}
                  {c.changedBy ? ` · ${primaryName(c.changedBy)}` : ""}
                </span>
              </div>
              {c.reason && (
                <p className="text-muted-foreground mt-0.5 text-xs break-words whitespace-pre-wrap">
                  {c.reason}
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function StatusButton({
  active,
  cls,
  onClick,
  disabled,
  children,
}: {
  active: boolean;
  cls: string;
  onClick: () => void;
  disabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      data-on={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded-md border px-2.5 py-1 text-xs font-medium data-[on=true]:text-white",
        cls,
      )}
    >
      {children}
    </button>
  );
}

function ActivitySection({
  dealId,
  activities,
  pending,
  onOptimistic,
  onChanged,
  run,
}: {
  dealId: string;
  activities: Activity[];
  pending: boolean;
  onOptimistic: (a: Activity) => void;
  onChanged: () => void;
  run: (fn: () => Promise<void>, after?: () => void) => void;
}) {
  const [type, setType] = useState("note");

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const body = String(fd.get("body") ?? "").trim();
    if (!body) return;
    const dueDate = String(fd.get("dueDate") ?? "") || null;
    // 樂觀更新：先本地插入，送出後 onChanged 重新載入取代（本地 state 不會閃動）。
    onOptimistic({
      id: `tmp-${Date.now()}`,
      type,
      body,
      dueDate,
      done: false,
      createdAt: new Date(),
    });
    run(() => addActivity({ dealId, type: type as never, body, dueDate }), () => {
      form.reset();
      setType("note");
      onChanged();
    });
  }

  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">活動 / 跟進</div>
      <form onSubmit={submit} className="space-y-2">
        <div className="flex gap-2">
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="border-input h-9 w-24 shrink-0 rounded-md border bg-transparent px-2 text-sm"
          >
            {CRM_ACTIVITY_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.icon} {t.label}
              </option>
            ))}
          </select>
          <input
            name="body"
            placeholder="紀錄一則跟進 / 備註…"
            className="border-input h-9 flex-1 rounded-md border bg-transparent px-2 text-sm outline-none focus:border-ring"
          />
        </div>
        <div className="flex items-center gap-2">
          {type === "task" && (
            <input
              name="dueDate"
              type="date"
              title="待辦到期日"
              className="border-input h-8 rounded-md border bg-transparent px-2 text-xs"
            />
          )}
          <Button type="submit" size="sm" disabled={pending} className="ml-auto">
            新增
          </Button>
        </div>
      </form>

      <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
        {activities.length === 0 ? (
          <p className="text-muted-foreground text-xs">尚無活動紀錄。</p>
        ) : (
          activities.map((a) => (
            <div
              key={a.id}
              className="hover:bg-muted/40 group flex items-start gap-2 rounded-md px-1.5 py-1"
            >
              <span className="mt-0.5 text-sm">
                {CRM_ACTIVITY_ICON[a.type] ?? "📝"}
              </span>
              <div className="min-w-0 flex-1">
                <div
                  className={cn(
                    "text-sm break-words whitespace-pre-wrap",
                    a.type === "task" && a.done && "text-muted-foreground line-through",
                  )}
                >
                  {a.body}
                </div>
                <div className="text-muted-foreground text-[11px]">
                  {fmtDate(new Date(a.createdAt))}
                  {a.dueDate && ` · 到期 ${fmtDate(new Date(a.dueDate))}`}
                </div>
              </div>
              {a.type === "task" && (
                <button
                  type="button"
                  disabled={pending}
                  title={a.done ? "標記未完成" : "標記完成"}
                  onClick={() =>
                    run(() => toggleActivityDone(a.id, !a.done), onChanged)
                  }
                  className={cn(
                    "rounded p-1",
                    a.done
                      ? "text-emerald-600"
                      : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => deleteActivity(a.id), onChanged)}
                className="text-muted-foreground hover:text-destructive rounded p-1 opacity-0 group-hover:opacity-100"
                title="刪除"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
