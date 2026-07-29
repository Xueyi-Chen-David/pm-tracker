"use client";

import { useState } from "react";
import { Plus, Pencil, CalendarDays, Link2, List, Waypoints } from "lucide-react";
import { CrmEventDialog } from "@/components/crm/event-dialog";
import { EventsTimeline } from "@/components/crm/events-timeline";
import { fmtDate } from "@/lib/date";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { EventView, ContactLite } from "@/components/crm/types";

/** CRM 活動紀錄：「列表」（原本的逐筆卡片）與「時間軸」（橫向視覺化）兩種檢視切換。 */
export function EventsSection({
  events,
  contacts,
}: {
  events: EventView[];
  contacts: ContactLite[];
}) {
  const [view, setView] = useState<"list" | "timeline">("list");

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="bg-muted inline-flex items-center gap-0.5 rounded-md p-0.5">
          <ViewButton active={view === "list"} onClick={() => setView("list")}>
            <List className="h-3.5 w-3.5" /> 列表
          </ViewButton>
          <ViewButton
            active={view === "timeline"}
            onClick={() => setView("timeline")}
          >
            <Waypoints className="h-3.5 w-3.5" /> 時間軸
          </ViewButton>
        </div>
        <CrmEventDialog
          contacts={contacts}
          trigger={
            <Button className="gap-1.5">
              <Plus className="h-4 w-4" /> 新增活動
            </Button>
          }
        />
      </div>

      {view === "timeline" ? (
        <EventsTimeline events={events} contacts={contacts} />
      ) : (
        <EventsListView events={events} contacts={contacts} />
      )}
    </div>
  );
}

function ViewButton({
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
        "inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors",
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

/** 原本的逐筆卡片列表（類似會議記錄）。 */
function EventsListView({
  events,
  contacts,
}: {
  events: EventView[];
  contacts: ContactLite[];
}) {
  if (events.length === 0) {
    return (
      <div className="text-muted-foreground rounded-xl border border-dashed py-16 text-center">
        還沒有任何活動紀錄。點右上「新增活動」開始記錄拜訪 / 電話 / 活動。
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {events.map((e) => (
        <div key={e.id} className="bg-card rounded-xl border p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className="bg-muted rounded-full px-2 py-0.5 text-xs font-medium">
                  {e.type}
                </span>
                <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
                  <CalendarDays className="h-3.5 w-3.5" />
                  {fmtDate(e.date)}
                </span>
                {e.contact && (
                  <span className="bg-primary/10 text-primary max-w-[16rem] truncate rounded-full px-2 py-0.5 text-xs font-medium">
                    {e.contact.company || e.contact.name}
                  </span>
                )}
              </div>
              <h3 className="font-semibold break-words">{e.title}</h3>
              {e.link &&
                (safeLink(e.link) ? (
                  <a
                    href={safeLink(e.link)!}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={e.link}
                    className="text-primary mt-1 flex max-w-full items-center gap-1 text-xs hover:underline"
                  >
                    <Link2 className="h-3.5 w-3.5 shrink-0" />
                    <span className="max-w-[20rem] min-w-0 truncate">
                      {shortLink(e.link)}
                    </span>
                  </a>
                ) : (
                  <div className="text-muted-foreground mt-1 flex max-w-full items-center gap-1 text-xs">
                    <Link2 className="h-3.5 w-3.5 shrink-0" />
                    <span className="max-w-[20rem] min-w-0 truncate">
                      {e.link}
                    </span>
                  </div>
                ))}
            </div>
            <CrmEventDialog
              event={e}
              contacts={contacts}
              trigger={
                <Button variant="ghost" size="icon-sm" title="編輯">
                  <Pencil className="h-4 w-4" />
                </Button>
              }
            />
          </div>
          {e.notes && (
            <div className="mt-2 border-t pt-2 text-sm break-words whitespace-pre-wrap">
              {e.notes}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/** 可點的安全連結：有 http(s) 直接用；像網域就補 https；否則回 null。 */
function safeLink(url: string): string | null {
  const u = url.trim();
  if (/^https?:\/\//i.test(u)) return u;
  if (/^[\w-]+(\.[\w-]+)+/.test(u)) return `https://${u}`;
  return null;
}

/** 精簡顯示（去 https:// 與 www.）。 */
function shortLink(url: string): string {
  return url.trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "");
}
