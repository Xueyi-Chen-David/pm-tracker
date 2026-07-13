"use server";

import { db } from "@/server/db";
import { requireActiveOrg } from "@/server/org";

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
