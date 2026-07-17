import { Check, X } from "lucide-react";
import { requireManageContext } from "@/server/org";
import { db } from "@/server/db";
import {
  getAttendanceMonth,
  getSelfAttendanceMonth,
  getTrackableMembers,
  getOrgLeaveTypes,
} from "@/server/queries";
import { parseGeofences, parseMatchMode } from "@/lib/checkin";
import { todayUtc } from "@/lib/date";
import { displayName } from "@/lib/display";
import {
  parseMonth,
  ym,
  monthRange,
  buildGridMembers,
  buildTimecardDays,
} from "@/lib/attendance-month";
import { PageHeader } from "@/components/page-header";
import { AttendanceGrid } from "@/components/attendance-grid";
import { AttendanceMonthNav } from "@/components/attendance-month-nav";
import { AttendanceTrackManager } from "@/components/attendance-track-manager";
import { AttendanceExportButton } from "@/components/attendance-export-button";
import {
  AttendanceExportPngButton,
  ATTENDANCE_LEGEND_ID,
} from "@/components/attendance-export-png-button";
import { CheckInSettings } from "@/components/check-in-settings";
import {
  MemberTimecards,
  type MemberTimecard,
} from "@/components/member-timecards";

export const metadata = { title: "出席狀況 · Project Pulse" };

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { org, user, can } = await requireManageContext();
  // 出勤可見範圍：具「查看全體出勤」權限者（人資 / 管理者）看全部；否則只看自己。
  const canViewAll = can("attendance.view_all");
  // 出勤管理權限：可登記 / 修改他人、管理追蹤成員與打卡設定。
  const canManageAtt = can("attendance.manage");
  // 打卡時間可見性：可看到每個人每天實際的上 / 下班時間（月曆只看得出有沒有出席）。
  const canViewPunchTimes = can("attendance.view_punch_times");
  const { month: monthParam } = await searchParams;

  const now = new Date();
  const thisMonth = { year: now.getFullYear(), month: now.getMonth() + 1 };
  const { year, month } = parseMonth(monthParam, thisMonth);
  const { start, end, days } = monthRange(year, month);
  const todayStr = todayUtc().toISOString().slice(0, 10);

  const [rows, trackable, leaveTypes, orgConfig, firstCheckIn] =
    await Promise.all([
      canViewAll
        ? getAttendanceMonth(org.id, start, end)
        : getSelfAttendanceMonth(org.id, user.id, start, end),
      canManageAtt ? getTrackableMembers(org.id) : Promise.resolve([]),
      getOrgLeaveTypes(org.id, true),
      db.organization.findUnique({
        where: { id: org.id },
        select: {
          checkInEnabled: true,
          checkInAllowedIps: true,
          checkInGeofences: true,
          checkInMatchMode: true,
        },
      }),
      // 自動缺席的起算錨點：該企業第一次打卡的日期（在那之前不判缺席，避免把
      // 尚未導入打卡的歷史日子全部誤標）。沒有任何打卡則不啟用自動缺席。
      db.checkIn.findFirst({
        where: { organizationId: org.id, valid: true },
        orderBy: { date: "asc" },
        select: { date: true },
      }),
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

  // 每人打卡時間：只在具備權限時才查（沒權限就連資料都不撈到伺服器記憶體）。
  let memberTimecards: MemberTimecard[] = [];
  if (canViewPunchTimes && members.length > 0) {
    const punches = await db.checkIn.findMany({
      where: {
        organizationId: org.id,
        userId: { in: members.map((m) => m.id) },
        date: { gte: start, lt: end },
      },
      orderBy: { at: "asc" },
      select: { userId: true, date: true, at: true, kind: true, method: true },
    });
    const byUser = new Map<string, typeof punches>();
    for (const p of punches) {
      const arr = byUser.get(p.userId) ?? [];
      arr.push(p);
      byUser.set(p.userId, arr);
    }
    memberTimecards = members.map((m) => ({
      userId: m.id,
      label: displayName(m),
      days: buildTimecardDays(byUser.get(m.id) ?? [], days, todayStr),
    }));
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="出席狀況"
        description={
          canViewAll
            ? `${year} 年 ${month} 月 · 追蹤 ${members.length} 位成員`
            : `${year} 年 ${month} 月 · 我的出勤`
        }
      >
        <AttendanceMonthNav
          month={ym(year, month)}
          thisMonth={ym(thisMonth.year, thisMonth.month)}
        />
        {members.length > 0 && (
          <>
            <AttendanceExportButton
              members={members}
              days={days}
              month={ym(year, month)}
            />
            <AttendanceExportPngButton month={ym(year, month)} />
          </>
        )}
        {canManageAtt && orgConfig && (
          <CheckInSettings
            enabled={orgConfig.checkInEnabled}
            allowedIps={orgConfig.checkInAllowedIps}
            geofences={parseGeofences(orgConfig.checkInGeofences)}
            matchMode={parseMatchMode(orgConfig.checkInMatchMode)}
          />
        )}
        {canManageAtt && <AttendanceTrackManager members={trackable} />}
      </PageHeader>

      <div className="text-muted-foreground flex flex-wrap items-center gap-4 text-xs">
        {/* 符號說明：下載 PNG 時會整段複製進圖片，讓收到圖的人看得懂每個格子的意思。 */}
        <div
          id={ATTENDANCE_LEGEND_ID}
          className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs"
        >
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border border-emerald-300 bg-emerald-100 text-emerald-700">
              <Check className="h-3 w-3" />
            </span>
            出席
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border border-rose-300 bg-rose-100 text-rose-700">
              <X className="h-3 w-3" />
            </span>
            缺席
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-flex h-4 w-4 shrink-0 rounded-full border border-sky-400 bg-sky-100" />
            出差 / 在家工作
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-flex h-4 w-4 shrink-0 rounded border border-pink-300 bg-pink-100" />
            請假（格內顯示假別，如特休 / 事假 / 病假）
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-flex h-4 w-4 shrink-0 rounded border border-slate-200 bg-slate-100" />
            放假 / 休假
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-flex h-4 w-4 shrink-0 rounded border" />
            未記錄
          </span>
        </div>
        <span>
          {canManageAtt
            ? "· 具出勤管理權限者可點格子登記；請假 / 出差 / 在家工作 由請假簽核頁的事件自動帶入；週末預設放假，皆不列入缺席統計；打卡與補打卡審核請至「打卡 / 出勤」頁"
            : "· 出缺勤以打卡為準（唯讀）；打卡、補打卡與自己的打卡紀錄請至「打卡 / 出勤」頁；請假 / 出差請至請假簽核頁"}
          {checkInEnabled &&
            "；開啟打卡後，平日未打卡者於次日起自動標記缺席"}
        </span>
      </div>

      {!canViewAll && (
        <p className="text-muted-foreground text-xs">
          你目前只看得到自己的出勤。若需查看 / 管理全體出勤，請由管理者指派具「查看全體出勤」權限的角色（如人資）。
        </p>
      )}

      {members.length === 0 ? (
        <div className="text-muted-foreground rounded-xl border border-dashed py-16 text-center">
          {canViewAll ? (
            <>
              尚未選擇任何追蹤成員。
              <br />
              點右上「追蹤成員」勾選要記錄出席的人。
            </>
          ) : (
            <>找不到你的出勤資料。</>
          )}
        </div>
      ) : (
        <AttendanceGrid
          members={members}
          days={days}
          canManage={canManageAtt}
          leaveTypes={leaveTypes.map((lt) => ({
            id: lt.id,
            name: lt.name,
            color: lt.color,
          }))}
        />
      )}

      {/* 每人打卡時間（需「查看他人打卡時間」權限）。自己的打卡紀錄在「打卡 / 出勤」頁。 */}
      {canViewPunchTimes && memberTimecards.length > 0 && (
        <MemberTimecards members={memberTimecards} todayStr={todayStr} />
      )}

    </div>
  );
}
