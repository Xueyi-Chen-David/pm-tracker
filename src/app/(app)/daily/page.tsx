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
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DailyReportForm } from "@/components/daily-report-form";
import { DailyReportCard } from "@/components/daily-report-card";
import { CheckInCard } from "@/components/check-in-card";
import { parseMatchMode } from "@/lib/checkin";
import { DailyVisibilityToggle } from "@/components/daily-visibility-toggle";
import {
  DailyBoard,
  type BoardDay,
  type BoardWeek,
  type BoardReport,
} from "@/components/daily-team-board";

export const metadata = { title: "每日報告 · Project Pulse" };

const PULSE_DAYS = 14; // 脈動分頁顯示的天數
const WEEKS = 4; // 一週分頁可回溯的週數
const DAY_MS = 86_400_000;

export default async function DailyPage() {
  const { user, org, membership, canManage, previewing } =
    await requireManageContext();
  const isManager = canManage; // 員工視角預覽時降為非管理者

  const today = todayUtc();
  const todayKey = today.toISOString().slice(0, 10);

  const mkDay = (d: Date): BoardDay => {
    const key = d.toISOString().slice(0, 10);
    const weekday = d.getUTCDay();
    return {
      key,
      label: `${d.getUTCMonth() + 1}/${d.getUTCDate()}`,
      weekday,
      weekend: weekday === 0 || weekday === 6,
      isToday: key === todayKey,
    };
  };
  const addDays = (base: Date, n: number) =>
    new Date(base.getTime() + n * DAY_MS);

  // 一週分頁：以「本週」回溯 WEEKS 週，每週一 → 週日對齊。
  const dow = today.getUTCDay(); // 0=Sun..6=Sat
  const thisMonday = daysAgoUtc((dow + 6) % 7);
  const weekStart = addDays(thisMonday, -7 * (WEEKS - 1)); // 最早一週的週一
  const mySince = daysAgoUtc(PULSE_DAYS - 1); // 我的近期報告：近 14 天
  const teamSince = weekStart < mySince ? weekStart : mySince; // 團隊取兩者較早者

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
    getDailyReportsForUsers(org.id, [user.id], mySince),
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
  // 員工視角預覽時一律當成沒有下屬的一般員工，因此不顯示團隊日報。
  const visibleMemberIds = previewing
    ? new Set<string>()
    : visibleReportMemberIds(graph, membership.id, chainVisible);
  const subordinates = directory.filter((d) =>
    visibleMemberIds.has(d.membershipId),
  );
  const subordinateUserIds = subordinates.map((s) => s.id);
  const teamReports =
    subordinateUserIds.length > 0
      ? await getDailyReportsForUsers(org.id, subordinateUserIds, teamSince)
      : [];
  const showTeam = subordinates.length > 0;

  // 脈動分頁：近 14 天（舊→新）。
  const pulseDays: BoardDay[] = Array.from({ length: PULSE_DAYS }, (_, i) =>
    mkDay(daysAgoUtc(PULSE_DAYS - 1 - i)),
  );
  // 一週分頁：WEEKS 週，每週一 → 週日；最後一筆為本週。
  const weeks: BoardWeek[] = Array.from({ length: WEEKS }, (_, w) => {
    const mon = addDays(thisMonday, -7 * (WEEKS - 1 - w));
    const wdays = Array.from({ length: 7 }, (_, i) => mkDay(addDays(mon, i)));
    return {
      key: wdays[0]!.key,
      label: `${wdays[0]!.label}–${wdays[6]!.label}`,
      days: wdays,
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

  // 「我的日報」分頁：今日打卡 / 報告表單 + 近期報告。
  const mine = (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4">{myTodayCards}</div>
      {myRecentCard}
    </div>
  );

  return (
    <div className="space-y-5 pb-4">
      <PageHeader
        title="每日報告"
        description={`${format(today, "yyyy/M/d (EEE)")} · 記錄今天完成的任務與重點`}
      />

      {/* 有下屬＝分頁（我的日報 / 脈動 / 一週）；否則只顯示我的日報。 */}
      {showTeam ? (
        <DailyBoard
          mine={mine}
          pulseDays={pulseDays}
          weeks={weeks}
          members={boardMembers}
          reports={boardReports}
          currentUserId={user.id}
          canComment
          header={isManager ? <DailyVisibilityToggle initial={chainVisible} /> : undefined}
        />
      ) : (
        <div className="mx-auto w-full max-w-4xl">{mine}</div>
      )}
    </div>
  );
}
