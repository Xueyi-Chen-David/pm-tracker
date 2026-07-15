"use client";

import Link from "next/link";
import { Users2, Check } from "lucide-react";
import {
  DailyReportCard,
  type DailyReportCardData,
} from "@/components/daily-report-card";
import { MemberName } from "@/components/member-name";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { displayInitial, primaryName, type NameSource } from "@/lib/display";
import { cn } from "@/lib/utils";

const WEEKDAY = ["日", "一", "二", "三", "四", "五", "六"];

export type BoardMember = NameSource & {
  id: string; // userId
  membershipId: string;
  image: string | null;
};

export type BoardDay = {
  key: string; // yyyy-mm-dd
  label: string; // M/D
  weekday: number; // 0=Sun
  weekend: boolean;
  isToday: boolean;
};

export type BoardReport = DailyReportCardData & {
  score: number;
  userId: string;
  dateKey: string;
};

/** 有量化項目的日報：依完成度 0–100 上色（順利→待加強）。 */
function scoreClasses(score: number): string {
  if (score >= 80) return "bg-emerald-500 text-white";
  if (score >= 60) return "bg-emerald-300 text-emerald-950";
  if (score >= 40) return "bg-amber-300 text-amber-950";
  if (score >= 20) return "bg-orange-300 text-orange-950";
  return "bg-rose-300 text-rose-950";
}

