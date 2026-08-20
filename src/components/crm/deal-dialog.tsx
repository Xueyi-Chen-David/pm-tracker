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
import { Trash2, Check, User, Users } from "lucide-react";
import {
  createDeal,
  updateDeal,
  deleteDeal,
  setDealStatus,
  addActivity,
  updateActivity,
  toggleActivityDone,
  deleteActivity,
  listDealActivities,
  listDealStageChanges,
  getDealTeam,
} from "@/server/actions/crm";
import { MultiSelectField } from "@/components/crm/multi-select-field";
import { StageStepper } from "@/components/crm/stage-stepper";
import {
  CRM_ACTIVITY_TYPES,
  CRM_ACTIVITY_ICON,
  CRM_ACTIVITY_LABEL,
  stageColor,
} from "@/lib/crm";
import { fmtDate, fmtDateShort, isOverdue } from "@/lib/date";
import { primaryName, type NameSource } from "@/lib/display";
import { NoteBubble } from "@/components/crm/note-bubble";
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
} from "@/components/crm/types";

type StageChange = {
  id: string;
  fromStage: string | null;
  toStage: string;
  reason: string | null;
  changedAt: Date | string;
  changedBy: NameSource | null;
};

const NOTE_MAX = 4000;
// 備註的框跟「活動 / 跟進」清單的框共用同一個高度上限，兩邊都不會無限長高，視覺也一致。
const ACTIVITY_LIST_MAX_H = "max-h-96";

type Activity = {
  id: string;
  type: string;
  body: string;
  dueDate: Date | string | null;
  done: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
  author: OwnerLite | null;
};

