import {
  CircleCheckBig,
  Target,
  AlertTriangle,
  MessageCircleQuestion,
  FolderKanban,
  Activity,
  Users,
} from "lucide-react";
import { requireActiveOrg } from "@/server/org";
import {
  getReportData,
  getWeeklyReport,
  getMeetingsForWeek,
  getOrgMemberUsers,
  getTimelineData,
} from "@/server/queries";
import {
  weekStartOf,
  shiftWeek,
  thisWeekStart,
  toDateInput,
  weekLabelFull,
  fmtDate,
  isOverdue,
} from "@/lib/date";
import { primaryName, displayName } from "@/lib/display";
import { meetingCategoryBadge } from "@/lib/constants";
import { blocksToHtml, parseBlocks } from "@/lib/report-content";
import { cn } from "@/lib/utils";
import { ReportToolbar } from "@/components/report-toolbar";
import { ReportSheet } from "@/components/report-sheet";
import { ReportSummaryEditor } from "@/components/report-summary-editor";
import { RoadmapChart } from "@/components/roadmap-chart";
import { HealthBadge, StatusBadge, TypeBadge } from "@/components/badges";
import { ProgressBar } from "@/components/progress-bar";

export const metadata = { title: "週報 · Project Pulse" };

/**
 * 會議記錄的 notes 是 HTML（圖片內嵌環繞排版，見 meeting-notes-canvas.tsx），
 * 這裡只是週報的緊湊條列，不適合整段浮動圖片版面，去標籤取純文字摘要即可。
 */
