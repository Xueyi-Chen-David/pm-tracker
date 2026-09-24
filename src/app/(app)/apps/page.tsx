import { db } from "@/server/db";
import { requireManageContext } from "@/server/org";
import { groupedInstallableModules, INSTALLABLE_MODULES } from "@/lib/modules";
import { PageHeader } from "@/components/page-header";
import { AppsManager } from "@/components/apps-manager";
import { AiSettingsCard } from "@/components/ai-settings-card";
import { getAiSettingsSummary, getOrgMemberUsers } from "@/server/queries";
import { displayName } from "@/lib/display";
import { taipeiTodayUtc } from "@/lib/date";

export const metadata = { title: "應用程式 · Project Pulse" };

export default async function AppsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { org, canManage } = await requireManageContext();
  const sp = await searchParams;
  // AI 用量的月份（台灣時間）；?month=yyyy-MM，沒帶或格式不對就看本月。
  const thisMonth = taipeiTodayUtc().toISOString().slice(0, 7);
  const month = sp.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.month) ? sp.month : thisMonth;

  const [rows, aiSummary, members] = await Promise.all([
    db.organizationModule.findMany({
      where: { organizationId: org.id },
      select: { moduleKey: true, enabled: true },
    }),
    getAiSettingsSummary(org.id, month),
    getOrgMemberUsers(org.id),
  ]);
  const memberNames = Object.fromEntries(members.map((u) => [u.id, displayName(u)]));
  const stateByKey = new Map(rows.map((r) => [r.moduleKey, r]));

  const groups = groupedInstallableModules().map((g) => ({
    category: g.category,
    modules: g.modules.map((m) => {
      const row = stateByKey.get(m.key);
      return {
        key: m.key,
        label: m.label,
        href: m.href,
        description: m.description ?? "",
        dependsOn: m.dependsOn ?? [],
        status: !row
          ? ("uninstalled" as const)
          : row.enabled
            ? ("enabled" as const)
            : ("disabled" as const),
      };
    }),
  }));

  const enabledCount = rows.filter((r) => r.enabled).length;

  return (
    <div>
      <PageHeader
        title="應用程式"
        description={`本組織已啟用 ${enabledCount} / ${INSTALLABLE_MODULES.length} 個應用程式。安裝後還要在「團隊 → 角色」決定哪些成員看得到。`}
      />
      <AiSettingsCard
        summary={aiSummary}
        canManage={canManage}
        memberNames={memberNames}
        thisMonth={thisMonth}
      />
      <AppsManager groups={groups} canManage={canManage} />
    </div>
  );
}