const FORM_ID = "deal-form";

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
  const [closeAction, setCloseAction] = useState<"WON" | "LOST" | null>(null);
  // 聯絡人 / 負責人：多選 + 其中一位為主要（見 MultiSelectField）。控制項狀態，
  // 不透過 FormData 讀——原生 <select> 那套讀法沒辦法表達「多選 + 誰是主要」。
  const [contactIds, setContactIds] = useState<string[]>([]);
  const [primaryContactId, setPrimaryContactId] = useState<string | null>(null);
  const [ownerIds, setOwnerIds] = useState<string[]>([]);
  const [primaryOwnerId, setPrimaryOwnerId] = useState<string | null>(null);
  const editing = !!deal;
  const firstStage = defaultStage ?? stages[0]?.key ?? "LEAD";
  const stageMap = new Map(stages.map((s) => [s.key, s]));
  // 階段：也是控制項狀態（原生 select 疊一顆色點在觸發鈕上，得知道目前選了誰才能上色）。
  const [stageKey, setStageKey] = useState(deal?.stage ?? firstStage);
  // 備註：控制項狀態，右下角字數統計要即時更新。
  const [note, setNote] = useState(deal?.note ?? "");
  // 預計成交日：改控制項狀態（原本用 ref 直接改原生 input 的 DOM value 來清除，
  // 但那不會同步更新 React 對這顆 uncontrolled input 的認知，重render 後有機會被打回
  // defaultValue，導致「清除」按下去看起來清空了、實際存檔時日期又跑回來）。改成跟
  // note 同一套：state 直接驅動 value，「清除」只是 setCloseDate("")，不會有殘留。
  const [closeDate, setCloseDate] = useState(deal?.expectedCloseDate ?? "");

  // 開啟編輯時載入活動時間軸 + 階段歷程 + 完整的聯絡人 / 負責人名單。
  // 新增（無 deal）時的清空改放在 openDialog（事件處理常式，不是 effect）——避免在 effect
  // 內同步 setState 觸發連鎖重render，也讓「取消後重開新增視窗」不會殘留上次選取。
  useEffect(() => {
    if (open && deal) {
      listDealActivities(deal.id)
        .then(setActivities)
        .catch(() => setActivities([]));
      listDealStageChanges(deal.id)
        .then(setChanges)
        .catch(() => setChanges([]));
      getDealTeam(deal.id)
        .then((team) => {
          setContactIds(team.contactIds);
          setPrimaryContactId(team.primaryContactId);
          setOwnerIds(team.ownerIds);
          setPrimaryOwnerId(team.primaryOwnerId);
        })
        .catch(() => {});
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
      stage: stageKey,
      contactIds,
      primaryContactId,
      ownerIds,
      primaryOwnerId,
      expectedCloseDate: closeDate.trim() || null,
      probability: (() => {
        const raw = String(fd.get("probability") ?? "").trim();
        return raw === "" ? null : Number(raw);
      })(),
      note: note.trim() || null,
    };
    if (!input.title) return setError("請輸入商機名稱");
    start(async () => {
      try {
        const res = editing
          ? await updateDeal(deal.id, input)
          : await createDeal(input);
        if (!res.ok) return setError(res.error);
        setOpen(false);
        toast.success(editing ? "已更新商機" : "已新增商機");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "儲存失敗");
      }
    });
  }

  function run(
    fn: () => Promise<{ ok: boolean; error?: string } | void>,
    after?: () => void,
  ) {
    start(async () => {
      try {
        const res = await fn();
        if (res && !res.ok) {
          toast.error(res.error ?? "操作失敗");
          return;
        }
        after?.();
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "操作失敗");
      }
    });
  }

  const openDialog = () => {
    setError(null);
    setStageKey(deal?.stage ?? firstStage);
    setNote(deal?.note ?? "");
    setCloseDate(deal?.expectedCloseDate ?? "");
    // 新增商機：清掉上次（若曾開過又取消）殘留的聯絡人 / 負責人選取。編輯時交給上面
    // 的 effect 從 getDealTeam 重新載入，這裡不用管。
    if (!editing) {
      setContactIds([]);
      setPrimaryContactId(null);
      setOwnerIds([]);
      setPrimaryOwnerId(null);
    }
    setOpen(true);
  };

  function confirmClose(reason: string) {
    const status = closeAction;
    setCloseAction(null);
    if (!status || !deal) return;
    run(() => setDealStatus(deal.id, status, reason));
  }

  // 「更新時間」：最近一次階段異動的時間（每筆商機建立時就會記一筆，正常一定有）。
  const lastChangedAt = changes.length > 0 ? changes[changes.length - 1]!.changedAt : null;

  return (
    <>
      {isValidElement(trigger)
        ? cloneElement(trigger as React.ReactElement<{ onClick?: () => void }>, {
            onClick: openDialog,
          })
        : trigger}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className={cn(editing ? "sm:max-w-4xl" : "sm:max-w-lg")}>
          <DialogHeader>
            <DialogTitle>{editing ? "編輯商機" : "新增商機"}</DialogTitle>
          </DialogHeader>

          <div className={cn("grid gap-4", editing && "lg:grid-cols-[1fr_360px]")}>
            <form id={FORM_ID} onSubmit={handleSubmit} className="min-w-0 space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="d-title">
                  商機名稱 <span className="text-destructive">*</span>
                </Label>
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
                  <div className="relative">
                    <span className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm">
                      ¥
                    </span>
                    <Input
                      id="d-value"
                      name="value"
                      type="number"
                      min={0}
                      step={1000}
                      defaultValue={deal?.value ?? 0}
                      className="pl-6"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="d-stage">
                    階段 <span className="text-destructive">*</span>
                  </Label>
                  {/* 色點是真正的 flex 手足，不是疊在 select padding 上的絕對定位裝飾——
                      後者在視窗變窄、select 本身被壓縮時，padding 沒能保留出足夠空間，
                      色點會跟文字重疊。改成兩者一起放進同一個假裝是輸入框的容器，
                      select 本身無邊框、透明背景，色點自然排在文字前面，不會重疊。 */}
                  <div className="border-input bg-transparent dark:bg-input/30 flex h-9 items-center gap-2 rounded-md border px-2">
                    <span
                      className={cn(
                        "h-2 w-2 shrink-0 rounded-full",
                        stageColor(stageMap.get(stageKey)?.color).dot,
                      )}
                    />
                    <select
                      id="d-stage"
                      name="stage"
                      value={stageKey}
                      onChange={(e) => setStageKey(e.target.value)}
                      className="h-full min-w-0 flex-1 border-0 bg-transparent text-sm outline-none"
                    >
                      {stages.map((s) => (
                        <option key={s.key} value={s.key}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="grid items-start gap-3 sm:grid-cols-2">
                <MultiSelectField
                  label="聯絡人 / 客戶"
                  icon={<User className="text-muted-foreground h-4 w-4 shrink-0" />}
                  options={contacts.map((c) => ({
                    id: c.id,
                    label: c.company ? `${c.name}（${c.company}）` : c.name,
                  }))}
                  selectedIds={contactIds}
                  primaryId={primaryContactId}
                  onChange={(ids, primary) => {
                    setContactIds(ids);
                    setPrimaryContactId(primary);
                  }}
                  placeholder="尚未關聯聯絡人"
                  emptyHint="還沒有任何聯絡人，先到「聯絡人」分頁新增"
                />
                <MultiSelectField
                  label="負責人"
                  icon={<Users className="text-muted-foreground h-4 w-4 shrink-0" />}
                  options={members.map((m) => ({
                    id: m.id,
                    label: m.name || m.email || "—",
                  }))}
                  selectedIds={ownerIds}
                  primaryId={primaryOwnerId}
                  onChange={(ids, primary) => {
                    setOwnerIds(ids);
                    setPrimaryOwnerId(primary);
                  }}
                  placeholder="尚未指派負責人"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <div className="flex items-baseline justify-between">
                    <Label htmlFor="d-close">預計成交日</Label>
                    {closeDate && (
                      <button
                        type="button"
                        onClick={() => setCloseDate("")}
                        className="text-muted-foreground hover:text-foreground text-xs"
                      >
                        清除
                      </button>
                    )}
                  </div>
                  <Input
                    id="d-close"
                    name="expectedCloseDate"
                    type="date"
                    value={closeDate}
                    onChange={(e) => setCloseDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="d-prob">成交機率 %（選填，覆寫階段預設）</Label>
                  <Input
                    id="d-prob"
                    name="probability"
                    type="number"
                    min={0}
                    max={100}
                    placeholder={
                      stageMap.get(stageKey)?.defaultProbability != null
                        ? `階段預設 ${stageMap.get(stageKey)!.defaultProbability}`
                        : "未設定"
                    }
                    defaultValue={deal?.probability ?? ""}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-baseline justify-between">
                  <Label htmlFor="d-note">備註</Label>
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {note.length} / {NOTE_MAX}
                  </span>
                </div>
                <Textarea
                  id="d-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={NOTE_MAX}
                  rows={editing ? 3 : 2}
                  placeholder="輸入備註…"
                  // Textarea 預設 field-sizing-content 會無限跟著內容長高；限跟「活動 / 跟進」
                  // 清單那顆框（ACTIVITY_LIST_MAX_H）同一個上限，超過就內部捲動，視覺一致。
                  className={cn(ACTIVITY_LIST_MAX_H, "overflow-y-auto")}
                />
              </div>

              {error && (
                <p className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm">
                  {error}
                </p>
              )}
            </form>

            {/* 目前階段 / 階段歷程 / 活動跟進（僅編輯——新增商機還沒有這些歷史可看）。 */}
            {editing && (
              <div className="min-w-0 space-y-3">
                <CurrentStageCard
                  stage={stageMap.get(deal.stage)}
                  lastChangedAt={lastChangedAt}
                  status={deal.status}
                  closedReason={deal.closedReason}
                  pending={pending}
                  onWon={() => setCloseAction("WON")}
                  onLost={() => setCloseAction("LOST")}
                  onReopen={() => run(() => setDealStatus(deal.id, "OPEN"))}
                />

                <div className="bg-card space-y-2.5 rounded-lg border p-3">
                  <div className="text-muted-foreground text-xs font-medium">
                    階段歷程
                  </div>
                  <StageStepper stages={stages} currentStage={deal.stage} />
                  <StageTimeline changes={changes} stageMap={stageMap} />
                </div>

                <ActivitySection
                  dealId={deal.id}
                  activities={activities}
                  pending={pending}
                  onChanged={refreshActivities}
                  run={run}
                />
              </div>
            )}
          </div>

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
            <Button type="submit" form={FORM_ID} disabled={pending}>
              {pending ? "儲存中…" : editing ? "儲存" : "新增"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {deal && (
        <ClosedReasonDialog
          key={closeAction ?? "none"}
          status={closeAction}
          defaultReason={deal.closedReason ?? ""}
          pending={pending}
          onCancel={() => setCloseAction(null)}
          onConfirm={confirmClose}
        />
      )}
    </>
  );
}

/** 「目前階段」摘要卡：階段色點 + 名稱 + 最近異動時間，以及成交 / 流失 / 重新開啟。 */
function CurrentStageCard({
  stage,
  lastChangedAt,
  status,
  closedReason,
  pending,
  onWon,
  onLost,
  onReopen,
}: {
  stage: StageView | undefined;
  lastChangedAt: Date | string | null;
  status: "OPEN" | "WON" | "LOST";
  closedReason: string | null;
  pending: boolean;
  onWon: () => void;
  onLost: () => void;
  onReopen: () => void;
}) {
  const col = stageColor(stage?.color);
  return (
    <div className="bg-card space-y-2.5 rounded-lg border p-3">
      <div className="text-muted-foreground text-xs font-medium">目前階段</div>
      <div className="flex items-center gap-1.5">
        <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", col.dot)} />
        <span className="text-sm font-medium">{stage?.label ?? "—"}</span>
      </div>
      {lastChangedAt && (
        <div className="text-muted-foreground text-xs">
          更新時間：{fmtDate(lastChangedAt)}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1.5 border-t pt-2.5">
        <span className="text-muted-foreground text-xs">結果</span>
        <StatusButton
          active={status === "WON"}
          cls="border-emerald-300 text-emerald-700 data-[on=true]:bg-emerald-600"
          onClick={onWon}
          disabled={pending}
        >
          成交
        </StatusButton>
        <StatusButton
          active={status === "LOST"}
          cls="border-rose-300 text-rose-700 data-[on=true]:bg-rose-600"
          onClick={onLost}
          disabled={pending}
        >
          流失
        </StatusButton>
        {status !== "OPEN" && (
          <button
            type="button"
            disabled={pending}
            onClick={onReopen}
            className="text-muted-foreground hover:bg-muted rounded-md border px-2 py-1 text-xs"
          >
            重新開啟
          </button>
        )}
      </div>
      {status !== "OPEN" && closedReason && (
        <p className="text-muted-foreground text-xs break-words whitespace-pre-wrap">
          原因：{closedReason}
        </p>
      )}
    </div>
  );
}

/** 標記成交 / 流失時彈出的原因輸入視窗（選填）。樣式沿用看板換階段的原因視窗。 */
function ClosedReasonDialog({
  status,
  defaultReason,
  pending,
  onCancel,
  onConfirm,
}: {
  status: "WON" | "LOST" | null;
  defaultReason: string;
  pending: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState(defaultReason);

  return (
    <Dialog open={!!status} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            標記為「{status === "WON" ? "成交" : "流失"}」
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="cr-reason">主要原因（選填）</Label>
          <Textarea
            id="cr-reason"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={
              status === "WON"
                ? "例：價格談妥、決策者拍板…"
                : "例：預算問題、競爭者、時機不對、沒回應…"
            }
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
            確定
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * 逐關詳細歷程（何時從 A 搬到 B、誰、為什麼）：階段步驟條下方的補充明細。
 * 只列真正的「搬過」（fromStage 有值）——建立商機時系統會順手記一筆
 * fromStage=null 的起點紀錄，那不是異動，商機從沒換過階段時只顯示這一筆
 * 會變成一個沒頭沒尾的「潛在」標籤，看不出任何歷程，不如不顯示。
 */
function StageTimeline({
  changes,
  stageMap,
}: {
  changes: StageChange[];
  stageMap: Map<string, StageView>;
}) {
  const moves = changes.filter((c) => c.fromStage !== null);
  if (moves.length === 0) return null;
  return (
    <ol className="border-muted relative ml-1 max-h-40 space-y-3 overflow-y-auto border-l pt-0.5 pl-4">
      {moves.map((c) => {
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
  onChanged,
  run,
}: {
  dealId: string;
  activities: Activity[];
  pending: boolean;
  onChanged: () => void;
  run: (
    fn: () => Promise<{ ok: boolean; error?: string } | void>,
    after?: () => void,
  ) => void;
}) {
  const [type, setType] = useState("note");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const body = String(fd.get("body") ?? "").trim();
    if (!body) return;
    const dueDate = String(fd.get("dueDate") ?? "") || null;
    run(() => addActivity({ dealId, type: type as never, body, dueDate }), () => {
      form.reset();
      setType("note");
      onChanged();
    });
  }

  function saveEdit(id: string) {
    if (!editBody.trim()) return;
    run(() => updateActivity(id, editBody), () => {
      setEditingId(null);
      onChanged();
    });
  }

  return (
    <div className="bg-card space-y-2.5 rounded-lg border p-3">
      <div className="text-muted-foreground text-xs font-medium">活動 / 跟進</div>
      <form onSubmit={submit} className="space-y-2">
        {/* 類型：分段按鈕，取代原生 select——同一頁的「請假方式」切換已經是這個樣式，沿用即可。
            標籤一律不換行（whitespace-nowrap）；原本用 sm: 隱藏文字是拿視窗寬度判斷，這裡
            實際擠壓來源是右欄本身的寬度，兩者無關，視窗夠寬時文字照樣會被擠到換行。 */}
        <div className="bg-muted grid grid-cols-5 gap-1 rounded-md p-1">
          {CRM_ACTIVITY_TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setType(t.value)}
              title={t.label}
              className={cn(
                "flex items-center justify-center gap-1 overflow-hidden rounded px-1 py-1 text-xs font-medium whitespace-nowrap transition-colors",
                type === t.value
                  ? "bg-background shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span aria-hidden>{t.icon}</span>
              <span className="truncate">{t.label}</span>
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            name="body"
            autoComplete="off"
            placeholder="紀錄一則跟進 / 備註…"
            className="border-input h-9 flex-1 rounded-md border bg-transparent px-2 text-sm outline-none focus:border-ring"
          />
          <Button type="submit" size="sm" disabled={pending}>
            新增
          </Button>
        </div>
        {type === "task" && (
          <input
            name="dueDate"
            type="date"
            title="待辦到期日"
            className="border-input h-8 rounded-md border bg-transparent px-2 text-xs"
          />
        )}
      </form>

      <div className={cn(ACTIVITY_LIST_MAX_H, "space-y-2 overflow-y-auto pr-1")}>
        {activities.length === 0 ? (
          <p className="text-muted-foreground text-xs">尚無活動紀錄。</p>
        ) : (
          activities.map((a) => (
            <NoteBubble
              key={a.id}
              author={a.author}
              createdAt={a.createdAt}
              updatedAt={a.updatedAt}
              body={a.body}
              pending={pending}
              small
              strikethrough={a.type === "task" && a.done}
              editing={editingId === a.id}
              editBody={editBody}
              onEditBodyChange={setEditBody}
              onStartEdit={() => {
                setEditingId(a.id);
                setEditBody(a.body);
              }}
              onCancelEdit={() => setEditingId(null)}
              onSaveEdit={() => saveEdit(a.id)}
              onDelete={() => run(() => deleteActivity(a.id), onChanged)}
              headerBadge={
                <span className="bg-muted text-muted-foreground inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-medium">
                  {CRM_ACTIVITY_ICON[a.type] ?? "📝"}{" "}
                  {CRM_ACTIVITY_LABEL[a.type] ?? a.type}
                  {a.type === "task" && a.dueDate && (
                    <span
                      className={cn(
                        isOverdue(a.dueDate, a.done) && "text-rose-600",
                      )}
                    >
                      {" "}
                      · 到期 {fmtDateShort(a.dueDate)}
                    </span>
                  )}
                </span>
              }
              extraActions={
                a.type === "task" ? (
                  <button
                    type="button"
                    disabled={pending}
                    title={a.done ? "標記未完成" : "標記完成"}
                    onClick={() =>
                      run(() => toggleActivityDone(a.id, !a.done), onChanged)
                    }
                    className={cn(
                      a.done
                        ? "text-emerald-600"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Check className="h-3 w-3" />
                  </button>
                ) : undefined
              }
            />
          ))
        )}
      </div>
    </div>
  );
}
