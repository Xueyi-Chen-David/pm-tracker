"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Fingerprint, LogIn, LogOut, X } from "lucide-react";
import { punch } from "@/server/actions/checkin";
import {
  checkInReminderKind,
  formatClock,
  taipeiMinutesOfDay,
  type CheckInReminderFacts,
  type CheckInReminderKind,
} from "@/lib/checkin-reminder";
import { getCoords } from "@/lib/geo";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * 「今天忘了打卡」的溫和提醒。
 *
 * 刻意不做的事（這是整個功能的重點）：不彈 modal、不擋操作、不自動跳 toast、
 * 不寫進通知鈴鐺留紅點過夜。只有兩層可見度：
 *   1. 側欄「打卡 / 出勤」旁一顆琥珀小圓點——常駐、極安靜，隨時想起就點進去。
 *   2. 內容區最上方一條細提示條——可直接打卡、可按 ✕ 收起（只收今天這一次）。
 * 打完卡（或當天請假 / 出差）兩者立刻消失；隔天是新的一天，重新判斷。
 *
 * 何時該提醒的規則在 lib/checkin-reminder.ts（純函式）；伺服器只提供「今日事實」，
 * 時鐘在瀏覽器端跑，所以頁面開著到了 10:00 / 18:30 也會自己出現，不必重新整理。
 */

/** 「今天不再提醒」的記錄；值＝`${打卡日}:${種類}`，例："2026-07-29:in"。 */
const DISMISS_KEY = "pp:checkin-reminder-dismissed";
const DISMISS_EVENT = "pp:checkin-reminder-dismissed";

const FactsContext = createContext<CheckInReminderFacts | null>(null);

/** 由 (app)/layout 掛一次；facts＝null 代表這個人現在完全不需要提醒。 */
export function CheckInReminderProvider({
  facts,
  children,
}: {
  facts: CheckInReminderFacts | null;
  children: React.ReactNode;
}) {
  return (
    <FactsContext.Provider value={facts}>{children}</FactsContext.Provider>
  );
}

// ── 時鐘：每 30 秒（以及切回分頁時）重算一次，讓提醒到點自己浮出來 ──
// 用 useSyncExternalStore 而非 useEffect + setState：SSR 回傳 null（伺服器不知道
// 使用者的「現在」），hydration 後才算，不會有畫面不一致。
function subscribeClock(onChange: () => void) {
  const id = window.setInterval(onChange, 30_000);
  window.addEventListener("focus", onChange);
  document.addEventListener("visibilitychange", onChange);
  return () => {
    window.clearInterval(id);
    window.removeEventListener("focus", onChange);
    document.removeEventListener("visibilitychange", onChange);
  };
}

/** 快照＝「現在是第幾分鐘」，同一分鐘內回同一個值（useSyncExternalStore 要求穩定）。 */
function clockSnapshot(): number {
  return Math.floor(Date.now() / 60_000);
}

function readDismissed(): string | null {
  try {
    return localStorage.getItem(DISMISS_KEY);
  } catch {
    return null; // 隱私模式 / 停用儲存：頂多這次收不起來，不影響功能。
  }
}

