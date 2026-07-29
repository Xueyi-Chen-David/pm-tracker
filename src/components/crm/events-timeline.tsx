"use client";

import { format, parseISO } from "date-fns";
import { ArrowDown, ArrowUp } from "lucide-react";
import { CrmEventDialog } from "@/components/crm/event-dialog";
import { CRM_EVENT_ICON } from "@/lib/crm";
import type { EventView, ContactLite } from "@/components/crm/types";

/**
 * 活動的視覺化時間軸：一條橫向主軸，紀錄依時間順序左到右排開，卡片交錯
 * 顯示在主軸上／下方（各接一段箭頭連到主軸上的點），方便一眼掃過整段
 * 歷史，而不是一列一列往下讀的列表。點卡片＝開啟既有的編輯視窗。
 */
export function EventsTimeline({
  events,
  contacts,
}: {
  events: EventView[];
  contacts: ContactLite[];
}) {
  const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date));

  if (sorted.length === 0) {
    return (
      <div className="text-muted-foreground rounded-xl border border-dashed py-16 text-center">
        還沒有任何活動紀錄。點右上「新增活動」開始記錄拜訪 / 電話 / 活動。
      </div>
    );
  }

  return (
    <div className="bg-card overflow-x-auto rounded-xl border p-4">
      <div className="relative flex h-56 min-w-max items-stretch px-6">
        {/* 主軸：貫穿所有項目中點的橫線 */}
        <div className="bg-border pointer-events-none absolute inset-x-6 top-1/2 h-px" />
        {sorted.map((e, i) => {
          const above = i % 2 === 0;
          return (
            <CrmEventDialog
              key={e.id}
              event={e}
              contacts={contacts}
              trigger={
                <button
                  type="button"
                  className="group flex h-full w-40 shrink-0 flex-col items-center px-2 text-left"
                >
                  <div className="flex h-1/2 w-full flex-col items-center justify-end gap-1 pb-1">
                    {above && <TimelineCard e={e} />}
                    {above && (
                      <ArrowDown className="text-muted-foreground/50 h-3 w-3 shrink-0" />
                    )}
                  </div>
                  <span className="ring-background relative z-10 h-3 w-3 shrink-0 rounded-full bg-sky-500 ring-4" />
                  <div className="flex h-1/2 w-full flex-col items-center justify-start gap-1 pt-1">
                    {!above && (
                      <ArrowUp className="text-muted-foreground/50 h-3 w-3 shrink-0" />
                    )}
                    {!above && <TimelineCard e={e} />}
                  </div>
                </button>
              }
            />
          );
        })}
      </div>
    </div>
  );
}

function TimelineCard({ e }: { e: EventView }) {
  return (
    <div className="bg-card group-hover:border-primary/50 w-40 rounded-lg border p-2 shadow-sm transition-colors">
      <div className="flex items-center gap-1 text-[11px]">
        <span>{CRM_EVENT_ICON[e.type] ?? "📌"}</span>
        <span className="text-muted-foreground">
          {format(parseISO(e.date), "M/d")}
        </span>
      </div>
      <div className="mt-0.5 line-clamp-2 text-xs font-medium break-words">
        {e.title}
      </div>
      {e.contact && (
        <div className="text-muted-foreground mt-0.5 truncate text-[10px]">
          {e.contact.company || e.contact.name}
        </div>
      )}
    </div>
  );
}
