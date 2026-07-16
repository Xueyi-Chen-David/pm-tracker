"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  Plus,
  Trash2,
  Play,
  Pause,
  RotateCcw,
  Timer,
  CalendarDays,
  Link2,
  ClipboardList,
  ClipboardCheck,
  Save,
  Pencil,
} from "lucide-react";
import {
  createTodo,
  updateTodo,
  deleteTodo,
  updatePomodoro,
  deletePomodoro,
} from "@/server/actions/todo";
import { addTodoToDailyReport } from "@/server/actions/daily";
import { cn } from "@/lib/utils";
import { fmtDateShort } from "@/lib/date";
import { usePomodoro } from "@/components/pomodoro";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export type TodoView = {
  id: string;
  title: string;
  note: string | null;
  done: boolean;
  startDate: string | null;
  dueDate: string | null;
  taskId: string | null;
  taskLabel: string | null;
  pomodoroCount: number;
};
export type PomodoroView = {
  id: string;
  startedAt: string;
  durationSec: number;
  todoId: string | null;
  todoTitle: string | null;
};
export type TaskOption = { id: string; label: string };

/** 精確時長：H 小時 M 分 S 秒（時 / 分為 0 時省略前導單位）。 */
function fmtDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(`${h} 小時`);
  if (h > 0 || m > 0) parts.push(`${m} 分`);
  parts.push(`${s} 秒`);
  return parts.join(" ");
}

const selectCls =
  "border-input bg-transparent dark:bg-input/30 h-8 rounded-md border px-2 text-sm outline-none focus-visible:border-ring";
const dateCls =
  "border-input bg-transparent dark:bg-input/30 h-8 rounded-md border px-2 text-xs outline-none focus-visible:border-ring";

