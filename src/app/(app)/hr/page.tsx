import { requireManageContext } from "@/server/org";
import {
  getHrDirectory,
  getOrgRoles,
  getOrgDepartments,
  getHrMonthlyOverview,
} from "@/server/queries";
import { displayName } from "@/lib/display";
import { PageHeader } from "@/components/page-header";
import { HrWorkspace } from "@/components/hr/hr-workspace";

export const metadata = { title: "人事 · Project Pulse" };

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

export default async function HrPage({
  searchParams,
}: {
  searchParams: Promise<{ expand?: string; month?: string; tab?: string }>;
}) {
  const { org, can } = await requireManageContext();
  const { expand, month: monthParam, tab } = await searchParams;
  const now = new Date();
  const thisMonth = { year: now.getFullYear(), month: now.getMonth() + 1 };
  const { year, month } = parseMonth(monthParam, thisMonth);

  const [members, roles, departments, monthly] = await Promise.all([
    getHrDirectory(org.id),
    getOrgRoles(org.id),
    getOrgDepartments(org.id),
    getHrMonthlyOverview(org.id, year, month),
  ]);

  // 主管下拉的選項（membership id + 顯示名）。
  const managerOptions = members.map((m) => ({
    membershipId: m.membershipId,
    label: m.jobTitle ? `${displayName(m)}（${m.jobTitle}）` : displayName(m),
  }));

  const activeCount = members.filter((m) => m.active).length;
  const noHire = members.filter((m) => !m.hireDate).length;

  return (
    <div className="space-y-4">
      <PageHeader
        title="人事"
        description={`${members.length} 位成員 · 在職 ${activeCount} 位${
          noHire > 0 ? ` · ${noHire} 位未填到職日` : ""
        }`}
      />
      <HrWorkspace
        members={members}
        roles={roles.map((r) => ({ id: r.id, name: r.name, color: r.color }))}
        departments={departments}
        managerOptions={managerOptions}
        expandUserId={expand ?? null}
        canPosition={can("hr.manage_position")}
        canEmployment={can("hr.manage_employment")}
        canRoles={can("hr.manage_roles")}
        monthly={monthly}
        month={`${year}-${String(month).padStart(2, "0")}`}
        thisMonth={`${thisMonth.year}-${String(thisMonth.month).padStart(2, "0")}`}
        initialTab={tab === "overview" ? "overview" : "roster"}
      />
    </div>
  );
}
