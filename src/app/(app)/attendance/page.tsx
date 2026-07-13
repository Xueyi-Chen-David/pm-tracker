import { requireActiveOrg, canManageMembers } from "@/server/org";
import { db } from "@/server/db";
import { getAttendanceMonth, getTrackableMembers } from "@/server/queries";
import { parseGeofences } from "@/lib/checkin";
import { PageHeader } from "@/components/page-header";
import {
  AttendanceGrid,
  type GridDay,
  type GridMember,
} from "@/components/attendance-grid";
import { AttendanceMonthNav } from "@/components/attendance-month-nav";
import { AttendanceTrackManager } from "@/components/attendance-track-manager";
import { CheckInSettings } from "@/components/check-in-settings";

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
  const { org, membership } = await requireActiveOrg();
  const canManage = canManageMembers(membership.role);
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

  const [rows, trackable, orgConfig] = await Promise.all([
    getAttendanceMonth(org.id, start, end),
    getTrackableMembers(org.id),
    canManage
      ? db.organization.findUnique({
          where: { id: org.id },
          select: {
            checkInEnabled: true,
            checkInAllowedIps: true,
            checkInGeofences: true,
          },
        })
      : Promise.resolve(null),
  ]);

  const members: GridMember[] = rows.map((m) => {
    const marks: GridMember["marks"] = {};
    for (const r of m.attendanceRecords) {
      const ds = r.date.toISOString().slice(0, 10);
      marks[ds] = { present: r.present, reason: r.reason, offsite: r.offsite };
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

  return (
    <div className="space-y-4">
      <PageHeader
        title="出席狀況"
        description={`${year} 年 ${month} 月 · 追蹤 ${members.length} 位成員`}
      >
        <AttendanceMonthNav
          month={ym(year, month)}
          thisMonth={ym(thisMonth.year, thisMonth.month)}
        />
        {canManage && orgConfig && (
          <CheckInSettings
            enabled={orgConfig.checkInEnabled}
            allowedIps={orgConfig.checkInAllowedIps}
            geofences={parseGeofences(orgConfig.checkInGeofences)}
          />
        )}
        <AttendanceTrackManager members={trackable} />
      </PageHeader>

      <div className="text-muted-foreground flex flex-wrap items-center gap-4 text-xs">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-flex h-4 w-4 items-center justify-center rounded border border-emerald-300 bg-emerald-100" />
          出席
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-flex h-4 w-4 items-center justify-center rounded border border-rose-300 bg-rose-100" />
          缺席
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-sky-400 bg-sky-100" />
          出差 / 在家工作
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-flex h-4 w-4 items-center justify-center rounded border">
            ·
          </span>
          未記錄
        </span>
        <span>· 點格子登記；請假 / 出差 / 在家工作 由團隊成員頁的事件自動帶入</span>
      </div>

      {members.length === 0 ? (
        <div className="text-muted-foreground rounded-xl border border-dashed py-16 text-center">
          尚未選擇任何追蹤成員。<br />
          點右上「追蹤成員」勾選要記錄出席的人。
        </div>
      ) : (
        <AttendanceGrid members={members} days={days} />
      )}
    </div>
  );
}