export function TodoWorkspace({
  todos,
  pomodoros,
  taskOptions,
  reportedTitles = [],
}: {
  todos: TodoView[];
  pomodoros: PomodoroView[];
  taskOptions: TaskOption[];
  /** 已在今日報告的工作項目標題（用來標示待辦是否已丟到今日報告）。 */
  reportedTitles?: string[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const reportedSet = new Set(reportedTitles.map((s) => s.trim()));

  function run(fn: () => Promise<unknown>, ok?: string) {
    start(async () => {
      try {
        await fn();
        if (ok) toast.success(ok);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "操作失敗");
      }
    });
  }

  return (
    <div className="grid gap-4 lg:h-full lg:min-h-0 lg:auto-rows-fr lg:grid-cols-3">
      <div className="lg:col-span-2 lg:min-h-0">
        <TodoList
          todos={todos}
          taskOptions={taskOptions}
          reportedSet={reportedSet}
          pending={pending}
          run={run}
        />
      </div>
      <div className="flex flex-col gap-4 lg:min-h-0">
        <Pomodoro todos={todos} />
        <PomodoroRecords
          pomodoros={pomodoros}
          todos={todos}
          pending={pending}
          run={run}
        />
      </div>
    </div>
  );
}

// ── 待辦清單 ─────────────────────────────────────────────

function TodoList({
  todos,
  taskOptions,
  reportedSet,
  pending,
  run,
}: {
  todos: TodoView[];
  taskOptions: TaskOption[];
  reportedSet: Set<string>;
  pending: boolean;
  run: (fn: () => Promise<unknown>, ok?: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [taskId, setTaskId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [tab, setTab] = useState<"open" | "done">("open");

  function add() {
    const t = title.trim();
    if (!t) return;
    run(async () => {
      await createTodo({
        title: t,
        taskId: taskId || null,
        startDate: startDate || null,
        dueDate: dueDate || null,
      });
      setTitle("");
      setTaskId("");
      setStartDate("");
      setDueDate("");
    }, "已新增待辦");
  }

  const open = todos.filter((t) => !t.done);
  const done = todos.filter((t) => t.done);
  const list = tab === "open" ? open : done;

  return (
    <section className="bg-card flex flex-col overflow-hidden rounded-xl border shadow-sm lg:h-full lg:min-h-0">
      <div className="border-b px-4 py-3">
        <h2 className="text-base font-semibold">待辦清單</h2>
      </div>

      {/* 新增待辦 */}
      <div className="space-y-2 border-b p-3">
        <div className="flex gap-2">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            placeholder="要做什麼…"
            className="h-9 flex-1"
          />
          <Button size="sm" className="h-9" disabled={pending || !title.trim()} onClick={add}>
            <Plus className="h-4 w-4" /> 新增
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-muted-foreground inline-flex items-center gap-1 text-xs">
            <Link2 className="h-3.5 w-3.5" />
            <select
              value={taskId}
              onChange={(e) => setTaskId(e.target.value)}
              className={selectCls + " max-w-[16rem]"}
              title="關聯任務（選填）"
            >
              <option value="">（不關聯任務）</option>
              {taskOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-muted-foreground inline-flex items-center gap-1 text-xs">
            開始
            <input
              type="date"
              value={startDate}
              max={dueDate || undefined}
              onChange={(e) => setStartDate(e.target.value)}
              className={dateCls}
            />
          </label>
          <label className="text-muted-foreground inline-flex items-center gap-1 text-xs">
            結束
            <input
              type="date"
              value={dueDate}
              min={startDate || undefined}
              onChange={(e) => setDueDate(e.target.value)}
              className={dateCls}
            />
          </label>
        </div>
      </div>

      {/* 分頁：未完成 / 已完成 */}
      <div className="flex items-center gap-1 border-b px-2">
        <TodoTab active={tab === "open"} onClick={() => setTab("open")}>
          未完成 · {open.length}
        </TodoTab>
        <TodoTab active={tab === "done"} onClick={() => setTab("done")}>
          已完成 · {done.length}
        </TodoTab>
      </div>

      {/* 清單（超過高度就在區塊內上下捲動） */}
      <div className="scroll-y divide-y overflow-y-auto lg:min-h-0 lg:flex-1">
        {list.length === 0 ? (
          <p className="text-muted-foreground px-4 py-8 text-center text-sm">
            {tab === "open"
              ? todos.length === 0
                ? "還沒有待辦。用上面的欄位新增第一筆。"
                : "沒有未完成的待辦 🎉"
              : "還沒有已完成的待辦。"}
          </p>
        ) : (
          list.map((t) => (
            <TodoRow
              key={t.id}
              todo={t}
              taskOptions={taskOptions}
              inReport={reportedSet.has(t.title.trim())}
              pending={pending}
              run={run}
            />
          ))
        )}
      </div>
    </section>
  );
}

function TodoTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "border-primary text-foreground"
          : "text-muted-foreground hover:text-foreground border-transparent",
      )}
    >
      {children}
    </button>
  );
}

function TodoRow({
  todo,
  taskOptions,
  inReport,
  pending,
  run,
}: {
  todo: TodoView;
  taskOptions: TaskOption[];
  /** 此待辦是否已在今日報告（依標題比對）。 */
  inReport: boolean;
  pending: boolean;
  run: (fn: () => Promise<unknown>, ok?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  // 編輯表單的本機草稿；每次開啟時由目前值重置。
  const [title, setTitle] = useState(todo.title);
  const [note, setNote] = useState(todo.note ?? "");
  const [taskId, setTaskId] = useState(todo.taskId ?? "");
  const [startDate, setStartDate] = useState(todo.startDate ?? "");
  const [dueDate, setDueDate] = useState(todo.dueDate ?? "");

  function resetDraft() {
    setTitle(todo.title);
    setNote(todo.note ?? "");
    setTaskId(todo.taskId ?? "");
    setStartDate(todo.startDate ?? "");
    setDueDate(todo.dueDate ?? "");
  }
  function openEdit() {
    resetDraft();
    setOpen(true);
  }

  function save() {
    const t = title.trim();
    if (!t) {
      toast.error("請輸入待辦內容");
      return;
    }
    run(async () => {
      await updateTodo({
        id: todo.id,
        title: t,
        note,
        ...(taskId ? { taskId } : { clearTask: true }),
        ...(startDate ? { startDate } : { clearStart: true }),
        ...(dueDate ? { dueDate } : { clearDue: true }),
      });
      setOpen(false);
    }, "已更新待辦");
  }

  return (
    <div className={cn("flex items-start gap-2 px-3 py-2", todo.done && "opacity-60")}>
      <input
        type="checkbox"
        checked={todo.done}
        disabled={pending}
        onChange={(e) => run(() => updateTodo({ id: todo.id, done: e.target.checked }))}
        className="accent-primary mt-1 h-4 w-4 shrink-0"
      />
      {/* 點內容即可編輯（整筆：內容 / 備註 / 關聯任務 / 日期） */}
      <button
        type="button"
        onClick={openEdit}
        className="min-w-0 flex-1 rounded-md px-1 py-0.5 text-left hover:bg-muted/50"
        title="點擊編輯這筆待辦"
      >
        <span
          className={cn(
            "block text-sm break-words",
            todo.done && "text-muted-foreground line-through",
          )}
        >
          {todo.title}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
          {todo.taskLabel && (
            <span className="bg-muted inline-flex max-w-[16rem] items-center gap-1 rounded-full px-2 py-0.5">
              <Link2 className="h-3 w-3 shrink-0" />
              <span className="truncate">{todo.taskLabel}</span>
            </span>
          )}
          {(todo.startDate || todo.dueDate) && (
            <span className="text-muted-foreground inline-flex items-center gap-1 tabular-nums">
              <CalendarDays className="h-3 w-3" />
              {todo.startDate ? fmtDateShort(todo.startDate) : "—"}
              {" → "}
              {todo.dueDate ? fmtDateShort(todo.dueDate) : "—"}
            </span>
          )}
          {todo.pomodoroCount > 0 && (
            <span className="text-muted-foreground">🍅 {todo.pomodoroCount}</span>
          )}
        </span>
        {todo.note && (
          <span className="text-muted-foreground mt-0.5 block text-xs break-words whitespace-pre-wrap">
            {todo.note}
          </span>
        )}
      </button>

      {/* 一鍵把這筆待辦丟到今日報告（已加入則顯示綠勾、不重複）。 */}
      <button
        type="button"
        disabled={pending || inReport}
        title={inReport ? "已在今日報告" : "丟到今日報告"}
        onClick={() =>
          run(() => addTodoToDailyReport(todo.id), "已加入今日報告")
        }
        className={cn(
          "mt-0.5 rounded-md p-1",
          inReport
            ? "text-emerald-600"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        {inReport ? (
          <ClipboardCheck className="h-4 w-4" />
        ) : (
          <ClipboardList className="h-4 w-4" />
        )}
      </button>

      {/* 編輯（整筆一次存） */}
      <Popover
        open={open}
        onOpenChange={(o) => {
          if (o) resetDraft();
          setOpen(o);
        }}
      >
        <PopoverTrigger
          className="text-muted-foreground hover:bg-muted mt-0.5 rounded-md p-1"
          title="編輯"
        >
          <Pencil className="h-4 w-4" />
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 space-y-3">
          <div className="text-sm font-medium">編輯待辦</div>
          <div className="space-y-1">
            <div className="text-muted-foreground text-xs">內容</div>
            <Input
              value={title}
              disabled={pending}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  save();
                }
              }}
              placeholder="要做什麼…"
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1">
            <div className="text-muted-foreground text-xs">備註</div>
            <Textarea
              value={note}
              disabled={pending}
              placeholder="備註（選填）"
              rows={3}
              onChange={(e) => setNote(e.target.value)}
              className="text-sm"
            />
          </div>
          <div className="space-y-1">
            <div className="text-muted-foreground text-xs">關聯任務</div>
            <select
              value={taskId}
              disabled={pending}
              onChange={(e) => setTaskId(e.target.value)}
              className={selectCls + " w-full"}
            >
              <option value="">（不關聯任務）</option>
              {taskOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="min-w-0 space-y-1">
              <div className="text-muted-foreground text-xs">開始日</div>
              <input
                type="date"
                value={startDate}
                max={dueDate || undefined}
                disabled={pending}
                onChange={(e) => setStartDate(e.target.value)}
                className={dateCls + " w-full min-w-0"}
              />
            </div>
            <div className="min-w-0 space-y-1">
              <div className="text-muted-foreground text-xs">結束 / 到期日</div>
              <input
                type="date"
                value={dueDate}
                min={startDate || undefined}
                disabled={pending}
                onChange={(e) => setDueDate(e.target.value)}
                className={dateCls + " w-full min-w-0"}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              取消
            </Button>
            <Button size="sm" disabled={pending || !title.trim()} onClick={save}>
              <Save className="h-4 w-4" /> 儲存
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      <button
        type="button"
        disabled={pending}
        title="刪除"
        onClick={() => {
          if (confirm(`刪除待辦「${todo.title}」？`))
            run(() => deleteTodo(todo.id), "已刪除");
        }}
        className="text-muted-foreground hover:text-destructive mt-0.5 rounded-md p-1"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

// ── 番茄鐘 ───────────────────────────────────────────────

function Pomodoro({ todos }: { todos: TodoView[] }) {
  const router = useRouter();
  const pomo = usePomodoro();
  // idle 時的設定（進行中則鎖定、以 context 的值為準）。
  const [durationMin, setDurationMin] = useState(() =>
    Math.max(1, Math.round(pomo.durationSec / 60)),
  );
  const [focusTodoId, setFocusTodoId] = useState("");
  const wasActive = useRef(pomo.active);

  // 完成 / 結束時（active true→false）刷新頁面，讓右側番茄鐘紀錄更新。
  useEffect(() => {
    if (wasActive.current && !pomo.active) router.refresh();
    wasActive.current = pomo.active;
  }, [pomo.active, router]);

  function changeDuration(n: number) {
    const v = Math.max(1, Math.min(180, Math.floor(n) || 1));
    setDurationMin(v);
    pomo.setDurationSec(v * 60);
  }

  const total = pomo.active ? pomo.durationSec : durationMin * 60;
  const remaining = pomo.active ? pomo.remainingSec : durationMin * 60;
  const elapsed = total - remaining;
  const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");
  const progress = total > 0 ? (elapsed / total) * 100 : 0;
  // 顯示用時長（進行中鎖定為 context 值）與專注待辦。
  const shownMin = pomo.active ? Math.round(pomo.durationSec / 60) : durationMin;

  function primary() {
    if (!pomo.active) {
      // 這個點擊手勢順便請求通知權限，確保完成時桌面通知跳得出來。
      if (
        typeof window !== "undefined" &&
        "Notification" in window &&
        Notification.permission === "default"
      ) {
        void Notification.requestPermission();
      }
      const t = todos.find((x) => x.id === focusTodoId);
      pomo.start(durationMin * 60, focusTodoId || null, t?.title ?? null);
    } else {
      pomo.toggle();
    }
  }

  return (
    <section className="bg-card rounded-xl border p-4 shadow-sm lg:shrink-0">
      <h2 className="mb-3 flex items-center gap-1.5 text-base font-semibold">
        <Timer className="h-4 w-4" /> 番茄鐘
      </h2>

      <div className="text-center">
        <div className="text-5xl font-bold tabular-nums">
          {mm}:{ss}
        </div>
        <div className="bg-muted mx-auto mt-2 h-1.5 w-full overflow-hidden rounded-full">
          <div
            className="bg-primary h-full rounded-full transition-[width] duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        {pomo.active && pomo.todoTitle && (
          <p className="text-muted-foreground mt-1.5 truncate text-xs">
            專注於：{pomo.todoTitle}
          </p>
        )}
      </div>

      <div className="mt-3 flex items-center justify-center gap-2">
        <Button size="sm" onClick={primary}>
          {!pomo.active ? (
            <>
              <Play className="h-4 w-4" /> 開始
            </>
          ) : pomo.running ? (
            <>
              <Pause className="h-4 w-4" /> 暫停
            </>
          ) : (
            <>
              <Play className="h-4 w-4" /> 繼續
            </>
          )}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!pomo.active}
          onClick={pomo.reset}
        >
          <RotateCcw className="h-4 w-4" /> 重設
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={!pomo.active || elapsed < 1}
          onClick={pomo.logElapsed}
        >
          <Save className="h-4 w-4" /> 記錄
        </Button>
      </div>

      <p className="text-muted-foreground mt-2 text-center text-[11px]">
        離開頁面或關閉網頁都會持續倒數，時間到會發桌面通知。
      </p>

      <div className="mt-3 space-y-2 border-t pt-3">
        <label className="flex items-center justify-between gap-2 text-xs">
          <span className="text-muted-foreground">時長（分鐘）</span>
          <div className="flex gap-1">
            {[15, 25, 50].map((n) => (
              <button
                key={n}
                type="button"
                disabled={pomo.active}
                onClick={() => changeDuration(n)}
                className={cn(
                  "rounded-md border px-2 py-0.5 text-xs disabled:opacity-50",
                  shownMin === n
                    ? "border-primary bg-primary/10 text-primary"
                    : "text-muted-foreground",
                )}
              >
                {n}
              </button>
            ))}
            <input
              type="number"
              min={1}
              max={180}
              disabled={pomo.active}
              value={shownMin}
              onChange={(e) => changeDuration(Number(e.target.value))}
              className={dateCls + " w-14 disabled:opacity-50"}
            />
          </div>
        </label>
        <label className="flex items-center justify-between gap-2 text-xs">
          <span className="text-muted-foreground shrink-0">專注於</span>
          <select
            value={pomo.active ? (pomo.todoId ?? "") : focusTodoId}
            disabled={pomo.active}
            onChange={(e) => setFocusTodoId(e.target.value)}
            className={selectCls + " min-w-0 flex-1 text-xs disabled:opacity-50"}
          >
            <option value="">（不指定待辦）</option>
            {todos
              .filter((t) => !t.done)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
          </select>
        </label>
      </div>
    </section>
  );
}

function PomodoroRecords({
  pomodoros,
  todos,
  pending,
  run,
}: {
  pomodoros: PomodoroView[];
  todos: TodoView[];
  pending: boolean;
  run: (fn: () => Promise<unknown>, ok?: string) => void;
}) {
  const totalSec = pomodoros.reduce((s, p) => s + p.durationSec, 0);
  const todayStr = new Date().toDateString();
  const todaySec = pomodoros.reduce(
    (s, p) =>
      new Date(p.startedAt).toDateString() === todayStr ? s + p.durationSec : s,
    0,
  );

  return (
    <section className="bg-card flex flex-col overflow-hidden rounded-xl border shadow-sm lg:min-h-0 lg:flex-1">
      <div className="border-b px-4 py-3">
        <h2 className="text-base font-semibold">番茄鐘紀錄</h2>
        <div className="text-muted-foreground mt-0.5 text-xs">
          今日 {fmtDuration(todaySec)} · 累計 {fmtDuration(totalSec)}（{pomodoros.length} 次）
        </div>
      </div>
      {pomodoros.length === 0 ? (
        <p className="text-muted-foreground px-4 py-6 text-center text-sm">
          還沒有番茄鐘紀錄。完成一個番茄鐘後會顯示在這裡。
        </p>
      ) : (
        <div className="scroll-y max-h-[24rem] divide-y overflow-y-auto lg:max-h-none lg:min-h-0 lg:flex-1">
          {pomodoros.map((p) => (
            <PomodoroRow
              key={p.id}
              p={p}
              todos={todos}
              pending={pending}
              run={run}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function PomodoroRow({
  p,
  todos,
  pending,
  run,
}: {
  p: PomodoroView;
  todos: TodoView[];
  pending: boolean;
  run: (fn: () => Promise<unknown>, ok?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [min, setMin] = useState(Math.floor(p.durationSec / 60));
  const [sec, setSec] = useState(p.durationSec % 60);
  const [todoId, setTodoId] = useState(p.todoId ?? "");
  const [startedAt, setStartedAt] = useState("");

  function resetDraft() {
    setMin(Math.floor(p.durationSec / 60));
    setSec(p.durationSec % 60);
    setTodoId(p.todoId ?? "");
    setStartedAt(format(new Date(p.startedAt), "yyyy-MM-dd'T'HH:mm"));
  }

  function save() {
    const durationSec = Math.max(1, min * 60 + sec);
    run(
      () =>
        updatePomodoro({
          id: p.id,
          durationSec,
          ...(todoId ? { todoId } : { clearTodo: true }),
          startedAt,
        }),
      "已更新紀錄",
    );
    setOpen(false);
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2 text-sm">
      <span className="shrink-0">🍅</span>
      <div className="min-w-0 flex-1">
        <div className="tabular-nums">{fmtDuration(p.durationSec)}</div>
        <div className="text-muted-foreground truncate text-[11px]">
          {format(new Date(p.startedAt), "yyyy/MM/dd HH:mm")}
          {p.todoTitle ? ` · ${p.todoTitle}` : ""}
        </div>
      </div>
      <Popover
        open={open}
        onOpenChange={(o) => {
          if (o) resetDraft();
          setOpen(o);
        }}
      >
        <PopoverTrigger
          className="text-muted-foreground hover:bg-muted rounded-md p-1"
          title="編輯這筆紀錄"
        >
          <Pencil className="h-4 w-4" />
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64 space-y-2.5">
          <div className="text-sm font-medium">編輯番茄鐘紀錄</div>
          <div className="space-y-1">
            <div className="text-muted-foreground text-xs">時長</div>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={0}
                value={min}
                disabled={pending}
                onChange={(e) => setMin(Math.max(0, Number(e.target.value) || 0))}
                className={dateCls + " w-16"}
              />
              <span className="text-muted-foreground text-xs">分</span>
              <input
                type="number"
                min={0}
                max={59}
                value={sec}
                disabled={pending}
                onChange={(e) =>
                  setSec(Math.min(59, Math.max(0, Number(e.target.value) || 0)))
                }
                className={dateCls + " w-16"}
              />
              <span className="text-muted-foreground text-xs">秒</span>
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-muted-foreground text-xs">專注於</div>
            <select
              value={todoId}
              disabled={pending}
              onChange={(e) => setTodoId(e.target.value)}
              className={selectCls + " w-full"}
            >
              <option value="">（不指定待辦）</option>
              {todos.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <div className="text-muted-foreground text-xs">開始時間</div>
            <input
              type="datetime-local"
              value={startedAt}
              disabled={pending}
              onChange={(e) => setStartedAt(e.target.value)}
              className={dateCls + " w-full"}
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              取消
            </Button>
            <Button size="sm" disabled={pending} onClick={save}>
              <Save className="h-4 w-4" /> 儲存
            </Button>
          </div>
        </PopoverContent>
      </Popover>
      <button
        type="button"
        disabled={pending}
        title="刪除這筆紀錄"
        onClick={() => run(() => deletePomodoro(p.id), "已刪除紀錄")}
        className="text-muted-foreground hover:text-destructive rounded-md p-1"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
