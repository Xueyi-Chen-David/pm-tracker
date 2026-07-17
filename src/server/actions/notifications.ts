"use server";

import { db } from "@/server/db";
import { requireActiveOrg } from "@/server/org";

/**
 * 取得本人「在 since 之後新建、且未讀」的通知（給前端輪詢做 Slack 式即時彈窗）。
 * 只回少量欄位，最多 10 筆。
 */
export async function getRecentUnreadNotifications(sinceIso: string) {
  const { user, org } = await requireActiveOrg();
  const since = new Date(sinceIso);
  if (isNaN(since.getTime())) return [];
  const rows = await db.notification.findMany({
    where: {
      userId: user.id,
      organizationId: org.id,
      read: false,
      createdAt: { gt: since },
    },
    orderBy: { createdAt: "asc" },
    take: 10,
    select: { id: true, title: true, body: true, link: true, createdAt: true },
  });
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}

/** 將某則通知標為已讀（僅限本人的通知）。 */
export async function markNotificationRead(id: string) {
  const { user, org } = await requireActiveOrg();
  await db.notification.updateMany({
    where: { id, userId: user.id, organizationId: org.id },
    data: { read: true },
  });
}

/** 將目前組織內、本人的所有通知標為已讀。 */
export async function markAllNotificationsRead() {
  const { user, org } = await requireActiveOrg();
  await db.notification.updateMany({
    where: { userId: user.id, organizationId: org.id, read: false },
    data: { read: true },
  });
}
