import {
  requireActiveOrg,
  getViewAsEmployee,
  effectiveAccess,
  isManagerOrBoss,
} from "@/server/org";
import {
  getOrgMemberUsers,
  getNotifications,
  getUnreadNotificationCount,
} from "@/server/queries";
import { visibleModules } from "@/lib/modules";
import { AppSidebar } from "@/components/app-sidebar";
import { ViewAsBanner } from "@/components/view-as-banner";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, org, membership, memberships } = await requireActiveOrg();
  const [users, notifications, unread, previewEmployee] = await Promise.all([
    getOrgMemberUsers(org.id),
    getNotifications(org.id, user.id, 20),
    getUnreadNotificationCount(org.id, user.id),
    getViewAsEmployee(),
  ]);

  // 真實身分是否為管理者 / 老闆（決定是否顯示「員工視角」切換）。
  const manager = isManagerOrBoss(membership);
  // 有效存取：預覽員工視角時降級成一般員工，側欄模組跟著變。
  const access = effectiveAccess(membership, previewEmployee);
  const previewing = previewEmployee && manager;
  const moduleKeys = visibleModules(access).map((m) => m.key);
  const orgs = memberships.map((m) => ({
    id: m.organization.id,
    name: m.organization.name,
  }));
  // isBoss 現在是「每組織」欄位，從 membership 帶入顯示（預覽員工視角時隱藏「老闆」標記）。
  const sidebarUser = { ...user, isBoss: previewing ? false : membership.isBoss };

  return (
    <div className="min-h-dvh">
      <AppSidebar
        user={sidebarUser}
        users={users}
        moduleKeys={moduleKeys}
        activeOrg={{ id: org.id, name: org.name }}
        orgs={orgs}
        canPreviewAsEmployee={manager}
        previewingAsEmployee={previewing}
        notifications={notifications.map((n) => ({
          id: n.id,
          title: n.title,
          body: n.body,
          link: n.link,
          read: n.read,
          createdAt: n.createdAt,
        }))}
        unread={unread}
      />
      <main className="lg:pl-60">
        {previewing && <ViewAsBanner />}
        <div className="mx-auto w-full max-w-[90rem] px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </div>
      </main>
    </div>
  );
}
