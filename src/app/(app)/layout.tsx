import { requireActiveOrg, selfAccess } from "@/server/org";
import {
  getOrgMemberUsers,
  getNotifications,
  getUnreadNotificationCount,
} from "@/server/queries";
import { visibleModules } from "@/lib/modules";
import { AppSidebar } from "@/components/app-sidebar";
import { AppContainer } from "@/components/app-container";
import { WhatsNew } from "@/components/whats-new";
import { PushManager } from "@/components/push-manager";
import { PomodoroIndicator } from "@/components/pomodoro";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await requireActiveOrg();
  const { user, org, membership, memberships } = ctx;

  const [users, notifications, unread] = await Promise.all([
    getOrgMemberUsers(org.id),
    getNotifications(org.id, user.id, 20),
    getUnreadNotificationCount(org.id, user.id),
  ]);

  const access = selfAccess(membership);
  const moduleKeys = visibleModules(access).map((m) => m.key);
  const orgs = memberships.map((m) => ({
    id: m.organization.id,
    name: m.organization.name,
  }));
  // isBoss 現在是「每組織」欄位，從 membership 帶入顯示。
  // 頭貼改讀 DB 最新值（session 的 image 來自 JWT，上傳後在重新登入前會是舊的）。
  const freshImage =
    users.find((u) => u.id === user.id)?.image ?? user.image ?? null;
  const sidebarUser = {
    ...user,
    image: freshImage,
    isBoss: membership.isBoss,
  };

  return (
    <div className="min-h-dvh">
      <AppSidebar
        user={sidebarUser}
        users={users}
        moduleKeys={moduleKeys}
        activeOrg={{ id: org.id, name: org.name }}
        orgs={orgs}
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
        <AppContainer>{children}</AppContainer>
      </main>
      {/* 「本週更新」彈窗：全 App 掛載一次，使用者下次開網頁時自動秀出新功能。 */}
      <WhatsNew />
      {/* 桌面通知：登入後自動註冊 SW + 訂閱推播（預設開啟）。 */}
      <PushManager />
      {/* 全域番茄鐘浮動計時器（模組級 store，切頁 / 關網頁都持續倒數；進行中才顯示）。 */}
      <PomodoroIndicator />
    </div>
  );
}