function subscribeDismissed(onChange: () => void) {
  window.addEventListener(DISMISS_EVENT, onChange);
  window.addEventListener("storage", onChange); // 其他分頁按了 ✕ 也同步收起
  return () => {
    window.removeEventListener(DISMISS_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/**
 * 現在該提醒哪一張卡（null＝不提醒），以及使用者今天是否已把它收起來。
 * `dismissed` 只影響提示條；側欄小圓點照常顯示——收起是「別擋著我」，不是「別讓我找到」。
 */
export function useCheckInReminder(): {
  kind: CheckInReminderKind | null;
  facts: CheckInReminderFacts | null;
  minutesOfDay: number | null;
  dismissed: boolean;
  dismiss: () => void;
} {
  const facts = useContext(FactsContext);
  const minute = useSyncExternalStore(subscribeClock, clockSnapshot, () => null);
  const dismissedValue = useSyncExternalStore(
    subscribeDismissed,
    readDismissed,
    () => null,
  );

  const minutesOfDay = minute === null ? null : taipeiMinutesOfDay(minute * 60_000);
  const kind =
    facts && minutesOfDay !== null
      ? checkInReminderKind(facts, minutesOfDay)
      : null;

  const dismiss = useCallback(() => {
    if (!facts || !kind) return;
    try {
      localStorage.setItem(DISMISS_KEY, `${facts.todayStr}:${kind}`);
    } catch {
      /* 存不進去就算了，等這次重新整理再說。 */
    }
    window.dispatchEvent(new CustomEvent(DISMISS_EVENT));
  }, [facts, kind]);

  return {
    kind,
    facts,
    minutesOfDay,
    dismissed: !!facts && !!kind && dismissedValue === `${facts.todayStr}:${kind}`,
    dismiss,
  };
}

/** 側欄「打卡 / 出勤」旁的小圓點：安靜提示「今天這件事還沒做」。 */
export function CheckInReminderDot({ className }: { className?: string }) {
  const { kind } = useCheckInReminder();
  if (!kind) return null;
  return (
    <span
      title={kind === "in" ? "今天還沒打上班卡" : "今天還沒打下班卡"}
      className={cn("ml-auto h-2 w-2 shrink-0 rounded-full bg-amber-500", className)}
    />
  );
}

/** 內容區最上方的細提示條（/checkin 頁不顯示——那裡本來就有打卡卡片）。 */
export function CheckInReminderBar() {
  const { kind, facts, minutesOfDay, dismissed, dismiss } = useCheckInReminder();
  const pathname = usePathname();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);

  if (!kind || !facts || dismissed || done) return null;
  if (pathname === "/checkin") return null;

  const isIn = kind === "in";
  const now = minutesOfDay === null ? null : formatClock(minutesOfDay);

  // 收 kind 當參數（而非閉包捕捉）——上面已 early return，呼叫端傳進來的一定有值。
  function doPunch(k: CheckInReminderKind) {
    start(async () => {
      try {
        const coords = await getCoords();
        const res = await punch({
          kind: k,
          lat: coords?.lat ?? null,
          lng: coords?.lng ?? null,
        });
        if (!res.ok) {
          // 不在公司網路 / 定位範圍時最常見——直接給下一步，不要只丟一句錯誤。
          toast.error(res.error, {
            action: { label: "去補打卡", onClick: () => router.push("/checkin") },
          });
          return;
        }
        toast.success(isIn ? "已完成上班打卡" : "已完成下班打卡");
        setDone(true); // 先收起提示條，不必等 refresh 回來才有反應
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "打卡失敗");
      }
    });
  }

  return (
    <div className="no-print animate-in fade-in slide-in-from-top-1 border-b border-amber-300/60 bg-amber-50 duration-300 dark:border-amber-500/25 dark:bg-amber-950/40">
      <div className="mx-auto flex max-w-[90rem] items-center gap-2.5 px-4 py-2 sm:px-6 lg:px-8">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300">
          <Fingerprint className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-sm font-medium text-amber-900 dark:text-amber-100">
            {isIn ? "今天還沒打上班卡" : "今天還沒打下班卡"}
          </div>
          <div className="hidden truncate text-xs text-amber-800/75 sm:block dark:text-amber-200/70">
            {isIn
              ? `現在 ${now} · 人不在公司也沒關係，可以改到「打卡 / 請假 / 出差」申請補打卡`
              : `上班卡 ${facts.inAtLabel ?? "—"} · 現在 ${now}，離開前記得打一下`}
          </div>
        </div>
        <Button
          size="sm"
          className="shrink-0 bg-amber-600 text-white hover:bg-amber-600/85"
          disabled={pending}
          onClick={() => doPunch(kind)}
        >
          {isIn ? <LogIn /> : <LogOut />}
          {pending ? "打卡中…" : isIn ? "打上班卡" : "打下班卡"}
        </Button>
        <button
          type="button"
          onClick={dismiss}
          title="今天不再提醒（明天照常）"
          className="shrink-0 rounded-md p-1.5 text-amber-800/60 transition-colors hover:bg-amber-500/10 hover:text-amber-900 dark:text-amber-200/60 dark:hover:text-amber-100"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">今天不再提醒</span>
        </button>
      </div>
    </div>
  );
}
