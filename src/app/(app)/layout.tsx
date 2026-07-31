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
  isEligibleLeaveApprover,
  countPendingApprovalsForMember,
  getCheckInReminderFacts,
} from "@/server/queries";
import { visibleModules } from "@/lib/modules";
import { taipeiTodayUtc } from "@/lib/date";
import { AppSidebar } from "@/components/app-sidebar";
import { AppContainer } from "@/components/app-container";
import { ViewAsBanner } from "@/components/view-as-banner";
import { WhatsNew } from "@/components/whats-new";
import { PushManager } from "@/components/push-manager";
import {
  CheckInReminderProvider,
  CheckInReminderBar,
} from "@/components/checkin-reminder";
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

  const [
    users,
    notifications,
    unread,
    resolved,
    previewRoles,
    isLeaveApprover,
    pendingApprovals,
    checkInFacts,
  ] = await Promise.all([
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
      // 「請假簽核」的可見性有一半是 DB 決定的（被排進簽核流程的人），靜態模組表算不出來。
      // 側欄每頁都跑，故兩者都是輕量查詢（一個小 findMany + 一個 count）。
      isEligibleLeaveApprover(org.id, membership.id),
      countPendingApprovalsForMember(org.id, membership.id),
      // 「今天忘了打卡」提醒的今日事實。週末 / 企業沒開打卡時只花一次輕查詢就回 null。
      getCheckInReminderFacts(org.id, user.id, taipeiTodayUtc()),
    ]);

  const { access, previewing, preview, previewRoleName } = resolved;
  const moduleKeys = visibleModules(access).map((m) => m.key);
  // 請假簽核：leave.manage（HR / 管理者）已由模組表的 requiresPermission 放行；這裡再補上
  // 「被指派為簽核者」的一般成員——他們沒有 leave.manage，但頁面對他們有意義（待我簽核）。
  // 預覽他人視角時不補，否則管理者切成員工視角會看到自己的簽核分頁而失真。
  const showLeaveAsApprover =
    !previewing && (isLeaveApprover || pendingApprovals > 0);
  if (showLeaveAsApprover && !moduleKeys.includes("leave")) {
    // 插在模組表原本的位置（出席狀況之後），維持側欄順序穩定。
    const at = moduleKeys.indexOf("attendance");
    moduleKeys.splice(at >= 0 ? at + 1 : moduleKeys.length, 0, "leave");
  }
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
    // 打卡提醒的「今日事實」放在 context：側欄小圓點與內容區提示條共用同一份，
    // 兩者才不會一個說該打卡、一個說不用。預覽他人視角時不提醒（那不是你的卡）。
    <CheckInReminderProvider facts={previewing ? null : checkInFacts}>
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
          {/* 忘了打卡的細提示條：貼在內容最上方，可直接打卡或收起，不擋任何操作。 */}
          <CheckInReminderBar />
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
    </CheckInReminderProvider>
  );
}
