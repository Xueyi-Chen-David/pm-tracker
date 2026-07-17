import { requireManageContext } from "@/server/org";
import {
  getPayrollOverview,
  getOrgLeaveTypes,
  getPayrollSetting,
  getInsuranceBrackets,
  getSalaryItemDefs,
} from "@/server/queries";
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

  const [members, leaveTypes, setting, brackets, salaryItems] =
    await Promise.all([
      getPayrollOverview(org.id, year, month),
      getOrgLeaveTypes(org.id),
      getPayrollSetting(org.id),
      getInsuranceBrackets(org.id),
      getSalaryItemDefs(org.id),
    ]);

  const withSalary = members.filter((m) => m.salary).length;

  return (
    // 填滿視窗高度（扣掉 AppContainer 的 py-6 ＝ 3rem）：表格框自動吃掉剩餘空間，
    // 分頁列才會貼近底部而不是被固定的 60vh 卡在半空中。用 min-h 而非 h，
    // 內容真的更高時（例：勞健保設定的長表單）版面照常往下長、頁面正常捲動。
    <div className="flex min-h-[calc(100dvh-3rem)] flex-col space-y-4">
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
        setting={setting}
        brackets={brackets}
        salaryItems={salaryItems}
        canManage={canManage}
        canManageLeave={canManageLeave}
        year={year}
        month={month}
      />
    </div>
  );
}
