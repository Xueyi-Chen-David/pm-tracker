import { db } from "./db";
import { sendPushToUser } from "./push";

/**
 * 建立站內通知並同步發送桌面推播（Slack 式跳出）。
 * 站內鈴鐺一律寫入；桌面推播為 best-effort（未設 VAPID / 未訂閱則靜默略過）。
 */
export type NotifyInput = {
  orgId: string;
  userId: string;
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
};

export async function createNotification(n: NotifyInput): Promise<void> {
  await db.notification.create({
    data: {
      organizationId: n.orgId,
      userId: n.userId,
      type: n.type,
      title: n.title,
      body: n.body ?? null,
      link: n.link ?? null,
    },
  });
  await sendPushToUser(n.userId, {
    title: n.title,
    body: n.body,
    link: n.link ?? "/",
    tag: n.type,
  });
}

/** 一次建立多筆（不同收件者）站內通知 + 桌面推播。 */
export async function createNotifications(rows: NotifyInput[]): Promise<void> {
  if (rows.length === 0) return;
  await db.notification.createMany({
    data: rows.map((n) => ({
      organizationId: n.orgId,
      userId: n.userId,
      type: n.type,
      title: n.title,
      body: n.body ?? null,
      link: n.link ?? null,
    })),
  });
  await Promise.all(
    rows.map((n) =>
      sendPushToUser(n.userId, {
        title: n.title,
        body: n.body,
        link: n.link ?? "/",
        tag: n.type,
      }),
    ),
  );
}
