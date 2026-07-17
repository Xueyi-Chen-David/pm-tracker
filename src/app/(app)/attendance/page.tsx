import { requireManageContext } from "@/server/org";
import { db } from "@/server/db";
import {
  getAttendanceMonth,
  getSelfAttendanceMonth,
  getTrackableMembers,
  getOrgLeaveTypes,
  getMyCheckInCorrections,
  getPendingCheckInCorrections,
} from "@/server/queries";
import { parseGeofences, parseMatchMode } from "@/lib/checkin";
import { todayUtc } from "@/lib/date";
import { PageHeader } from "@/components/page-header";
import {
  AttendanceGrid,
  type GridDay,
  type GridMember,
} from "@/components/attendance-grid";
import { AttendanceMonthNav } from "@/components/attendance-month-nav";
import { AttendanceTrackManager } from "@/components/attendance-track-manager";
import { AttendanceExportButton } from "@/components/attendance-export-button";
import {
  AttendanceExportPngButton,
  ATTENDANCE_LEGEND_ID,
} from "@/components/attendance-export-png-button";
import { CheckInSettings } from "@/components/check-in-settings";
import {
  AttendanceTimecard,
  type TimecardDay,
} from "@/components/attendance-timecard";
import { CheckInCorrections } from "@/components/checkin-corrections";

export const metadata = { title: "出席狀況 · Project Pulse" };

const WEEKDAY_LABEL = ["日", "一", "二", "三", "四", "五", "六"];

/** yyyy-MM → { year, month(1-12) }；無效則回退到指定的預設。 */
function parseMonth(
  s: string | undefined,
  fallback: { year: number; month: number },
) {
  if (s && /^\d{4}-\d{2}$/.test(s)) {
    const [y, m] = s.split("-").map(Number);
    if (y && m >= 1 && m <= 12) return { year: y, month: m };
  }
  return fallback;
}

