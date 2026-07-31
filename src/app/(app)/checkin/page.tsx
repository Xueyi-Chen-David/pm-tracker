import { Fingerprint } from "lucide-react";
import { requireManageContext } from "@/server/org";
import { db } from "@/server/db";
import {
  getSelfAttendanceMonth,
  getMyCheckInCorrections,
  getPendingCheckInCorrections,
  getMyLeaveRequests,
  getOrgLeaveTypes,
  getMemberEventsForUser,
  getOrgMemberDirectory,
} from "@/server/queries";
import { parseMatchMode } from "@/lib/checkin";
import { taipeiTodayUtc } from "@/lib/date";
import { displayName } from "@/lib/display";
import {
  parseMonth,
  ym,
  monthRange,
  buildGridMembers,
  buildTimecardDays,
} from "@/lib/attendance-month";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckInCard } from "@/components/check-in-card";
import { AttendanceGrid } from "@/components/attendance-grid";
import { AttendanceMonthNav } from "@/components/attendance-month-nav";
import { AttendanceTimecard } from "@/components/attendance-timecard";
import { CheckInCorrections } from "@/components/checkin-corrections";
import { CheckInWorkspace } from "@/components/checkin/checkin-workspace";
import { LeaveRequestForm } from "@/components/leave/leave-request-form";
import { LeaveEventsSection } from "@/components/leave/leave-events-section";
import {
  RequestCard,
  CancelButton,
  Empty,
} from "@/components/leave/request-card";

export const metadata = { title: "打卡 / 請假 / 出差 · Project Pulse" };

/**
 * 打卡 / 請假 / 出差：個人差勤的一站式自助頁。
 *
 * 今日打卡置頂（每天最常按的動作），其餘分四個分頁：我的出勤（月曆 + 打卡紀錄）、
 * 請假（送簽核）、出差 / 事件（免簽核直接登記）、補打卡（忘記打卡的補救 + 管理者審核）。
 * 「出席狀況」則專心當全體出勤的檢視 / 管理頁，「請假簽核」只留簽核者要做的事。
 */
