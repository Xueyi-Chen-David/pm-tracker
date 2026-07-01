import { requireActiveOrg } from "@/server/org";
import { getOrgMemberUsers } from "@/server/queries";
import { visibleModules } from "@/lib/modules";
import { AppSidebar } from "@/components/app-sidebar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, org, membership, memberships } = await requireActiveOrg();
  const users = await getOrgMemberUsers(org.id);

  // 依「目前組織」的 membership 決定側欄要顯示哪些模組。
  const moduleKeys = visibleModules(membership).map((m) => m.key);
  const orgs = memberships.map((m) => ({
    id: m.organization.id,
    name: m.organization.name,
  }));
  // isBoss 現在是「每組織」欄位，從 membership 帶入顯示。
  const sidebarUser = { ...user, isBoss: membership.isBoss };

  return (
    <div className="min-h-dvh">
      <AppSidebar
        user={sidebarUser}
        users={users}
        moduleKeys={moduleKeys}
        activeOrg={{ id: org.id, name: org.name }}
        orgs={orgs}
      />
      <main className="lg:pl-60">
        <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </div>
      </main>
    </div>
  );
}