function ym(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

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
  const { month: monthParam } = await searchParams;

  const now = new Date();
  const thisMonth = { year: now.getFullYear(), month: now.getMonth() + 1 };
  const { year, month } = parseMonth(monthParam, thisMonth);

  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1)); // 下月一號（不含）
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  const days: GridDay[] = Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1;
    const d = new Date(Date.UTC(year, month - 1, day));
    const weekday = d.getUTCDay();
    return {
      day,
      dateStr: `${ym(year, month)}-${String(day).padStart(2, "0")}`,
      weekday,
      weekend: weekday === 0 || weekday === 6,
      label: `${month}/${day}（${WEEKDAY_LABEL[weekday]}）`,
    };
  });

  const [rows, trackable, leaveTypes, orgConfig, firstCheckIn, myCheckIns] =
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
      // 個人「打卡紙」：本人本月的所有打卡（依實際時間排序）。
      db.checkIn.findMany({
        where: {
          organizationId: org.id,
          userId: user.id,
          date: { gte: start, lt: end },
        },
        orderBy: { at: "asc" },
        select: { date: true, at: true, kind: true, method: true },
      }),
    ]);

  // 補打卡：本人近期申請 + （管理者）待審核清單。
  const [myCorrections, pendingCorrections] = await Promise.all([
    getMyCheckInCorrections(org.id, user.id),
    canManageAtt
      ? getPendingCheckInCorrections(org.id)
      : Promise.resolve(null),
  ]);

  // 自動缺席規則：企業有開打卡、且某平日落在 [第一次打卡日, 今天) 之間、
  // 該成員當天完全沒有出席紀錄（沒打卡 / 請假 / 手動 / 出差）→ 視為缺席（未打卡）。
  // 純顯示層，不寫入資料庫；手動 / 打卡 / 事件產生的紀錄一律優先。
  const checkInEnabled = orgConfig?.checkInEnabled ?? false;
  const anchorStr = firstCheckIn
    ? firstCheckIn.date.toISOString().slice(0, 10)
    : null;
  const todayStr = todayUtc().toISOString().slice(0, 10);
  const autoAbsentEnabled = checkInEnabled && anchorStr !== null;

  const members: GridMember[] = rows.map((m) => {
    const marks: GridMember["marks"] = {};
    for (const r of m.attendanceRecords) {
      const ds = r.date.toISOString().slice(0, 10);
      marks[ds] = {
        present: r.present,
        reason: r.reason,
        offsite: r.offsite,
        holiday: r.holiday,
        leave: r.leave,
        leaveTypeName: r.leaveType?.name ?? null,
      };
    }
    if (autoAbsentEnabled) {
      for (const d of days) {
        if (d.weekend) continue; // 週末不判缺席
        if (d.dateStr >= todayStr) continue; // 今天與未來先不動（還可補打卡）
        if (anchorStr && d.dateStr < anchorStr) continue; // 打卡導入前不追溯
        if (marks[d.dateStr]) continue; // 已有紀錄者一律優先
        marks[d.dateStr] = {
          present: false,
          reason: "未打卡",
          offsite: false,
          holiday: false,
          leave: false,
          leaveTypeName: null,
        };
      }
    }
    return {
      id: m.id,
      name: m.name,
      nickname: m.nickname,
      useNickname: m.useNickname,
      email: m.email,
      image: m.image,
      isBoss: m.isBoss,
      marks,
    };
  });

  // 個人打卡紙：把本人本月打卡依日期彙整（最早上班 / 最晚下班），只列到今天為止。
  const punchesByDate = new Map<
    string,
    { at: Date; kind: string; method: string | null }[]
  >();
  for (const c of myCheckIns) {
    const ds = c.date.toISOString().slice(0, 10);
    const arr = punchesByDate.get(ds) ?? [];
    arr.push(c);
    punchesByDate.set(ds, arr);
  }
  const timecardDays: TimecardDay[] = days
    .filter((d) => d.dateStr <= todayStr)
    .map((d) => {
      const punches = punchesByDate.get(d.dateStr) ?? [];
      const ins = punches.filter((p) => p.kind === "in");
      const outs = punches.filter((p) => p.kind === "out");
      const firstIn = ins[0];
      const lastOut = outs[outs.length - 1];
      return {
        day: d.day,
        dateStr: d.dateStr,
        weekday: d.weekday,
        weekend: d.weekend,
        inAt: firstIn?.at.toISOString() ?? null,
        outAt: lastOut?.at.toISOString() ?? null,
        inMethod: firstIn?.method ?? null,
        outMethod: lastOut?.method ?? null,
      };
    });
  const showTimecard = checkInEnabled || myCheckIns.length > 0;

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
          className="text-muted-foreground flex flex-wrap items-center gap-4 text-xs"
        >
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-flex h-4 w-4 items-center justify-center rounded border border-emerald-300 bg-emerald-100" />
            出席
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-flex h-4 w-4 items-center justify-center rounded border border-rose-300 bg-rose-100" />
            缺席
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-sky-400 bg-sky-100 text-[8px] text-sky-700">
              出差
            </span>
            在外工作（格內顯示出差 / 在家）
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-flex h-4 w-4 items-center justify-center rounded border">
              ·
            </span>
            未記錄
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-flex h-4 w-4 items-center justify-center rounded border border-slate-200 bg-slate-100 text-[9px] text-slate-500">
              休
            </span>
            放假 / 休假
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-flex h-4 w-4 items-center justify-center rounded border border-pink-300 bg-pink-100 text-[8px] text-pink-700">
              事假
            </span>
            請假（格內顯示假別，如特休 / 事假 / 病假）
          </span>
        </div>
        <span>
          {canManageAtt
            ? "· 具出勤管理權限者可點格子登記；請假 / 出差 / 在家工作 由請假簽核頁的事件自動帶入；週末預設放假，皆不列入缺席統計"
            : "· 出缺勤以打卡為準（唯讀）；忘記打卡請用下方「補打卡」申請；請假 / 出差請至請假簽核頁"}
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

      {showTimecard && (
        <AttendanceTimecard days={timecardDays} todayStr={todayStr} />
      )}

      <CheckInCorrections
        mine={myCorrections}
        pending={pendingCorrections}
        canReview={canManageAtt}
      />
    </div>
  );
}
