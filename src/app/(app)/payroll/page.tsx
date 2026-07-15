import { requireManageContext } from "@/server/org";
import { getPayrollOverview, getOrgLeaveTypes } from "@/server/queries";
import { PageHeader } from "@/components/page-header";
import { AttendanceMonthNav } from "@/components/attendance-month-nav";
import { PayrollWorkspace } from "@/components/payroll-workspace";

export const metadata = { title: "薪資 · Project Pulse" };

/** yyyy-MM → { year, month }；無效退回 fallback。 */
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

export default async function PayrollPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { org, can } = await requireManageContext();
  // 進得來代表已有 payroll.view（由 layout 的 requireModuleAccess 把關）。
  const canManage = can("payroll.manage");
  const canManageLeave = can("leave.manage");

  const { month: monthParam } = await searchParams;
  const now = new Date();
  const thisMonth = { year: now.getFullYear(), month: now.getMonth() + 1 };
  const { year, month } = parseMonth(monthParam, thisMonth);

  const [members, leaveTypes] = await Promise.all([
    getPayrollOverview(org.id, year, month),
    getOrgLeaveTypes(org.id),
  ]);

  const withSalary = members.filter((m) => m.salary).length;

  return (
    <div className="space-y-4">
      <PageHeader
        title="薪資"
        description={`${year} 年 ${month} 月 · ${members.length} 位在職成員，${withSalary} 位已設定薪資`}
      >
        <AttendanceMonthNav
          month={ym(year, month)}
          thisMonth={ym(thisMonth.year, thisMonth.month)}
          basePath="/payroll"
        />
      </PageHeader>

      <PayrollWorkspace
        members={members}
        leaveTypes={leaveTypes}
        canManage={canManage}
        canManageLeave={canManageLeave}
        year={year}
        month={month}
      />
    </div>
  );
}