export default async function CheckInPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { org, user, can } = await requireManageContext();
  // 補打卡的審核者＝具「登記 / 修改全體出勤」權限者（與出席狀況頁同一條件）。
  const canReview = can("attendance.manage");
  // 出勤管理者可在「出差 / 事件」代其他成員登記（原本在請假簽核頁）。
  const canManageAttendance = canReview;
  const { month: monthParam } = await searchParams;

  // 「今天」與「本月」一律以台灣當地日期為準：伺服器跑在 UTC，台灣早上 8 點前
  // 直接用伺服器日期會整整差一天（月初還會退回上個月）。
  const today = taipeiTodayUtc();
  const todayStr = today.toISOString().slice(0, 10);
  const thisMonth = {
    year: today.getUTCFullYear(),
    month: today.getUTCMonth() + 1,
  };
  const { year, month } = parseMonth(monthParam, thisMonth);
  const { start, end, days } = monthRange(year, month);

  const [
    orgConfig,
    rows,
    myCheckIns,
    todayPunches,
    firstCheckIn,
    myCorrections,
    pendingCorrections,
    myRequests,
    leaveTypes,
    myEvents,
    directory,
  ] = await Promise.all([
    db.organization.findUnique({
      where: { id: org.id },
      select: { checkInEnabled: true, checkInMatchMode: true },
    }),
    getSelfAttendanceMonth(org.id, user.id, start, end),
    // 本月的所有打卡（組打卡紙用）。
    db.checkIn.findMany({
      where: {
        organizationId: org.id,
        userId: user.id,
        date: { gte: start, lt: end },
      },
      orderBy: { at: "asc" },
      select: { date: true, at: true, kind: true, method: true },
    }),
    // 今天的打卡（打卡卡片用，需要 id 才能顯示既有紀錄）。
    db.checkIn.findMany({
      where: { organizationId: org.id, userId: user.id, date: today },
      orderBy: { at: "asc" },
      select: { id: true, kind: true, at: true, method: true },
    }),
    // 自動缺席的起算錨點：該企業第一次打卡的日期（與出席狀況頁同一規則）。
    db.checkIn.findFirst({
      where: { organizationId: org.id, valid: true },
      orderBy: { date: "asc" },
      select: { date: true },
    }),
    getMyCheckInCorrections(org.id, user.id),
    // 待審核補打卡（管理者才撈）。
    canReview ? getPendingCheckInCorrections(org.id) : Promise.resolve(null),
    getMyLeaveRequests(org.id, user.id),
    getOrgLeaveTypes(org.id, true),
    getMemberEventsForUser(org.id, user.id),
    // 代他人登記出差 / 事件的對象清單（僅出勤管理者需要）。
    canManageAttendance ? getOrgMemberDirectory(org.id) : Promise.resolve(null),
  ]);

  const checkInEnabled = orgConfig?.checkInEnabled ?? false;
  const anchorStr = firstCheckIn
    ? firstCheckIn.date.toISOString().slice(0, 10)
    : null;

  const members = buildGridMembers(rows, days, {
    autoAbsentEnabled: checkInEnabled && anchorStr !== null,
    anchorStr,
    todayStr,
  });
  const timecardDays = buildTimecardDays(myCheckIns, days, todayStr);
  // 待審核的補打卡也疊到打卡紙上（琥珀色「待審核」），核准前就能在同一張表看到，
  // 不用另外切去「補打卡」分頁確認申請了什麼時間。核准後會變成真正的 in/outAt。
  const pendingByDate = new Map<string, { in?: string; out?: string }>();
  for (const c of myCorrections) {
    if (c.status !== "pending") continue;
    const slot = pendingByDate.get(c.date) ?? {};
    if (c.kind === "in") slot.in = c.at;
    else slot.out = c.at;
    pendingByDate.set(c.date, slot);
  }
  const timecardDaysWithPending = timecardDays.map((d) => {
    const p = pendingByDate.get(d.dateStr);
    return p
      ? { ...d, pendingInAt: p.in ?? null, pendingOutAt: p.out ?? null }
      : d;
  });

  const eventMembers = canManageAttendance
    ? (directory?.map((d) => ({
        userId: d.id,
        label: d.jobTitle
          ? `${displayName(d)}（${d.jobTitle}）`
          : displayName(d),
      })) ?? [])
    : null;

  // 分頁紅點：請假＝我還在跑簽核的；補打卡＝管理者看待審核，其他人看自己審核中的。
  const leaveBadge = myRequests.filter((r) => r.status === "PENDING").length;
  const correctionBadge = canReview
    ? (pendingCorrections?.length ?? 0)
    : myCorrections.filter((c) => c.status === "pending").length;

  return (
    // 桌機：填滿視窗高度（扣掉 AppContainer 的 py-6＝3rem），讓「補打卡」等分頁
    // 內容依實際可用空間貼齊底部、在區塊內捲動，而不是把整頁往下撐長；
    // 手機維持一般文件捲動（與 /todo 頁同一套寫法）。
    <div className="flex flex-col gap-4 lg:h-[calc(100dvh-3rem)] lg:overflow-hidden">
      <PageHeader
        title="打卡 / 請假 / 出差"
        description={`${year} 年 ${month} 月 · 你的打卡、請假與出差都在這一頁`}
      >
        <AttendanceMonthNav
          month={ym(year, month)}
          thisMonth={ym(thisMonth.year, thisMonth.month)}
          basePath="/checkin"
        />
      </PageHeader>

      <div className="min-h-0 lg:flex-1">
        <CheckInWorkspace
          leaveBadge={leaveBadge}
          correctionBadge={correctionBadge}
          today={
            checkInEnabled ? (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-1.5">
                    <Fingerprint className="h-4 w-4" /> 今日打卡
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <CheckInCard
                    todayPunches={todayPunches}
                    matchMode={parseMatchMode(orgConfig?.checkInMatchMode)}
                  />
                </CardContent>
              </Card>
            ) : (
              <p className="text-muted-foreground rounded-xl border border-dashed px-4 py-6 text-center text-sm">
                你的企業尚未啟用打卡。以下仍可查看出勤月曆、送出請假與登記出差。
              </p>
            )
          }
          attendance={
            members.length === 0 ? (
              <Empty text="找不到你的出勤資料。" />
            ) : (
              <>
                <p className="text-muted-foreground text-xs">
                  出缺勤以打卡為準（唯讀）。忘記打卡請到「補打卡」分頁申請；請假
                  / 出差請用上方分頁登記。
                  {checkInEnabled && "平日未打卡者於次日起自動標記缺席。"}
                </p>
                {/* 本人一律唯讀：要改出勤得走補打卡 / 請假流程，故 canManage 固定 false。 */}
                <AttendanceGrid
                  members={members}
                  days={days}
                  canManage={false}
                />
                {(checkInEnabled ||
                  timecardDays.some((d) => d.inAt || d.outAt)) && (
                  <AttendanceTimecard
                    days={timecardDaysWithPending}
                    todayStr={todayStr}
                  />
                )}
              </>
            )
          }
          leave={
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-muted-foreground text-xs">
                  正式請假走簽核流程，核准後自動登記到出席月曆；輪到誰簽核時對方會收到通知。
                </p>
                <LeaveRequestForm leaveTypes={leaveTypes} />
              </div>
              {myRequests.length === 0 ? (
                <Empty text="你還沒有送出任何請假申請。點右上「申請請假」開始。" />
              ) : (
                myRequests.map((r) => (
                  <RequestCard
                    key={r.id}
                    req={r}
                    footer={
                      r.status === "PENDING" ? <CancelButton id={r.id} /> : null
                    }
                  />
                ))
              )}
            </>
          }
          events={
            <>
              <p className="text-muted-foreground text-xs">
                出差、在家工作、外出等免簽核事件直接登記；出差 /
                在家工作會即時反映到出席月曆。
              </p>
              <LeaveEventsSection
                myUserId={user.id}
                myLabel={displayName(user)}
                initialEvents={myEvents}
                canManageAttendance={canManageAttendance}
                members={eventMembers}
              />
            </>
          }
          corrections={
            <CheckInCorrections
              mine={myCorrections}
              pending={pendingCorrections}
              canReview={canReview}
            />
          }
        />
      </div>
    </div>
  );
}
