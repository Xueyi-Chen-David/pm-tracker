"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format } from "date-fns";
import { addDailyReportComment } from "@/server/actions/daily";
import { MemberName } from "@/components/member-name";
import { Button } from "@/components/ui/button";
import { fmtQty } from "@/lib/daily";
import type { NameSource } from "@/lib/display";

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
};

export function DailyReportCard({
  report,
  canComment,
  showAuthor = true,
}: {
  report: DailyReportCardData;
  canComment: boolean;
  showAuthor?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [body, setBody] = useState("");

  function submit() {
    const text = body.trim();
    if (!text) return;
    start(async () => {
      try {
        await addDailyReportComment({ reportId: report.id, body: text });
        setBody("");
        toast.success("已送出回饋");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "留言失敗");
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