export function TeamPulseBoard({
  days,
  members,
  reports,
  currentUserId,
  canComment,
  header,
}: {
  days: BoardDay[];
  members: BoardMember[];
  reports: BoardReport[];
  currentUserId: string;
  /** 是否可對這些日報留言 / 回應（主管檢視下屬時為 true）。 */
  canComment: boolean;
  /** 標題列右側附加內容（如可見性設定）。 */
  header?: React.ReactNode;
}) {
  const byKey = new Map<string, BoardReport>();
  for (const r of reports) byKey.set(`${r.userId}|${r.dateKey}`, r);

  const todayKey = days.find((d) => d.isToday)?.key;
  const todayReports = todayKey
    ? members
        .map((m) => byKey.get(`${m.id}|${todayKey}`))
        .filter((r): r is BoardReport => Boolean(r))
    : [];
  const notSubmitted = todayKey
    ? members.filter((m) => !byKey.get(`${m.id}|${todayKey}`))
    : [];
  const scoredToday = todayReports.filter((r) => r.items.length > 0);
  const avgToday = scoredToday.length
    ? Math.round(
        scoredToday.reduce((s, r) => s + r.score, 0) / scoredToday.length,
      )
    : null;

  return (
    <section className="bg-card overflow-hidden rounded-xl border shadow-sm">
      {/* 標題 + 今日概況 */}
      <div className="space-y-2.5 border-b p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="flex items-center gap-1.5 text-base font-semibold">
            <Users2 className="h-4 w-4" /> 團隊日報脈動
          </h2>
          <span className="text-muted-foreground text-xs">
            {members.length} 位成員 · 近 {days.length} 天
          </span>
          {header && <div className="ml-auto">{header}</div>}
        </div>
        {todayKey && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="inline-flex items-center gap-1.5">
              <span className="text-muted-foreground">今日</span>
              <span className="font-semibold tabular-nums">
                {todayReports.length}/{members.length}
              </span>
              <span className="text-muted-foreground">已填</span>
              {avgToday != null && (
                <span className="text-muted-foreground">
                  · 平均{" "}
                  <span
                    className={cn(
                      "rounded px-1 font-semibold tabular-nums",
                      scoreClasses(avgToday),
                    )}
                  >
                    {avgToday}
                  </span>
                </span>
              )}
            </span>
            {notSubmitted.length > 0 && (
              <span className="text-muted-foreground min-w-0 truncate text-xs">
                未填：{notSubmitted.map((m) => primaryName(m)).join("、")}
              </span>
            )}
          </div>
        )}
      </div>

      {/* 熱區：成員 × 天 */}
      <div className="scroll-y overflow-x-auto">
        <table className="border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className="bg-card sticky left-0 z-20 min-w-36 border-b border-r px-3 py-2 text-left text-xs font-medium">
                成員
              </th>
              {days.map((d) => (
                <th
                  key={d.key}
                  className={cn(
                    "w-9 border-b px-0 py-1 text-center font-normal",
                    d.weekend && "bg-muted/40",
                    d.isToday && "bg-primary/10",
                  )}
                >
                  <div className="text-[10px] leading-none tabular-nums">
                    {d.label}
                  </div>
                  <div
                    className={cn(
                      "text-muted-foreground text-[10px] leading-tight",
                      d.isToday && "text-primary font-semibold",
                    )}
                  >
                    {WEEKDAY[d.weekday]}
                  </div>
                </th>
              ))}
              <th className="border-b border-l px-2 py-2 text-center text-xs font-medium">
                平均
              </th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const scored = days
                .map((d) => byKey.get(`${m.id}|${d.key}`))
                .filter((r): r is BoardReport => Boolean(r && r.items.length));
              const avg = scored.length
                ? Math.round(
                    scored.reduce((s, r) => s + r.score, 0) / scored.length,
                  )
                : null;
              return (
                <tr key={m.membershipId} className="hover:bg-muted/20">
                  <td className="bg-card sticky left-0 z-10 min-w-36 border-b border-r px-3 py-1.5">
                    <Link
                      href={`/me/${m.id}`}
                      className="flex items-center gap-2"
                    >
                      <Avatar className="h-6 w-6 shrink-0">
                        {m.image && <AvatarImage src={m.image} alt="" />}
                        <AvatarFallback className="text-[10px]">
                          {displayInitial(m)}
                        </AvatarFallback>
                      </Avatar>
                      <MemberName u={m} className="min-w-0 truncate text-sm" />
                    </Link>
                  </td>
                  {days.map((d) => (
                    <td
                      key={d.key}
                      className={cn(
                        "border-b p-0.5 text-center",
                        d.weekend && "bg-muted/20",
                        d.isToday && "bg-primary/5",
                      )}
                    >
                      <PulseCell
                        report={byKey.get(`${m.id}|${d.key}`)}
                        day={d}
                        canComment={canComment}
                        currentUserId={currentUserId}
                      />
                    </td>
                  ))}
                  <td className="border-b border-l px-2 text-center">
                    {avg != null ? (
                      <span
                        className={cn(
                          "inline-flex h-6 min-w-8 items-center justify-center rounded px-1 text-xs font-semibold tabular-nums",
                          scoreClasses(avg),
                        )}
                      >
                        {avg}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/40 text-xs">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 圖例 */}
      <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t px-4 py-2.5 text-[11px]">
        <span>完成度：</span>
        {[
          { c: scoreClasses(90), t: "80+ 順利" },
          { c: scoreClasses(70), t: "60–79" },
          { c: scoreClasses(50), t: "40–59" },
          { c: scoreClasses(30), t: "20–39" },
          { c: scoreClasses(10), t: "待加強" },
        ].map((x) => (
          <span key={x.t} className="inline-flex items-center gap-1">
            <span className={cn("h-3.5 w-3.5 rounded-sm", x.c.split(" ")[0])} />
            {x.t}
          </span>
        ))}
        <span className="inline-flex items-center gap-1">
          <span className="flex h-3.5 w-3.5 items-center justify-center rounded-sm bg-sky-100 text-[8px] text-sky-700">
            ✓
          </span>
          已填(無評分)
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-3.5 w-3.5 rounded-sm border border-dashed" />
          未填
        </span>
        <span className="ml-auto">點格子看當日內容並回饋</span>
      </div>
    </section>
  );
}

function PulseCell({
  report,
  day,
  canComment,
  currentUserId,
}: {
  report: BoardReport | undefined;
  day: BoardDay;
  canComment: boolean;
  currentUserId: string;
}) {
  if (!report) {
    // 未填：週末更淡；平日虛線框提示。
    return (
      <div
        title={day.weekend ? `${day.label} 假日` : `${day.label} 未填`}
        className={cn(
          "mx-auto h-7 w-7 rounded-md",
          day.weekend
            ? "bg-muted/30"
            : "border border-dashed border-muted-foreground/25",
        )}
      />
    );
  }
  const hasItems = report.items.length > 0;
  return (
    <Popover>
      <PopoverTrigger
        title={`${day.label} · ${hasItems ? `完成度 ${report.score}` : "已填"}`}
        className={cn(
          "mx-auto flex h-7 w-7 items-center justify-center rounded-md text-xs font-semibold tabular-nums transition-transform hover:scale-110",
          hasItems ? scoreClasses(report.score) : "bg-sky-100 text-sky-700",
        )}
      >
        {hasItems ? (
          report.score
        ) : (
          <Check className="h-3.5 w-3.5" />
        )}
      </PopoverTrigger>
      <PopoverContent align="center" className="w-80 p-2">
        <DailyReportCard
          report={report}
          canComment={canComment}
          currentUserId={currentUserId}
          showAuthor
        />
      </PopoverContent>
    </Popover>
  );
}
