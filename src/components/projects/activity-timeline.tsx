"use client";

import { useState } from "react";
import { History } from "lucide-react";
import type { ActivityKind } from "@prisma/client";
import { ACTIVITY_KIND } from "@/lib/constants";
import { fmtDateTime } from "@/lib/date";
import { cn } from "@/lib/utils";
import { RelativeTime } from "@/components/relative-time";

export type ActivityItem = {
  id: string;
  kind: ActivityKind;
  message: string;
  createdAt: string;
  userName: string | null;
};

/**
 * 專案「軌跡」時間軸：把 Activity 操作紀錄由新到舊排成一條直軸。
 * 使用者的核心需求是「狀態何時切換成某狀態」——故預設可一鍵切到「只看狀態」，
 * 狀態變更（含建立）用藍/紫色圓點凸顯，並同時顯示絕對時間與相對時間。
 */
export function ActivityTimeline({ items }: { items: ActivityItem[] }) {
  const [onlyStatus, setOnlyStatus] = useState(false);
  const statusCount = items.filter(
    (i) => i.kind === "STATUS" || i.kind === "CREATE",
  ).length;

  const shown = onlyStatus
    ? items.filter((i) => i.kind === "STATUS" || i.kind === "CREATE")
    : items;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-muted-foreground text-xs">
          由新到舊；每筆記錄變更當下的時間與操作者。
        </p>
        <div className="bg-muted inline-flex shrink-0 rounded-lg p-0.5 text-xs font-medium">
          {[
            { key: false as const, label: "全部" },
            { key: true as const, label: "只看狀態" },
          ].map((opt) => (
            <button
              key={String(opt.key)}
              type="button"
              onClick={() => setOnlyStatus(opt.key)}
              className={cn(
                "rounded-md px-2.5 py-1 transition-colors",
                onlyStatus === opt.key
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {opt.label}
              {opt.key && statusCount > 0 && (
                <span className="ml-1 opacity-70">{statusCount}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="text-muted-foreground flex flex-col items-center gap-2 py-10 text-sm">
          <History className="h-5 w-5 opacity-60" />
          {onlyStatus ? "尚無狀態變更紀錄。" : "尚無操作紀錄。"}
        </div>
      ) : (
        <ol className="relative space-y-4">
          {/* 貫穿的軸線 */}
          <span
            aria-hidden
            className="bg-border absolute top-1 bottom-1 left-[5px] w-px"
          />
          {shown.map((a) => {
            const meta = ACTIVITY_KIND[a.kind];
            const isStatus = a.kind === "STATUS" || a.kind === "CREATE";
            return (
              <li key={a.id} className="relative flex gap-3 pl-1">
                <span
                  className={cn(
                    "relative z-10 mt-1 h-2.5 w-2.5 shrink-0 rounded-full ring-4",
                    meta.dot,
                    isStatus ? "ring-card" : "ring-card opacity-70",
                  )}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-snug">
                    <span
                      className={cn(
                        "font-medium",
                        isStatus ? "text-foreground" : "text-foreground/90",
                      )}
                    >
                      {a.message}
                    </span>
                    {a.userName && (
                      <span className="text-muted-foreground">
                        {" · "}
                        {a.userName}
                      </span>
                    )}
                  </p>
                  <p className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px]">
                    <span className={cn("font-medium", meta.text)}>
                      {meta.label}
                    </span>
                    <span aria-hidden>·</span>
                    <span>{fmtDateTime(a.createdAt)}</span>
                    <RelativeTime iso={a.createdAt} prefix="（" suffix="）" />
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
