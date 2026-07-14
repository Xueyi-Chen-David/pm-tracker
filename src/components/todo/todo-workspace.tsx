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
  Save,
} from "lucide-react";
import {
  createTodo,
  updateTodo,
  deleteTodo,
  logPomodoro,
  deletePomodoro,
} from "@/server/actions/todo";
import { cn } from "@/lib/utils";
import { fmtDateShort } from "@/lib/date";
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
}: {
  todos: TodoView[];
  pomodoros: PomodoroView[];
  taskOptions: TaskOption[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

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
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <TodoList
          todos={todos}
          taskOptions={taskOptions}
          pending={pending}
          run={run}
        />
      </div>
      <div className="space-y-4">
        <Pomodoro todos={todos} pending={pending} run={run} />
        <PomodoroRecords pomodoros={pomodoros} pending={pending} run={run} />
      </div>
    </div>
  );
}

// ── 待辦清單 ─────────────────────────────────────────────

function TodoList({
  todos,
  taskOptions,
  pending,
  run,
}: {
  todos: TodoView[];
  taskOptions: TaskOption[];
  pending: boolean;
  run: (fn: () => Promise<unknown>, ok?: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [taskId, setTaskId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");

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

  return (
    <section className="bg-card overflow-hidden rounded-xl border shadow-sm">
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

      {/* 清單 */}
      {todos.length === 0 ? (
        <p className="text-muted-foreground px-4 py-8 text-center text-sm">
          還沒有待辦。用上面的欄位新增第一筆。
        </p>
      ) : (
        <div className="divide-y">
          {open.map((t) => (
            <TodoRow key={t.id} todo={t} taskOptions={taskOptions} pending={pending} run={run} />
          ))}
          {done.length > 0 && (
            <div className="text-muted-foreground bg-muted/30 px-4 py-1.5 text-[11px]">
              已完成 {done.length}
            </div>
          )}
          {done.map((t) => (
            <TodoRow key={t.id} todo={t} taskOptions={taskOptions} pending={pending} run={run} />
          ))}
        </div>
      )}
    </section>
  );
}

function TodoRow({
  todo,
  taskOptions,
  pending,
  run,
}: {
  todo: TodoView;
  taskOptions: TaskOption[];
  pending: boolean;
  run: (fn: () => Promise<unknown>, ok?: string) => void;
}) {
  return (
    <div className={cn("flex items-start gap-2 px-3 py-2", todo.done && "opacity-60")}>
      <input
        type="checkbox"
        checked={todo.done}
        disabled={pending}
        onChange={(e) => run(() => updateTodo({ id: todo.id, done: e.target.checked }))}
        className="accent-primary mt-1 h-4 w-4 shrink-0"
      />
      <div className="min-w-0 flex-1">
        <input
          defaultValue={todo.title}
          disabled={pending}
          onBlur={(e) => {
            const v = e.currentTarget.value.trim();
            if (v && v !== todo.title) run(() => updateTodo({ id: todo.id, title: v }));
          }}
          className={cn(
            "hover:bg-muted/50 focus:bg-muted/50 w-full rounded-md bg-transparent px-1 py-0.5 text-sm outline-none",
            todo.done && "text-muted-foreground line-through",
          )}
        />
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 px-1 text-[11px]">
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
        </div>
        {todo.note && (
          <p className="text-muted-foreground mt-0.5 px-1 text-xs whitespace-pre-wrap">
            {todo.note}
          </p>
        )}
      </div>

      {/* 編輯（備註 / 關聯任務 / 日期） */}
      <Popover>
        <PopoverTrigger className="text-muted-foreground hover:bg-muted mt-0.5 rounded-md p-1" title="編輯備註 / 關聯任務 / 日期">
          <CalendarDays className="h-4 w-4" />
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 space-y-3">
          <div className="space-y-1">
            <div className="text-muted-foreground text-xs">備註</div>
            <Textarea
              defaultValue={todo.note ?? ""}
              disabled={pending}
              placeholder="備註（選填）"
              rows={3}
              onBlur={(e) => {
                const v = e.currentTarget.value;
                if (v !== (todo.note ?? ""))
                  run(() => updateTodo({ id: todo.id, note: v }));
              }}
              className="text-sm"
            />
          </div>
          <div className="space-y-1">
            <div className="text-muted-foreground text-xs">關聯任務</div>
            <select
              defaultValue={todo.taskId ?? ""}
              disabled={pending}
              onChange={(e) => {
                const v = e.target.value;
                run(() =>
                  updateTodo(
                    v
                      ? { id: todo.id, taskId: v }
                      : { id: todo.id, clearTask: true },
                  ),
                );
              }}
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
          <div className="space-y-1">
            <div className="text-muted-foreground text-xs">開始日</div>
            <input
              type="date"
              defaultValue={todo.startDate ?? ""}
              max={todo.dueDate ?? undefined}
              disabled={pending}
              onChange={(e) =>
                run(() =>
                  updateTodo(
                    e.target.value
                      ? { id: todo.id, startDate: e.target.value }
                      : { id: todo.id, clearStart: true },
                  ),
                )
              }
              className={dateCls + " w-full"}
            />
          </div>
          <div className="space-y-1">
            <div className="text-muted-foreground text-xs">結束 / 到期日</div>
            <input
              type="date"
              defaultValue={todo.dueDate ?? ""}
              min={todo.startDate ?? undefined}
              disabled={pending}
              onChange={(e) =>
                run(() =>
                  updateTodo(
                    e.target.value
                      ? { id: todo.id, dueDate: e.target.value }
                      : { id: todo.id, clearDue: true },
                  ),
                )
              }
              className={dateCls + " w-full"}
            />
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

function Pomodoro({
  todos,
  pending,
  run,
}: {
  todos: TodoView[];
  pending: boolean;
  run: (fn: () => Promise<unknown>, ok?: string) => void;
}) {
  const [durationMin, setDurationMin] = useState(25);
  const [secondsLeft, setSecondsLeft] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const [focusTodoId, setFocusTodoId] = useState("");
  const completedRef = useRef(false);

  // 倒數：running 時每秒 -1。
  useEffect(() => {
    if (!running) return;
    const iv = setInterval(() => {
      setSecondsLeft((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => clearInterval(iv);
  }, [running]);

  // 倒數歸零 → 記錄一個完整番茄鐘。
  useEffect(() => {
    if (running && secondsLeft === 0 && !completedRef.current) {
      completedRef.current = true;
      setRunning(false);
      const sec = durationMin * 60;
      run(
        () => logPomodoro({ durationSec: sec, todoId: focusTodoId || null }),
        "完成一個番茄鐘 🍅",
      );
      setSecondsLeft(durationMin * 60);
    }
  }, [running, secondsLeft, durationMin, focusTodoId, run]);

  // 改時長：未在倒數時同步倒數起點（在事件處理裡設，不用 effect）。
  function changeDuration(n: number) {
    const v = Math.max(1, Math.min(180, Math.floor(n) || 1));
    setDurationMin(v);
    if (!running) {
      setSecondsLeft(v * 60);
      completedRef.current = false;
    }
  }

  const elapsed = durationMin * 60 - secondsLeft;
  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");
  const progress = durationMin > 0 ? (elapsed / (durationMin * 60)) * 100 : 0;

  function toggle() {
    completedRef.current = false;
    if (secondsLeft === 0) setSecondsLeft(durationMin * 60);
    setRunning((v) => !v);
  }
  function reset() {
    completedRef.current = false;
    setRunning(false);
    setSecondsLeft(durationMin * 60);
  }
  function logElapsed() {
    if (elapsed < 1) {
      toast.error("還沒有專注時間可記錄。");
      return;
    }
    setRunning(false);
    run(
      () => logPomodoro({ durationSec: elapsed, todoId: focusTodoId || null }),
      "已記錄專注時間",
    );
    completedRef.current = false;
    setSecondsLeft(durationMin * 60);
  }

  return (
    <section className="bg-card rounded-xl border p-4 shadow-sm">
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
      </div>

      <div className="mt-3 flex items-center justify-center gap-2">
        <Button size="sm" onClick={toggle}>
          {running ? (
            <>
              <Pause className="h-4 w-4" /> 暫停
            </>
          ) : (
            <>
              <Play className="h-4 w-4" /> {secondsLeft === durationMin * 60 ? "開始" : "繼續"}
            </>
          )}
        </Button>
        <Button size="sm" variant="outline" onClick={reset}>
          <RotateCcw className="h-4 w-4" /> 重設
        </Button>
        <Button size="sm" variant="ghost" disabled={pending || elapsed < 1} onClick={logElapsed}>
          <Save className="h-4 w-4" /> 記錄
        </Button>
      </div>

      <div className="mt-3 space-y-2 border-t pt-3">
        <label className="flex items-center justify-between gap-2 text-xs">
          <span className="text-muted-foreground">時長（分鐘）</span>
          <div className="flex gap-1">
            {[15, 25, 50].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => changeDuration(n)}
                className={cn(
                  "rounded-md border px-2 py-0.5 text-xs",
                  durationMin === n
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
              value={durationMin}
              onChange={(e) => changeDuration(Number(e.target.value))}
              className={dateCls + " w-14"}
            />
          </div>
        </label>
        <label className="flex items-center justify-between gap-2 text-xs">
          <span className="text-muted-foreground shrink-0">專注於</span>
          <select
            value={focusTodoId}
            onChange={(e) => setFocusTodoId(e.target.value)}
            className={selectCls + " min-w-0 flex-1 text-xs"}
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
  pending,
  run,
}: {
  pomodoros: PomodoroView[];
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
    <section className="bg-card overflow-hidden rounded-xl border shadow-sm">
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
        <div className="max-h-[24rem] divide-y overflow-auto">
          {pomodoros.map((p) => (
            <div key={p.id} className="flex items-center gap-2 px-3 py-2 text-sm">
              <span className="shrink-0">🍅</span>
              <div className="min-w-0 flex-1">
                <div className="tabular-nums">{fmtDuration(p.durationSec)}</div>
                <div className="text-muted-foreground truncate text-[11px]">
                  {format(new Date(p.startedAt), "yyyy/MM/dd HH:mm")}
                  {p.todoTitle ? ` · ${p.todoTitle}` : ""}
                </div>
              </div>
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
          ))}
        </div>
      )}
    </section>
  );
}
