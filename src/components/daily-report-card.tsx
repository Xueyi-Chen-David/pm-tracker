"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format } from "date-fns";
import { SmilePlus } from "lucide-react";
import {
  addDailyReportComment,
  toggleDailyReportReaction,
} from "@/server/actions/daily";
import { MemberName } from "@/components/member-name";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { fmtQty, REACTION_EMOJIS } from "@/lib/daily";
import { primaryName, type NameSource } from "@/lib/display";
import { cn } from "@/lib/utils";

const WEEKDAY = ["日", "一", "二", "三", "四", "五", "六"];

/** 報告日標籤，如「7/13（一）」。以 UTC 讀取（對應 @db.Date，避免時區位移）。 */
function dateWithWeekday(date: string | Date): string {
  const d = new Date(date);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}（${WEEKDAY[d.getUTCDay()]}）`;
}

type Comment = {
  id: string;
  body: string;
  createdAt: string | Date;
  author: NameSource;
};

type Reaction = {
  id: string;
  emoji: string;
  userId: string;
  user: NameSource | null;
};

type Item = {
  id: string;
  title: string;
  actual: number;
};

export type DailyReportCardData = {
  id: string;
  date: string | Date;
  note: string | null;
  user: NameSource;
  items: Item[];
  comments: Comment[];
  reactions: Reaction[];
};

export function DailyReportCard({
  report,
  canComment,
  canReact = canComment,
  currentUserId,
  showAuthor = true,
}: {
  report: DailyReportCardData;
  canComment: boolean;
  /** 是否可以按 / 取消表情回應（預設跟隨 canComment）。false＝只顯示不可互動。 */
  canReact?: boolean;
  /** 目前登入者 id，用來標示哪些回應是自己按的。 */
  currentUserId: string;
  showAuthor?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [body, setBody] = useState("");

  // 表情回應：樂觀更新，送出後 router.refresh() 由伺服器實際狀態對齊。
  const [reactions, applyOptimistic] = useOptimistic(
    report.reactions,
    (state: Reaction[], emoji: string) => {
      const mine = state.find(
        (r) => r.userId === currentUserId && r.emoji === emoji,
      );
      if (mine) return state.filter((r) => r !== mine);
      return [
        ...state,
        { id: `optimistic-${emoji}`, emoji, userId: currentUserId, user: null },
      ];
    },
  );

  // 依白名單順序聚合：每個 emoji 一組（含按的人與是否包含自己）。
  const groups = REACTION_EMOJIS.map((emoji) => {
    const rs = reactions.filter((r) => r.emoji === emoji);
    return {
      emoji,
      count: rs.length,
      mine: rs.some((r) => r.userId === currentUserId),
      names: rs
        .map((r) => (r.userId === currentUserId ? "你" : primaryName(r.user)))
        .join("、"),
    };
  }).filter((g) => g.count > 0);

  function submit() {
    const text = body.trim();
    if (!text) return;
    start(async () => {
      try {
        const res = await addDailyReportComment({ reportId: report.id, body: text });
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        setBody("");
        toast.success("已送出回饋");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "留言失敗");
      }
    });
  }

  function toggleReaction(emoji: string) {
    if (!canReact) return;
    start(async () => {
      applyOptimistic(emoji);
      try {
        const res = await toggleDailyReportReaction({ reportId: report.id, emoji });
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "回應失敗");
      }
    });
  }

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center gap-2">
        {showAuthor && (
          <MemberName u={report.user} className="text-sm font-medium" />
        )}
        <span className="text-muted-foreground text-xs">
          {dateWithWeekday(report.date)}
        </span>
        {report.items.length > 0 && (
          <span className="text-muted-foreground ml-auto text-xs tabular-nums">
            {report.items.length} 項任務
          </span>
        )}
      </div>

      {report.items.length > 0 && (
        <div className="divide-y rounded-md border">
          {report.items.map((it) => (
            <div
              key={it.id}
              className="flex items-center gap-2 px-2.5 py-1.5 text-sm"
            >
              <span className="min-w-0 flex-1 truncate">{it.title}</span>
              <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                完成 {fmtQty(it.actual)}
              </span>
            </div>
          ))}
        </div>
      )}

      {report.note ? (
        <p className="text-sm whitespace-pre-wrap">{report.note}</p>
      ) : (
        report.items.length === 0 && (
          <p className="text-muted-foreground text-sm italic">（無內容）</p>
        )
      )}

      {/* 表情回應：既有回應（可點選切換）＋ 加入回應按鈕。 */}
      {(groups.length > 0 || canReact) && (
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          {groups.map((g) => (
            <button
              key={g.emoji}
              type="button"
              disabled={!canReact || pending}
              onClick={() => toggleReaction(g.emoji)}
              title={g.names}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs tabular-nums transition-colors",
                g.mine
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "bg-muted/40 text-foreground",
                canReact && !pending
                  ? "hover:bg-muted cursor-pointer"
                  : "cursor-default",
              )}
            >
              <span className="text-sm leading-none">{g.emoji}</span>
              <span>{g.count}</span>
            </button>
          ))}

          {canReact && (
            <Popover>
              <PopoverTrigger
                disabled={pending}
                title="加入表情回應"
                className="text-muted-foreground hover:bg-muted hover:text-foreground inline-flex h-6 w-6 items-center justify-center rounded-full border transition-colors disabled:opacity-50"
              >
                <SmilePlus className="h-3.5 w-3.5" />
              </PopoverTrigger>
              <PopoverContent
                align="start"
                className="w-auto flex-row gap-1 p-1.5"
              >
                {REACTION_EMOJIS.map((emoji) => {
                  const mine = reactions.some(
                    (r) => r.userId === currentUserId && r.emoji === emoji,
                  );
                  return (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => toggleReaction(emoji)}
                      className={cn(
                        "hover:bg-muted flex h-8 w-8 items-center justify-center rounded-md text-lg transition-colors",
                        mine && "bg-primary/10 ring-primary/40 ring-1",
                      )}
                    >
                      {emoji}
                    </button>
                  );
                })}
              </PopoverContent>
            </Popover>
          )}
        </div>
      )}

      {report.comments.length > 0 && (
        <div className="space-y-1.5 border-t pt-2">
          {report.comments.map((c) => (
            <div key={c.id} className="text-sm">
              <span className="text-muted-foreground text-xs">
                <MemberName u={c.author} className="font-medium" />
                {" · "}
                {format(new Date(c.createdAt), "M/d HH:mm")}
              </span>
              <p className="whitespace-pre-wrap">{c.body}</p>
            </div>
          ))}
        </div>
      )}

      {canComment && (
        <div className="flex items-center gap-2 pt-1">
          <input
            value={body}
            onChange={(e) => setBody(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="回饋 / 留言…"
            className="border-input bg-background focus-visible:ring-ring h-8 flex-1 rounded-md border px-2.5 text-sm focus-visible:ring-2 focus-visible:outline-none"
          />
          <Button size="sm" onClick={submit} disabled={pending || !body.trim()}>
            送出
          </Button>
        </div>
      )}
    </div>
  );
}