function meetingNotesPreview(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const { org } = await requireActiveOrg();
  const { week } = await searchParams;
  const weekStart = week ? weekStartOf(week) : thisWeekStart();
  const [projects, weeklyReport, meetings, users, timelineProjects] =
    await Promise.all([
      getReportData(org.id, weekStart),
      getWeeklyReport(org.id, weekStart),
      getMeetingsForWeek(org.id, weekStart),
      getOrgMemberUsers(org.id),
      getTimelineData(org.id),
    ]);
  const nameById = new Map(users.map((u) => [u.id, displayName(u)]));
  // 路線圖不顯示未開始 / 暫停的專案
  const roadmapProjects = timelineProjects.filter(
    (p) => p.status !== "NOT_STARTED" && p.status !== "ON_HOLD",
  );
  // 整體說明文件 HTML（新版 contentHtml；舊資料由區塊 / summary+images 轉成 HTML）
  const summaryHtml =
    weeklyReport?.contentHtml ??
    blocksToHtml(
      weeklyReport?.content
        ? parseBlocks(weeklyReport.content)
        : [
            ...(weeklyReport?.summary
              ? [{ type: "text" as const, text: weeklyReport.summary }]
              : []),
            ...(weeklyReport?.images ?? []).map((src) => ({
              type: "image" as const,
              src,
            })),
          ],
    );

  const rows = projects.map((p) => ({ p, u: p.weeklyUpdates[0] ?? null }));
  const active = rows.filter((r) => r.p.status !== "COMPLETED");
  // 完成度（整體平均進度）：只計入被勾選「計入完成度」的專案
  const counted = rows.filter((r) => r.p.countInProgress);
  const avgProgress = counted.length
    ? Math.round(
        counted.reduce((s, r) => s + r.p.progress, 0) / counted.length,
      )
    : 0;
  // 各專案進度總表：排除未開始 / 暫停
  const summaryRows = rows.filter(
    (r) => r.p.status !== "NOT_STARTED" && r.p.status !== "ON_HOLD",
  );

  const done = rows.filter((r) => r.u?.thisWeekDone);
  const nextGoals = rows.filter((r) => r.u?.nextWeekGoals);
  const decisions = rows.filter((r) => r.u?.needsDecision);
  const risks = rows.filter(
    (r) =>
      r.u?.risks ||
      (r.p.status !== "COMPLETED" &&
        (r.p.health !== "GREEN" || isOverdue(r.p.targetDate, false))),
  );

  const isCurrent = weekStart.getTime() === thisWeekStart().getTime();

  return (
    <div>
      <ReportToolbar
        prevWeek={toDateInput(shiftWeek(weekStart, -1))}
        nextWeek={toDateInput(shiftWeek(weekStart, 1))}
        thisWeek={toDateInput(thisWeekStart())}
        isCurrent={isCurrent}
        pdfName={`週報_${toDateInput(weekStart)}`}
      />

      <ReportSheet>
        {/* Banner */}
        <div className="rounded-xl bg-slate-800 px-6 py-5 text-white print-break">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-xs tracking-widest text-slate-300">
                專案週報 · WEEKLY REPORT
              </div>
              <h1 className="mt-1 text-2xl font-bold">
                {weekLabelFull(weekStart)}
              </h1>
            </div>
            <div className="flex items-center gap-6">
              <Metric
                label={`整體平均進度（計入 ${counted.length} 項）`}
                value={`${avgProgress}%`}
              />
              <Metric label="專案 / 任務" value={projects.length} />
              <Metric label="需關注" value={risks.length} accent="amber" />
              <Metric label="需決策" value={decisions.length} accent="amber" />
            </div>
          </div>
        </div>

        {/* KPI cards（固定欄數：螢幕與列印版面一致，量測才準） */}
        <div className="mt-4 grid grid-cols-4 gap-3 print-break">
          <KpiCard icon={<FolderKanban className="h-4 w-4" />} label="專案 / 任務" value={projects.length} />
          <KpiCard icon={<Activity className="h-4 w-4" />} label="進行中" value={active.length} />
          <KpiCard
            icon={<AlertTriangle className="h-4 w-4" />}
            label="需要關注"
            value={risks.length}
            tone={risks.length ? "red" : "green"}
          />
          <KpiCard
            icon={<MessageCircleQuestion className="h-4 w-4" />}
            label="需老闆決策"
            value={decisions.length}
            tone={decisions.length ? "amber" : "green"}
          />
        </div>

        {/* 路線圖（最上面的 section）*/}
        <div className="mt-4 print-break">
          <Section
            title="路線圖"
            icon={<FolderKanban className="h-4 w-4 text-slate-600" />}
          >
            <RoadmapChart projects={roadmapProjects} />
          </Section>
        </div>

        {/* 本週完成 / 下週目標（固定兩欄） */}
        <div className="mt-4 grid grid-cols-2 gap-4">
          <Section title="本週完成重點" icon={<CircleCheckBig className="h-4 w-4 text-emerald-600" />}>
            {done.length === 0 ? (
              <Empty>本週尚無完成項目紀錄</Empty>
            ) : (
              <ul className="space-y-2">
                {done.map((r) => (
                  <li key={r.p.id} className="flex gap-2 text-sm">
                    <span className="mt-0.5 text-emerald-600">✓</span>
                    <span>
                      <span className="font-medium">{r.p.name}</span>
                      <span className="text-slate-600"> — {r.u!.thisWeekDone}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="下週重點目標" icon={<Target className="h-4 w-4 text-blue-600" />}>
            {nextGoals.length === 0 ? (
              <Empty>本週尚無下週目標紀錄</Empty>
            ) : (
              <ul className="space-y-2">
                {nextGoals.map((r) => (
                  <li key={r.p.id} className="flex gap-2 text-sm">
                    <span className="mt-0.5 text-blue-600">→</span>
                    <span>
                      <span className="font-medium">{r.p.name}</span>
                      <span className="text-slate-600"> — {r.u!.nextWeekGoals}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>

        {/* 需老闆決策 */}
        {decisions.length > 0 && (
          <div className="mt-4 print-break">
            <Section
              title="需老闆決策"
              icon={<MessageCircleQuestion className="h-4 w-4 text-amber-600" />}
              tone="amber"
            >
              <ul className="space-y-2">
                {decisions.map((r) => (
                  <li key={r.p.id} className="text-sm">
                    <span className="font-medium">{r.p.name}</span>
                    <span className="text-amber-800"> — {r.u!.needsDecision}</span>
                  </li>
                ))}
              </ul>
            </Section>
          </div>
        )}

        {/* 風險與關注事項 */}
        {risks.length > 0 && (
          <div className="mt-4 print-break">
            <Section
              title="風險與關注事項"
              icon={<AlertTriangle className="h-4 w-4 text-amber-600" />}
            >
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-slate-500">
                    <th className="py-1.5 pr-3 font-medium">專案</th>
                    <th className="py-1.5 pr-3 font-medium">狀態</th>
                    <th className="py-1.5 pr-3 font-medium">風險 / 阻礙</th>
                    <th className="py-1.5 font-medium">下週對策 / 目標</th>
                  </tr>
                </thead>
                <tbody>
                  {risks.map((r) => (
                    <tr key={r.p.id} className="border-b align-top">
                      <td className="py-2 pr-3 font-medium">{r.p.name}</td>
                      <td className="py-2 pr-3">
                        <HealthBadge health={r.p.health} />
                      </td>
                      <td className="py-2 pr-3 text-slate-600">
                        {r.u?.risks ||
                          (isOverdue(r.p.targetDate, false)
                            ? `已逾期（截止 ${fmtDate(r.p.targetDate)}）`
                            : "狀態非綠燈，需留意")}
                      </td>
                      <td className="py-2 text-slate-600">
                        {r.u?.nextWeekGoals || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          </div>
        )}

        {/* 各專案進度總表（不含未開始 / 暫停） */}
        <div className="mt-4 print-break">
          <Section title="各專案進度總表" icon={<FolderKanban className="h-4 w-4 text-slate-600" />}>
            {summaryRows.length === 0 ? (
              <Empty>沒有進行中 / 已完成的專案。</Empty>
            ) : (
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-slate-500">
                    <th className="py-1.5 pr-3 font-medium">專案 / 任務</th>
                    <th className="py-1.5 pr-3 font-medium">類型</th>
                    <th className="py-1.5 pr-3 font-medium">負責人</th>
                    <th className="py-1.5 pr-3 font-medium">狀態</th>
                    <th className="w-40 py-1.5 pr-3 font-medium">進度</th>
                    <th className="py-1.5 font-medium">本週</th>
                  </tr>
                </thead>
                <tbody>
                  {summaryRows.map((r) => (
                    <tr key={r.p.id} className="border-b">
                      <td className="py-2 pr-3 font-medium">
                        {r.p.name}
                        {!r.p.countInProgress && (
                          <span className="ml-1.5 rounded border border-slate-200 px-1 py-0.5 text-[10px] font-normal text-slate-400">
                            不計入完成度
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        <TypeBadge type={r.p.type} />
                      </td>
                      <td className="py-2 pr-3 text-slate-600">
                        {(() => {
                          // 負責人＝專案負責人；成員＝任務負責人（排除專案負責人本身）。
                          const owners: string[] = [];
                          if (r.p.owner) owners.push(primaryName(r.p.owner));
                          const team = r.p.team
                            .filter((u) => u.id !== r.p.owner?.id)
                            .map((u) => primaryName(u));
                          return (
                            <>
                              <div>{firstTwo(owners)}</div>
                              {team.length > 0 && (
                                <div className="text-[11px] text-slate-400">
                                  成員 {firstTwo(team)}
                                </div>
                              )}
                            </>
                          );
                        })()}
                      </td>
                      <td className="py-2 pr-3">
                        <StatusBadge status={r.p.status} />
                      </td>
                      <td className="py-2 pr-3">
                        <ProgressBar value={r.p.progress} />
                      </td>
                      <td className="py-2">
                        {r.u ? (
                          <HealthBadge health={r.u.health} />
                        ) : (
                          <span className="text-xs text-slate-400">未更新</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>
        </div>

        {/* 本週會議 */}
        {meetings.length > 0 && (
          <div className="mt-4 print-break">
            <Section
              title="本週會議"
              icon={<Users className="h-4 w-4 text-slate-600" />}
            >
              <ul className="space-y-2.5">
                {meetings.map((m) => {
                  const names = m.attendeeIds
                    .map((id) => nameById.get(id))
                    .filter((n): n is string => !!n);
                  const isAll =
                    users.length > 0 && names.length === users.length;
                  const attendeeText = [
                    names.length
                      ? isAll
                        ? `全體（${names.length} 人）`
                        : names.join("、")
                      : "",
                    m.attendees,
                  ]
                    .filter(Boolean)
                    .join("；");
                  return (
                    <li key={m.id} className="text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={cn(
                            "rounded-full border px-2 py-0.5 text-xs font-medium",
                            meetingCategoryBadge(m.category),
                          )}
                        >
                          {m.category}
                        </span>
                        <span className="font-medium">{m.title}</span>
                        <span className="text-xs text-slate-500">
                          {fmtDate(m.date)}
                        </span>
                      </div>
                      {attendeeText && (
                        <div className="text-xs text-slate-500">
                          與會：{attendeeText}
                        </div>
                      )}
                      {m.notes && (
                        <div className="mt-0.5 whitespace-pre-wrap text-slate-600">
                          {meetingNotesPreview(m.notes)}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Section>
          </div>
        )}

        {/* 整體說明（可編輯，會列印） */}
        <div className="mt-4 print-break">
          <ReportSummaryEditor
            weekStart={weekStart.toISOString()}
            html={summaryHtml}
          />
        </div>

        <div className="mt-4 text-center text-[11px] text-slate-400">
          由 Project Pulse 產生 · {weekLabelFull(weekStart)}
        </div>
      </ReportSheet>
    </div>
  );
}

/** 取前兩個名字；超過兩個顯示「+N」。 */
function firstTwo(names: string[]): string {
  if (names.length === 0) return "—";
  const head = names.slice(0, 2).join("、");
  return names.length > 2 ? `${head} +${names.length - 2}` : head;
}

function Metric({
  label,
  value,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  accent?: "amber";
}) {
  return (
    <div className="text-right">
      <div className={`text-2xl font-bold ${accent === "amber" ? "text-amber-300" : ""}`}>
        {value}
      </div>
      <div className="text-[11px] text-slate-300">{label}</div>
    </div>
  );
}

const KPI_TONE: Record<string, string> = {
  slate: "text-slate-600 bg-slate-100",
  red: "text-red-600 bg-red-100",
  amber: "text-amber-600 bg-amber-100",
  green: "text-emerald-600 bg-emerald-100",
};

function KpiCard({
  icon,
  label,
  value,
  tone = "slate",
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  tone?: keyof typeof KPI_TONE;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border bg-white p-3">
      <span className={`flex h-8 w-8 items-center justify-center rounded-md ${KPI_TONE[tone]}`}>
        {icon}
      </span>
      <div>
        <div className="text-xl leading-none font-bold">{value}</div>
        <div className="text-[11px] text-slate-500">{label}</div>
      </div>
    </div>
  );
}

function Section({
  title,
  icon,
  children,
  tone,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  tone?: "amber";
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        tone === "amber" ? "border-amber-200 bg-amber-50/60" : "bg-white"
      }`}
    >
      <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
        {icon}
        {title}
      </h2>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-slate-400">{children}</p>;
}
