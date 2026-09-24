"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ProjectStatus } from "@prisma/client";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";

/** 時程藍圖可勾選的專案狀態（依序顯示）。 */
const OPTIONS: { value: ProjectStatus; label: string }[] = [
  { value: "ACTIVE", label: "進行中" },
  { value: "COMPLETED", label: "已完成" },
  { value: "CANCELLED", label: "已取消" },
];
const DEFAULT: ProjectStatus[] = ["ACTIVE"];

/** ?status=ACTIVE,COMPLETED → 狀態清單；沒帶或全無效時用預設（只看進行中）。 */
export function parseTimelineStatuses(raw: string | undefined): ProjectStatus[] {
  if (raw === undefined) return DEFAULT;
  const valid = new Set(OPTIONS.map((o) => o.value));
  return raw.split(",").filter((s): s is ProjectStatus => valid.has(s as ProjectStatus));
}

/**
 * 時程藍圖 / 週報的篩選列：勾選要帶入的專案狀態，以及是否帶入所有已完成的里程碑。
 * 狀態記在網址（?status=、?done=0），重新整理 / 分享連結都保留。
 */
export function TimelineFilters({
  statuses,
  includeDone,
  className,
}: {
  statuses: ProjectStatus[];
  includeDone: boolean;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, start] = useTransition();

  function go(mutate: (p: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams.toString());
    mutate(params);
    const qs = params.toString();
    start(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }

  function toggleStatus(v: ProjectStatus) {
    const next = statuses.includes(v) ? statuses.filter((s) => s !== v) : [...statuses, v];
    const ordered = OPTIONS.map((o) => o.value).filter((s) => next.includes(s));
    go((p) => {
      const isDefault =
        ordered.length === DEFAULT.length && ordered.every((s) => DEFAULT.includes(s));
      if (isDefault) p.delete("status");
      else p.set("status", ordered.join(","));
    });
  }

  return (
    <div
      className={cn(
        "bg-muted/40 mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border p-2",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-muted-foreground px-1 text-xs">專案狀態</span>
        {OPTIONS.map((o) => {
          const on = statuses.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={on}
              disabled={pending}
              onClick={() => toggleStatus(o.value)}
              className={cn(
                "inline-flex h-8 items-center gap-1 rounded-lg border px-2.5 text-sm transition-colors",
                on
                  ? "border-primary bg-primary/10 text-foreground"
                  : "bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              {on && <Check className="h-3.5 w-3.5" />}
              {o.label}
            </button>
          );
        })}
      </div>
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <Switch
          checked={includeDone}
          disabled={pending}
          onCheckedChange={(v) =>
            go((p) => {
              if (v) p.delete("done");
              else p.set("done", "0");
            })
          }
        />
        帶入所有已完成里程碑
      </label>
      {pending && <Loader2 className="text-muted-foreground h-4 w-4 animate-spin" />}
    </div>
  );
}
