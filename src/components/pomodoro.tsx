"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { Timer, Pause, Play, X } from "lucide-react";
import { logPomodoro } from "@/server/actions/todo";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────
// 番茄鐘（全域、持久）。以「結束時間 endsAt（牆上時鐘毫秒）」為單一真相，存 localStorage：
//   - 切換頁面（SPA 導覽）→ 這是模組級 store（不隨元件卸載），計時不中斷。
//   - 關閉 / 離開網頁 → 重新打開時用 endsAt 推算剩餘（＝一直在倒數）；若已過期就補觸發完成。
//   - 支援 Notification Triggers（showTrigger）的瀏覽器：連分頁關著也會準時跳完成通知。
//   完成時：記錄一次番茄鐘（logPomodoro）＋發桌面通知。
// 用 useSyncExternalStore 訂閱（SSR 安全、無 setState-in-effect）。
// ─────────────────────────────────────────────────────────────

const STORAGE_KEY = "pm_pomodoro";

type Persisted = {
  durationSec: number; // 這次設定的總長
  endsAt: number | null; // 進行中：結束的 epoch ms
  pausedRemainingSec: number | null; // 暫停中：剩餘秒數
  todoId: string | null;
  todoTitle: string | null;
};

const DEFAULT: Persisted = {
  durationSec: 25 * 60,
  endsAt: null,
  pausedRemainingSec: null,
  todoId: null,
  todoTitle: null,
};

function load(): Persisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT;
    return { ...DEFAULT, ...(JSON.parse(raw) as Partial<Persisted>) };
  } catch {
    return DEFAULT;
  }
}
function persist(p: Persisted) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

const isRunning = (s: Persisted) =>
  s.endsAt !== null && s.pausedRemainingSec === null;

// ── 通知輔助 ─────────────────────────────────────────────
const DONE_TITLE = "番茄鐘完成 🍅";
const DONE_BODY = "專注時間到，休息一下 🍵";
const DONE_TAG = "pomodoro-done";

async function notifyDone() {
  const options: NotificationOptions = {
    body: DONE_BODY,
    tag: DONE_TAG,
    data: { link: "/todo" },
  };
  try {
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(DONE_TITLE, options);
      return;
    }
  } catch {
    /* fall through */
  }
  try {
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(DONE_TITLE, options);
    }
  } catch {
    /* ignore */
  }
}

/** Notification Triggers：排定「到時自動跳」的通知（連關網頁也會跳；不支援就靜默略過）。 */
async function scheduleTrigger(endsAt: number) {
  try {
    if (
      !("serviceWorker" in navigator) ||
      !("Notification" in window) ||
      Notification.permission !== "granted" ||
      !("showTrigger" in Notification.prototype)
    )
      return;
    const TT = (
      window as unknown as { TimestampTrigger?: new (t: number) => unknown }
    ).TimestampTrigger;
    if (!TT) return;
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification(DONE_TITLE, {
      body: DONE_BODY,
      tag: DONE_TAG,
      data: { link: "/todo" },
      showTrigger: new TT(endsAt),
    } as NotificationOptions);
  } catch {
    /* ignore */
  }
}

async function cancelTrigger() {
  try {
    if (!("serviceWorker" in navigator)) return;
    const reg = await navigator.serviceWorker.ready;
    const list = await reg.getNotifications({
      tag: DONE_TAG,
      includeTriggered: true,
    } as unknown as { tag: string });
    list.forEach((n) => n.close());
  } catch {
    /* ignore */
  }
}

// ── 模組級 store ─────────────────────────────────────────
type Snapshot = { state: Persisted; nowMs: number };

let state: Persisted = DEFAULT;
let nowMs = 0;
let hydrated = false;
let completing = false;
let ticker: ReturnType<typeof setInterval> | null = null;
let snapshot: Snapshot = { state, nowMs };
const SERVER_SNAPSHOT: Snapshot = { state: DEFAULT, nowMs: 0 };
const listeners = new Set<() => void>();

function refresh() {
  snapshot = { state, nowMs };
  listeners.forEach((l) => l());
}

function ensureTicker() {
  if (ticker !== null) return;
  ticker = setInterval(() => {
    nowMs = Date.now();
    if (isRunning(state) && (state.endsAt ?? 0) <= nowMs) finish();
    else refresh();
  }, 1000);
}
function stopTicker() {
  if (ticker !== null) {
    clearInterval(ticker);
    ticker = null;
  }
}

function commit(next: Persisted) {
  state = next;
  persist(next);
  nowMs = Date.now();
  if (isRunning(next)) ensureTicker();
  else stopTicker();
  refresh();
}

function finish() {
  if (completing) return;
  completing = true;
  const s = state;
  const startedAt = s.endsAt
    ? new Date(s.endsAt - s.durationSec * 1000)
    : new Date();
  void logPomodoro({
    durationSec: s.durationSec,
    todoId: s.todoId ?? undefined,
    startedAt: startedAt.toISOString(),
  }).catch(() => {});
  void notifyDone();
  void cancelTrigger();
  stopTicker();
  state = { ...DEFAULT, durationSec: s.durationSec };
  persist(state);
  nowMs = Date.now();
  refresh();
  setTimeout(() => {
    completing = false;
  }, 1500);
}

/**
 * 用「牆上時鐘」校正一次：背景分頁的 setInterval 會被節流甚至凍結，導致顯示停住、
 * 完成延後。回到分頁 / 取得焦點時馬上重算剩餘、必要時補觸發完成。
 */
