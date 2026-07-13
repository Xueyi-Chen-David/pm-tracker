import { format } from "date-fns";
import { ClipboardList, Fingerprint, Users2, History, Check } from "lucide-react";
import { requireManageContext } from "@/server/org";
import { db } from "@/server/db";
import {
  getDailyReportsForUsers,
  getMembershipGraph,
  getOrgMemberDirectory,
} from "@/server/queries";
import { visibleReportMemberIds } from "@/server/hierarchy";
import { todayUtc, daysAgoUtc } from "@/lib/date";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MemberName } from "@/components/member-name";
import { DailyReportForm } from "@/components/daily-report-form";
import { DailyReportCard } from "@/components/daily-report-card";
import { CheckInCard } from "@/components/check-in-card";
import { DailyVisibilityToggle } from "@/components/daily-visibility-toggle";

export const metadata = { title: "每日報告 · Project Pulse" };

export default async function DailyPage() {
  const { user, org, membership, canManage, previewing } =
    await requireManageContext();
  const isManager = canManage; // 員工視角預覽時降為非管理者

  const today = todayUtc();
  const since = daysAgoUtc(13); // 近 14 天

  const orgRow = await db.organization.findUnique({
    where: { id: org.id },
    select: {
      dailyReportChainVisible: true,
      checkInEnabled: true,
    },
  });
  const chainVisible = orgRow?.dailyReportChainVisible ?? false;
  const checkInEnabled = orgRow?.checkInEnabled ?? false;

  // 我的資料。
  const [myReports, graph, directory, todayPunches] = await Promise.all([
    getDailyReportsForUsers(org.id, [user.id], since),
    getMembershipGraph(org.id),
    getOrgMemberDirectory(org.id),
    checkInEnabled
      ? db.checkIn.findMany({
          where: { organizationId: org.id, userId: user.id, date: today },
          orderBy: { at: "asc" },
          select: { id: true, kind: true, at: true, method: true },
        })
      : Promise.resolve([]),
  ]);

  const todayReport = myReports.find((r) => r.date.getTime() === today.getTime());

  // 團隊（下屬）資料——依可見範圍。
  // 團隊日報只給「管理者指派的主管」（graph 上有下屬者）看；員工視角預覽時一律當成
  // 沒有下屬的一般員工，因此不顯示團隊日報。
  const visibleMemberIds = previewing
    ? new Set<string>()
    : visibleReportMemberIds(graph, membership.id, chainVisible);
  const subordinateUserIds = graph
    .filter((g) => visibleMemberIds.has(g.id))
    .map((g) => g.userId);
  const subordinates = directory.filter((d) =>
    visibleMemberIds.has(d.membershipId),
  );
  const teamReports =
    subordinateUserIds.length > 0
      ? await getDailyReportsForUsers(org.id, subordinateUserIds, since)
      : [];
  const submittedTodayUserIds = new Set(
    teamReports
      .filter((r) => r.date.getTime() === today.getTime())
      .map((r) => r.userId),
  );
  const showTeam = subordinates.length > 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title="每日報告"
        description={`${format(today, "yyyy/M/d (EEE)")} · 記錄今天完成的任務與重點`}
      />

      <div className={cn("grid gap-5", showTeam && "lg:grid-cols-2")}>
        {/* 我的每日 */}
        <div className={cn("space-y-5", !showTeam && "mx-auto w-full max-w-2xl")}>
          {checkInEnabled && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-1.5">
                  <Fingerprint className="h-4 w-4" /> 今日打卡
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CheckInCard todayPunches={todayPunches} />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-1.5">
                <ClipboardList className="h-4 w-4" /> 今日報告
              </CardTitle>
            </CardHeader>
            <CardContent>
              <DailyReportForm
                initial={
                  todayReport
                    ? {
                        note: todayReport.note ?? "",
                        items: todayReport.items.map((it) => ({
                          title: it.title,
                          actual: it.actual,
                        })),
                      }
                    : null
                }
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-1.5">
                <History className="h-4 w-4" /> 我的近期報告
              </CardTitle>
            </CardHeader>
            <CardContent>
              {myReports.length > 0 ? (
                <div className="max-h-[28rem] space-y-2 overflow-y-auto pr-1">
                  {myReports.map((r) => (
                    <DailyReportCard
                      key={r.id}
                      report={r}
                      canComment={false}
                      showAuthor={false}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">
                  還沒有每日報告，從上面開始新增今天的任務。
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* 團隊日報（主管檢視） */}
        {showTeam && (
          <div className="space-y-5">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-1.5">
                  <Users2 className="h-4 w-4" /> 團隊日報
                  <span className="text-muted-foreground text-xs font-normal">
                    · {subordinates.length} 位下屬
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {isManager && <DailyVisibilityToggle initial={chainVisible} />}

                {/* 今日狀態 */}
                <div>
                  <div className="text-muted-foreground mb-1.5 text-xs font-medium">
                    今日狀態
                  </div>
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {subordinates.map((s) => {
                      const submitted = submittedTodayUserIds.has(s.id);
                      return (
                        <div
                          key={s.membershipId}
                          className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm"
                        >
                          <MemberName u={s} className="min-w-0 flex-1 truncate" />
                          {submitted ? (
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                              <Check className="h-3 w-3" /> 已填
                            </span>
                          ) : (
                            <span className="text-muted-foreground shrink-0 text-xs">
                              未填
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 近期報告 + 回饋 */}
                <div className="space-y-2">
                  <div className="text-muted-foreground text-xs font-medium">
                    近期報告
                  </div>
                  {teamReports.length === 0 ? (
                    <p className="text-muted-foreground text-sm">
                      下屬還沒有每日報告。
                    </p>
                  ) : (
                    teamReports.map((r) => (
                      <DailyReportCard key={r.id} report={r} canComment />
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
