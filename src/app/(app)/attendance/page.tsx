import { requireUser } from "@/server/auth-helpers";
import { getAttendanceForDate } from "@/server/queries";
import { toDateInput } from "@/lib/date";
import { displayName, displayInitial } from "@/lib/display";
import { MemberName } from "@/components/member-name";
import { PageHeader } from "@/components/page-header";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AttendanceDateNav } from "@/components/attendance-date-nav";
import { AttendanceControls } from "@/components/attendance-controls";

export const metadata = { title: "出席狀況 · Project Pulse" };

function parseDate(s?: string): Date {
  if (s && /^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  await requireUser();
  const { date } = await searchParams;
  const selected = parseDate(date);
  const dateStr = selected.toISOString().slice(0, 10);
  const todayStr = toDateInput(new Date());
  const members = await getAttendanceForDate(selected);

  const awayCount = members.filter((m) => m.memberEvents.length > 0).length;
  const presentCount = members.length - awayCount;

  return (
    <div>
      <PageHeader
        title="出席狀況"
        description={`${dateStr} · 在勤 ${presentCount} · 不在 ${awayCount}`}
      >
        <AttendanceDateNav date={dateStr} today={todayStr} />
      </PageHeader>

      {members.length === 0 ? (
        <div className="text-muted-foreground rounded-xl border border-dashed py-16 text-center">
          尚無在職成員。
        </div>
      ) : (
        <div className="space-y-2">
          {members.map((m) => (
            <div
              key={m.id}
              className="bg-card flex items-center gap-3 rounded-xl border p-3"
            >
              <Avatar className="h-9 w-9 shrink-0">
                {m.image && <AvatarImage src={m.image} alt="" />}
                <AvatarFallback className="text-xs">
                  {displayInitial(m)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <MemberName u={m} className="text-sm font-medium" />
                {m.attendance && (
                  <div className="text-muted-foreground truncate text-xs">
                    常態：{m.attendance}
                  </div>
                )}
              </div>
              <AttendanceControls
                userId={m.id}
                name={displayName(m)}
                date={dateStr}
                events={m.memberEvents.map((e) => ({
                  id: e.id,
                  type: e.type,
                  endDate: e.endDate,
                  note: e.note,
                }))}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
