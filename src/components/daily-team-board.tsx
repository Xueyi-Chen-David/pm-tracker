"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Users2,
  Check,
  LayoutGrid,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
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

export type BoardWeek = {
  key: string; // 週一的 yyyy-mm-dd
  label: string; // "M/D–M/D"
  days: BoardDay[]; // 週一→週日
};

export type BoardReport = DailyReportCardData & {
  userId: string;
  dateKey: string;
};

function buildIndex(reports: BoardReport[]) {
  const byKey = new Map<string, BoardReport>();
  for (const r of reports) byKey.set(`${r.userId}|${r.dateKey}`, r);
  return byKey;
}

/** 成員頭像 + 名稱（表格最左欄，貼齊左側）。 */
function MemberCell({ m }: { m: BoardMember }) {
  return (
    <Link href={`/me/${m.id}`} className="flex items-center gap-2">
      <Avatar className="h-6 w-6 shrink-0">
        {m.image && <AvatarImage src={m.image} alt="" />}
        <AvatarFallback className="text-[10px]">
          {displayInitial(m)}
        </AvatarFallback>
      </Avatar>
      <MemberName u={m} className="min-w-0 truncate text-sm" />
    </Link>
  );
}

function Legend() {
  return (
    <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t px-4 py-2.5 text-[11px]">
      <span className="inline-flex items-center gap-1.5">
        <span className="flex h-4 w-4 items-center justify-center rounded-md bg-emerald-500 text-white">
          <Check className="h-3 w-3" />
        </span>
        已填
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="border-muted-foreground/25 h-4 w-4 rounded-md border border-dashed" />
        未填
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="bg-muted/50 h-4 w-4 rounded-md" />
        週末
      </span>
      <span className="ml-auto">點已填的格子看當日內容並回饋</span>
    </div>
  );
}

// ── 外層：分頁容器 ─────────────────────────────────────────

