"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Sparkles, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtDate } from "@/lib/date";
import {
  RELEASES,
  TAG_META,
  WHATS_NEW_SEEN_KEY,
  WHATS_NEW_OPEN_EVENT,
  WHATS_NEW_SEEN_EVENT,
  latestReleaseDate,
  releasesSince,
  type WhatsNewRelease,
} from "@/lib/whats-new";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

// localStorage / 事件皆為瀏覽器 API，SSR 時不存在 → 一律在 client 端操作。
function readSeen(): string | null {
  try {
    return localStorage.getItem(WHATS_NEW_SEEN_KEY);
  } catch {
    return null;
  }
}

function writeSeen(date: string) {
  try {
    localStorage.setItem(WHATS_NEW_SEEN_KEY, date);
  } catch {
    /* 隱私模式 / 停用儲存時忽略 —— 頂多下次再彈一次，不影響功能。 */
  }
}

/** 目前是否有「尚未看過」的更新(首次造訪不算，避免倒整份歷史)。 */
function computeHasUnseen(): boolean {
  const latest = latestReleaseDate();
  if (!latest) return false;
  const seen = readSeen();
  if (seen === null) return false; // 首次造訪：由 WhatsNew 靜默初始化，不顯示紅點。
  return seen < latest;
}

// 給 useSyncExternalStore 訂閱已讀狀態變化(同分頁事件 + 跨分頁 storage 事件)。
function subscribeSeen(onChange: () => void) {
  window.addEventListener(WHATS_NEW_SEEN_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(WHATS_NEW_SEEN_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/**
 * 更新彈窗本體 —— 在 (app)/layout 掛載「一次」。
 * 使用者下次開網頁時，若有比上次更新的 release 就自動彈出。
 */
export function WhatsNew() {
  const [open, setOpen] = useState(false);
  const [releases, setReleases] = useState<WhatsNewRelease[]>([]);
  const [mode, setMode] = useState<"auto" | "manual">("auto");

  // 唯一的開窗入口(自動與手動都走這)：setState 發生在事件回呼裡，
  // 而非 effect 同步呼叫 —— 符合 react-hooks/set-state-in-effect 規則。
  useEffect(() => {
    function openWith(auto: boolean) {
      if (auto) {
        const unseen = releasesSince(readSeen());
        if (unseen.length === 0) return; // 期間已被別的分頁標記已讀 → 不彈。
        setReleases(unseen);
        setMode("auto");
      } else {
        setReleases(RELEASES);
        setMode("manual");
      }
      setOpen(true);
    }
    const onOpen = (e: Event) =>
      openWith((e as CustomEvent<{ auto?: boolean }>).detail?.auto === true);
    window.addEventListener(WHATS_NEW_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(WHATS_NEW_OPEN_EVENT, onOpen);
  }, []);

  // 掛載時決定要不要自動彈：只發事件 / 寫 localStorage，不直接 setState。
  useEffect(() => {
    const latest = latestReleaseDate();
    if (!latest) return;

    const seen = readSeen();
    if (seen === null) {
      // 首次造訪：把 lastSeen 初始化到最新，這次不打擾；下一筆 release 才會彈。
      writeSeen(latest);
      window.dispatchEvent(new CustomEvent(WHATS_NEW_SEEN_EVENT));
      return;
    }

    if (releasesSince(seen).length > 0) {
      window.dispatchEvent(
        new CustomEvent(WHATS_NEW_OPEN_EVENT, { detail: { auto: true } }),
      );
    }
  }, []);

  const handleOpenChange = useCallback((next: boolean) => {
    if (!next) {
      // 一關閉就標記已讀(紅點消失、下次不再自動彈)。
      const latest = latestReleaseDate();
      if (latest) writeSeen(latest);
      window.dispatchEvent(new CustomEvent(WHATS_NEW_SEEN_EVENT));
    }
    setOpen(next);
  }, []);

  const totalItems = releases.reduce((n, r) => n + r.items.length, 0);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <span className="bg-primary/10 text-primary flex h-7 w-7 items-center justify-center rounded-lg">
              <Sparkles className="h-4 w-4" />
            </span>
            有什麼新功能
          </DialogTitle>
          <DialogDescription>
            {mode === "auto"
              ? `距離上次以來，Project Pulse 更新了 ${totalItems} 項功能。`
              : "以下是 Project Pulse 最近的更新紀錄。"}
          </DialogDescription>
        </DialogHeader>

        <div className="scroll-y -mx-1 max-h-[58vh] space-y-6 overflow-y-auto px-1">
          {releases.map((release) => (
            <section key={release.date}>
              <div className="mb-2 flex items-baseline gap-2">
                <time className="text-sm font-semibold">
                  {fmtDate(release.date)}
                </time>
                {release.title && (
                  <span className="text-muted-foreground text-xs">
                    · {release.title}
                  </span>
                )}
              </div>
              <ul className="space-y-3">
                {release.items.map((item, idx) => {
                  const meta = TAG_META[item.tag];
                  return (
                    <li key={idx} className="flex gap-2.5">
                      <span
                        className={cn(
                          "mt-0.5 inline-flex h-5 shrink-0 items-center rounded-full border px-2 text-[11px] font-medium",
                          meta.className,
                        )}
                      >
                        {meta.label}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium">{item.title}</div>
                        {item.detail && (
                          <p className="text-muted-foreground mt-0.5 text-sm leading-relaxed">
                            {item.detail}
                          </p>
                        )}
                        {item.href && (
                          <Link
                            href={item.href}
                            onClick={() => handleOpenChange(false)}
                            className="text-primary mt-1 inline-flex items-center gap-1 text-sm font-medium hover:underline"
                          >
                            前往試試 <ArrowRight className="h-3.5 w-3.5" />
                          </Link>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>

        <DialogFooter>
          <Button onClick={() => handleOpenChange(false)}>知道了</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * 側欄的「更新」按鈕 —— 有未讀時顯示紅點，點擊打開更新紀錄。
 * 只發事件、讀 localStorage，可安全重複掛載(桌機側欄 + 手機頂列各一顆)。
 */
export function WhatsNewTrigger({ className }: { className?: string }) {
  // 用 useSyncExternalStore 讀外部狀態(localStorage)：SSR 回傳 false，
  // 避免 hydration 不一致，也不需在 effect 內同步 setState。
  const hasUnseen = useSyncExternalStore(
    subscribeSeen,
    computeHasUnseen,
    () => false,
  );

  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent(WHATS_NEW_OPEN_EVENT))}
      title="有什麼新功能"
      className={cn(
        "hover:bg-muted relative inline-flex h-8 w-8 items-center justify-center rounded-md",
        className,
      )}
    >
      <Sparkles className="h-4.5 w-4.5" />
      {hasUnseen && (
        <span className="ring-card absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-rose-500 ring-2" />
      )}
      <span className="sr-only">有什麼新功能</span>
    </button>
  );
}