function syncFromClock() {
  if (!hydrated) return;
  nowMs = Date.now();
  if (isRunning(state) && (state.endsAt ?? 0) <= nowMs) finish();
  else refresh();
}

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  state = load();
  nowMs = Date.now();
  // 分頁重新可見 / 取得焦點 → 立即校正（背景時計時仍以 endsAt 為準，不會漏算）。
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") syncFromClock();
  });
  window.addEventListener("focus", syncFromClock);
  if (isRunning(state) && (state.endsAt ?? 0) <= nowMs) finish();
  else {
    if (isRunning(state)) ensureTicker();
    refresh();
  }
}

// ── 動作（皆從使用者事件呼叫，非 effect）──────────────────
function start(
  durationSec: number,
  todoId: string | null,
  todoTitle: string | null,
) {
  completing = false;
  const endsAt = Date.now() + durationSec * 1000;
  void scheduleTrigger(endsAt);
  commit({ durationSec, endsAt, pausedRemainingSec: null, todoId, todoTitle });
}
function toggle() {
  if (isRunning(state)) {
    const rem = Math.max(0, Math.round(((state.endsAt ?? 0) - Date.now()) / 1000));
    void cancelTrigger();
    commit({ ...state, endsAt: null, pausedRemainingSec: rem });
  } else if (state.pausedRemainingSec !== null) {
    const endsAt = Date.now() + state.pausedRemainingSec * 1000;
    void scheduleTrigger(endsAt);
    commit({ ...state, endsAt, pausedRemainingSec: null });
  }
}
function reset() {
  completing = false;
  void cancelTrigger();
  commit({ ...DEFAULT, durationSec: state.durationSec });
}
function logElapsed() {
  completing = false;
  void cancelTrigger();
  const rem =
    state.pausedRemainingSec !== null
      ? state.pausedRemainingSec
      : isRunning(state)
        ? Math.max(0, Math.round(((state.endsAt ?? 0) - Date.now()) / 1000))
        : state.durationSec;
  const elapsed = state.durationSec - rem;
  if (elapsed >= 1) {
    void logPomodoro({
      durationSec: elapsed,
      todoId: state.todoId ?? undefined,
    }).catch(() => {});
  }
  commit({ ...DEFAULT, durationSec: state.durationSec });
}
function setDurationSec(sec: number) {
  if (!isRunning(state) && state.pausedRemainingSec === null) {
    commit({ ...state, durationSec: sec });
  }
}

function subscribe(cb: () => void) {
  hydrate();
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
const getSnapshot = () => snapshot;
const getServerSnapshot = () => SERVER_SNAPSHOT;

export type PomodoroApi = {
  active: boolean;
  running: boolean;
  paused: boolean;
  remainingSec: number;
  durationSec: number;
  todoId: string | null;
  todoTitle: string | null;
  start: typeof start;
  toggle: typeof toggle;
  reset: typeof reset;
  logElapsed: typeof logElapsed;
  setDurationSec: typeof setDurationSec;
};

export function usePomodoro(): PomodoroApi {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const s = snap.state;
  const running = isRunning(s);
  const paused = s.pausedRemainingSec !== null;
  const active = running || paused;
  const remainingSec = paused
    ? Math.max(0, Math.round(s.pausedRemainingSec ?? 0))
    : running
      ? Math.max(0, Math.round(((s.endsAt ?? 0) - snap.nowMs) / 1000))
      : s.durationSec;
  return {
    active,
    running,
    paused,
    remainingSec,
    durationSec: s.durationSec,
    todoId: s.todoId,
    todoTitle: s.todoTitle,
    start,
    toggle,
    reset,
    logElapsed,
    setDurationSec,
  };
}

export function fmtClock(sec: number): string {
  const m = Math.floor(sec / 60);
  const r = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

/** 全域浮動計時膠囊：任何頁面都看得到進行中的番茄鐘，可暫停 / 結束，點擊回 /todo。 */
export function PomodoroIndicator() {
  const { active, running, remainingSec, todoTitle, toggle, reset } =
    usePomodoro();
  if (!active) return null;

  return (
    <div className="no-print bg-card/95 fixed right-4 bottom-4 z-40 flex items-center gap-2 rounded-full border py-1.5 pr-1.5 pl-3 shadow-lg backdrop-blur">
      <Link
        href="/todo"
        className="flex items-center gap-2"
        title={todoTitle ? `專注於：${todoTitle}` : "番茄鐘"}
      >
        <Timer
          className={cn(
            "h-4 w-4",
            running ? "text-primary" : "text-muted-foreground",
          )}
        />
        <span className="text-sm font-semibold tabular-nums">
          {fmtClock(remainingSec)}
        </span>
        {todoTitle && (
          <span className="text-muted-foreground max-w-[8rem] truncate text-xs">
            {todoTitle}
          </span>
        )}
      </Link>
      <button
        type="button"
        onClick={toggle}
        title={running ? "暫停" : "繼續"}
        className="hover:bg-muted rounded-full p-1.5"
      >
        {running ? (
          <Pause className="h-3.5 w-3.5" />
        ) : (
          <Play className="h-3.5 w-3.5" />
        )}
      </button>
      <button
        type="button"
        onClick={reset}
        title="結束"
        className="text-muted-foreground hover:bg-muted hover:text-destructive rounded-full p-1.5"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