export function TeamDailyBoard({
  pulseDays,
  weeks,
  members,
  reports,
  currentUserId,
  canComment,
  header,
}: {
  pulseDays: BoardDay[];
  weeks: BoardWeek[];
  members: BoardMember[];
  reports: BoardReport[];
  currentUserId: string;
  /** 是否可對這些日報留言 / 回應（主管檢視下屬時為 true）。 */
  canComment: boolean;
  /** 標題列右側附加內容（如可見性設定）。 */
  header?: React.ReactNode;
}) {
  const [tab, setTab] = useState<"pulse" | "week">("pulse");
  const currentWeek = weeks.findIndex((w) => w.days.some((d) => d.isToday));
  const [wi, setWi] = useState(
    currentWeek >= 0 ? currentWeek : Math.max(0, weeks.length - 1),
  );
  const week = weeks[wi];

  return (
    <section className="bg-card overflow-hidden rounded-xl border shadow-sm">
      {/* 標題 + 分頁切換 */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2 border-b p-4">
        <h2 className="flex items-center gap-1.5 text-base font-semibold">
          <Users2 className="h-4 w-4" /> 團隊日報
        </h2>
        <span className="text-muted-foreground text-xs">
          {members.length} 位成員
        </span>
        <div className="ml-auto flex items-center gap-2">
          {header}
          <div className="bg-muted inline-flex rounded-lg p-0.5 text-sm">
            <button
              type="button"
              onClick={() => setTab("pulse")}
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-2.5 py-1 font-medium transition-colors",
                tab === "pulse"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <LayoutGrid className="h-3.5 w-3.5" /> 脈動
            </button>
            <button
              type="button"
              onClick={() => setTab("week")}
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-2.5 py-1 font-medium transition-colors",
                tab === "week"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <CalendarRange className="h-3.5 w-3.5" /> 一週
            </button>
          </div>
        </div>
      </div>

      {tab === "pulse" ? (
        <PulseView
          pulseDays={pulseDays}
          members={members}
          reports={reports}
          currentUserId={currentUserId}
          canComment={canComment}
        />
      ) : (
        <>
          {/* 週次導覽 */}
          <div className="flex items-center justify-center gap-3 border-b px-4 py-2 text-sm">
            <button
              type="button"
              onClick={() => setWi((i) => Math.max(0, i - 1))}
              disabled={wi <= 0}
              className="hover:bg-muted rounded-md p-1 transition-colors disabled:opacity-30"
              aria-label="上一週"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="font-medium tabular-nums">
              {week?.label}
              {currentWeek === wi && (
                <span className="text-primary ml-1 text-xs">· 本週</span>
              )}
            </span>
            <button
              type="button"
              onClick={() => setWi((i) => Math.min(weeks.length - 1, i + 1))}
              disabled={wi >= weeks.length - 1}
              className="hover:bg-muted rounded-md p-1 transition-colors disabled:opacity-30"
              aria-label="下一週"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          {week && (
            <WeekView
              week={week}
              members={members}
              reports={reports}
              currentUserId={currentUserId}
              canComment={canComment}
            />
          )}
        </>
      )}
    </section>
  );
}

// ── 脈動：成員 × 近 N 天，僅標示是否填寫 ──────────────────────

function PulseView({
  pulseDays,
  members,
  reports,
  currentUserId,
  canComment,
}: {
  pulseDays: BoardDay[];
  members: BoardMember[];
  reports: BoardReport[];
  currentUserId: string;
  canComment: boolean;
}) {
  const byKey = buildIndex(reports);
  const todayKey = pulseDays.find((d) => d.isToday)?.key;
  const submittedToday = todayKey
    ? members.filter((m) => byKey.get(`${m.id}|${todayKey}`)).length
    : 0;
  const notSubmitted = todayKey
    ? members.filter((m) => !byKey.get(`${m.id}|${todayKey}`))
    : [];

  return (
    <>
      {/* 今日填寫概況 */}
      {todayKey && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b px-4 py-2.5 text-sm">
          <span className="inline-flex items-center gap-1.5">
            <span className="text-muted-foreground">今日已填</span>
            <span className="font-semibold tabular-nums">
              {submittedToday}/{members.length}
            </span>
          </span>
          {notSubmitted.length > 0 && (
            <span className="text-muted-foreground min-w-0 truncate text-xs">
              未填：{notSubmitted.map((m) => primaryName(m)).join("、")}
            </span>
          )}
        </div>
      )}

      <div className="scroll-y overflow-x-auto">
        <table className="border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className="bg-card sticky left-0 z-20 min-w-36 border-b border-r px-3 py-2 text-left text-xs font-medium">
                成員
              </th>
              {pulseDays.map((d) => (
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
                填寫
              </th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const filled = pulseDays.filter((d) =>
                byKey.get(`${m.id}|${d.key}`),
              ).length;
              return (
                <tr key={m.membershipId} className="hover:bg-muted/20">
                  <td className="bg-card sticky left-0 z-10 min-w-36 border-b border-r px-3 py-1.5">
                    <MemberCell m={m} />
                  </td>
                  {pulseDays.map((d) => (
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
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {filled}
                      <span className="text-muted-foreground/50">
                        /{pulseDays.length}
                      </span>
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Legend />
    </>
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
    return (
      <div
        title={day.weekend ? `${day.label} 假日` : `${day.label} 未填`}
        className={cn(
          "mx-auto h-7 w-7 rounded-md",
          day.weekend
            ? "bg-muted/30"
            : "border-muted-foreground/25 border border-dashed",
        )}
      />
    );
  }
  return (
    <Popover>
      <PopoverTrigger
        title={`${day.label} 已填`}
        className="mx-auto flex h-7 w-7 items-center justify-center rounded-md bg-emerald-500 text-white transition-transform hover:scale-110"
      >
        <Check className="h-4 w-4" />
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

// ── 一週：成員 × 一週七天，直接看每個人寫了什麼 ────────────────

function WeekView({
  week,
  members,
  reports,
  currentUserId,
  canComment,
}: {
  week: BoardWeek;
  members: BoardMember[];
  reports: BoardReport[];
  currentUserId: string;
  canComment: boolean;
}) {
  const byKey = buildIndex(reports);
  return (
    <>
      <div className="scroll-y overflow-x-auto">
        <table className="border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className="bg-card sticky left-0 z-20 min-w-36 border-b border-r px-3 py-2 text-left text-xs font-medium">
                成員
              </th>
              {week.days.map((d) => (
                <th
                  key={d.key}
                  className={cn(
                    "min-w-36 border-b px-2 py-1.5 text-center font-normal",
                    d.weekend && "bg-muted/40",
                    d.isToday && "bg-primary/10",
                  )}
                >
                  <div
                    className={cn(
                      "text-xs font-medium",
                      d.isToday && "text-primary",
                    )}
                  >
                    週{WEEKDAY[d.weekday]}
                  </div>
                  <div className="text-muted-foreground text-[10px] tabular-nums">
                    {d.label}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.membershipId} className="hover:bg-muted/10">
                <td className="bg-card sticky left-0 z-10 min-w-36 border-b border-r px-3 py-2 align-top">
                  <MemberCell m={m} />
                </td>
                {week.days.map((d) => (
                  <td
                    key={d.key}
                    className={cn(
                      "min-w-36 border-b p-1 align-top",
                      d.weekend && "bg-muted/15",
                      d.isToday && "bg-primary/5",
                    )}
                  >
                    <WeekCell
                      report={byKey.get(`${m.id}|${d.key}`)}
                      day={d}
                      canComment={canComment}
                      currentUserId={currentUserId}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Legend />
    </>
  );
}

function WeekCell({
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
    return (
      <div
        className={cn(
          "flex min-h-14 items-center justify-center rounded-md text-xs",
          day.weekend
            ? "text-muted-foreground/40"
            : "border-muted-foreground/20 text-muted-foreground/40 border border-dashed",
        )}
      >
        —
      </div>
    );
  }
  const preview =
    report.note?.trim() ||
    (report.items.length > 0 ? `${report.items.length} 項任務` : "已填");
  return (
    <Popover>
      <PopoverTrigger className="block w-full min-w-0 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-2 text-left transition-colors hover:bg-emerald-500/20">
        <div className="flex items-center gap-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
          <Check className="h-3 w-3" /> 已填
          {report.comments.length > 0 && (
            <span className="text-muted-foreground ml-auto">
              💬 {report.comments.length}
            </span>
          )}
        </div>
        <p className="text-foreground/80 mt-1 line-clamp-3 text-xs break-words whitespace-pre-wrap">
          {preview}
        </p>
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
