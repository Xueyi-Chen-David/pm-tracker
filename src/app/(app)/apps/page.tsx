import { db } from "@/server/db";
import { requireManageContext } from "@/server/org";
import { groupedInstallableModules, INSTALLABLE_MODULES } from "@/lib/modules";
import { PageHeader } from "@/components/page-header";
import { AppsManager } from "@/components/apps-manager";

export const metadata = { title: "應用程式 · Project Pulse" };

export default async function AppsPage() {
  const { org, canManage } = await requireManageContext();

  const rows = await db.organizationModule.findMany({
    where: { organizationId: org.id },
    select: { moduleKey: true, enabled: true },
  });
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
      <AppsManager groups={groups} canManage={canManage} />
    </div>
  );
}
