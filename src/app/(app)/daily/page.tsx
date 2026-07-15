import { format } from "date-fns";
import { ClipboardList, Fingerprint, History } from "lucide-react";
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
import { DailyReportForm } from "@/components/daily-report-form";
import { DailyReportCard } from "@/components/daily-report-card";
import { CheckInCard } from "@/components/check-in-card";
import { parseMatchMode } from "@/lib/checkin";
import { DailyVisibilityToggle } from "@/components/daily-visibility-toggle";
import {
  TeamPulseBoard,
  type BoardDay,
  type BoardReport,
} from "@/components/daily-team-board";

export const metadata = { title: "每日報告 · Project Pulse" };

const WINDOW_DAYS = 14;

export default async function DailyPage() {
  const { user, org, membership, canManage } = await requireManageContext();
  const isManager = canManage;

  const today = todayUtc();
  const todayKey = today.toISOString().slice(0, 10);
  const since = daysAgoUtc(WINDOW_DAYS - 1); // 近 14 天

  const orgRow = await db.organization.findUnique({
    where: { id: org.id },
    select: {
      dailyReportChainVisible: true,
      checkInEnabled: true,
      checkInMatchMode: true,
    },
  });
  const chainVisible = orgRow?.dailyReportChainVisible ?? false;
  const checkInEnabled = orgRow?.checkInEnabled ?? false;
  const checkInMatchMode = parseMatchMode(orgRow?.checkInMatchMode);

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

  // 團隊（下屬）資料——依可見範圍（管理者指派的主管、graph 上有下屬者才看得到）。
  const visibleMemberIds = visibleReportMemberIds(
    graph,
    membership.id,
    chainVisible,
  );
  const subordinates = directory.filter((d) =>
    visibleMemberIds.has(d.membershipId),
  );
  const subordinateUserIds = subordinates.map((s) => s.id);
  const teamReports =
    subordinateUserIds.length > 0
      ? await getDailyReportsForUsers(org.id, subordinateUserIds, since)
      : [];
  const showTeam = subordinates.length > 0;

  // 脈動熱區資料：近 14 天（舊→新）、成員、以 userId|date 索引的日報。
  const days: BoardDay[] = Array.from({ length: WINDOW_DAYS }, (_, i) => {
    const d = daysAgoUtc(WINDOW_DAYS - 1 - i);
    const key = d.toISOString().slice(0, 10);
    const weekday = d.getUTCDay();
    return {
      key,
      label: `${d.getUTCMonth() + 1}/${d.getUTCDate()}`,
      weekday,
      weekend: weekday === 0 || weekday === 6,
      isToday: key === todayKey,
    };
  });
  const boardMembers = subordinates.map((s) => ({
    id: s.id,
    membershipId: s.membershipId,
    name: s.name,
    nickname: s.nickname,
    useNickname: s.useNickname,
    email: s.email,
    image: s.image,
  }));
  const boardReports: BoardReport[] = teamReports.map((r) => ({
    id: r.id,
    date: r.date,
    dateKey: r.date.toISOString().slice(0, 10),
    score: r.score,
    userId: r.userId,
    note: r.note,
    user: r.user,
    items: r.items.map((it) => ({
      id: it.id,
      title: it.title,
      actual: it.actual,
    })),
    comments: r.comments.map((c) => ({
      id: c.id,
      body: c.body,
      createdAt: c.createdAt,
      author: c.author,
    })),
    reactions: r.reactions.map((x) => ({
      id: x.id,
      emoji: x.emoji,
      userId: x.userId,
      user: x.user,
    })),
  }));

  // 「我的今日」卡片（打卡 + 今日報告表單）。
  const myTodayCards = (
    <>
      {checkInEnabled && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5">
              <Fingerprint className="h-4 w-4" /> 今日打卡
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CheckInCard todayPunches={todayPunches} matchMode={checkInMatchMode} />
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
    </>
  );

  const myRecentCard = (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          <History className="h-4 w-4" /> 我的近期報告
        </CardTitle>
      </CardHeader>
      <CardContent>
        {myReports.length > 0 ? (
          <div className="max-h-[28rem] space-y-2 overflow-y-auto pr-1 pb-1">
            {myReports.map((r) => (
              <DailyReportCard
                key={r.id}
                report={r}
                canComment={false}
                currentUserId={user.id}
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
  );

  return (
    <div className="space-y-5 pb-4">
      <PageHeader
        title="每日報告"
        description={`${format(today, "yyyy/M/d (EEE)")} · 記錄今天完成的任務與重點`}
      />

      {/* 團隊脈動（主管檢視）：一眼看每個人、每一天的狀況。 */}
      {showTeam && (
        <TeamPulseBoard
          days={days}
          members={boardMembers}
          reports={boardReports}
          currentUserId={user.id}
          canComment
          header={isManager ? <DailyVisibilityToggle initial={chainVisible} /> : undefined}
        />
      )}

      {/* 我的今日 + 近期報告。 */}
      {showTeam ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-5">{myTodayCards}</div>
          {myRecentCard}
        </div>
      ) : (
        <div className={cn("mx-auto w-full max-w-2xl space-y-5")}>
          {myTodayCards}
          {myRecentCard}
        </div>
      )}
    </div>
  );
}
