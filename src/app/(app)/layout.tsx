import {
  requireActiveOrg,
  resolveAccess,
  isManagerOrBoss,
} from "@/server/org";
import { db } from "@/server/db";
import {
  getOrgMemberUsers,
  getNotifications,
  getUnreadNotificationCount,
} from "@/server/queries";
import { visibleModules } from "@/lib/modules";
import { AppSidebar } from "@/components/app-sidebar";
import { AppContainer } from "@/components/app-container";
import { ViewAsBanner } from "@/components/view-as-banner";
import { WhatsNew } from "@/components/whats-new";
import { PushManager } from "@/components/push-manager";
import { NotificationWatcher } from "@/components/notification-watcher";
import { PomodoroIndicator } from "@/components/pomodoro";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await requireActiveOrg();
  const { user, org, membership, memberships } = ctx;

  // 真實身分是否為管理者 / 老闆（決定是否顯示「視角預覽」選單）。
  const manager = isManagerOrBoss(membership);

  const [users, notifications, unread, resolved, previewRoles] =
    await Promise.all([
      getOrgMemberUsers(org.id),
      getNotifications(org.id, user.id, 20),
      getUnreadNotificationCount(org.id, user.id),
      resolveAccess(ctx),
      // 視角預覽選單的角色清單（僅管理者需要）。
      manager
        ? db.orgRoleDef.findMany({
            where: { organizationId: org.id },
            select: { id: true, name: true, color: true },
            orderBy: { sortOrder: "asc" },
          })
        : Promise.resolve([]),
    ]);

  const { access, previewing, preview, previewRoleName } = resolved;
  const moduleKeys = visibleModules(access).map((m) => m.key);
  const orgs = memberships.map((m) => ({
    id: m.organization.id,
    name: m.organization.name,
  }));
  // isBoss 現在是「每組織」欄位，從 membership 帶入顯示（預覽時隱藏「老闆」標記）。
  // 頭貼改讀 DB 最新值（session 的 image 來自 JWT，上傳後在重新登入前會是舊的）。
  const freshImage =
    users.find((u) => u.id === user.id)?.image ?? user.image ?? null;
  const sidebarUser = {
    ...user,
    image: freshImage,
    isBoss: previewing ? false : membership.isBoss,
  };
  // 目前預覽對象的值（給選單標示 active）：self→null、employee→"employee"、role→"role:<id>"。
  const previewValue =
    preview.mode === "role"
      ? `role:${preview.roleId}`
      : preview.mode === "employee"
        ? "employee"
        : null;

  return (
    <div className="min-h-dvh">
      <AppSidebar
        user={sidebarUser}
        users={users}
        moduleKeys={moduleKeys}
        activeOrg={{ id: org.id, name: org.name }}
        orgs={orgs}
        canPreview={manager}
        previewRoles={previewRoles}
        previewValue={previewValue}
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
        {previewing && (
          <ViewAsBanner
            role={preview.mode === "role" ? previewRoleName : undefined}
          />
        )}
        <AppContainer>{children}</AppContainer>
      </main>
      {/* 「本週更新」彈窗：全 App 掛載一次，使用者下次開網頁時自動秀出新功能。 */}
      <WhatsNew />
      {/* 桌面通知：登入後自動註冊 SW + 訂閱推播（預設開啟）。 */}
      <PushManager />
      {/* 站內即時彈窗：分頁開著時，新通知以 toast 跳出（Slack 式）。 */}
      <NotificationWatcher />
      {/* 全域番茄鐘浮動計時器（模組級 store，切頁 / 關網頁都持續倒數；進行中才顯示）。 */}
      <PomodoroIndicator />
    </div>
  );
}
