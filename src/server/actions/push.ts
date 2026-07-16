"use server";

import { z } from "zod";
import { db } from "@/server/db";
import { requireUser } from "@/server/auth-helpers";

// 瀏覽器推播訂閱的儲存 / 移除。以「目前登入者」收斂。

const SubscriptionInput = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
  userAgent: z.string().max(400).optional(),
});

/** 儲存 / 更新這個瀏覽器的推播訂閱（同 endpoint 覆蓋，並改綁到目前使用者）。 */
export async function savePushSubscription(
  input: z.input<typeof SubscriptionInput>,
) {
  const user = await requireUser();
  const d = SubscriptionInput.parse(input);
  await db.pushSubscription.upsert({
    where: { endpoint: d.endpoint },
    update: {
      userId: user.id,
      p256dh: d.keys.p256dh,
      auth: d.keys.auth,
      userAgent: d.userAgent ?? null,
    },
    create: {
      userId: user.id,
      endpoint: d.endpoint,
      p256dh: d.keys.p256dh,
      auth: d.keys.auth,
      userAgent: d.userAgent ?? null,
    },
  });
  return { ok: true as const };
}

/** 移除這個瀏覽器的推播訂閱（關閉桌面通知時）。 */
export async function removePushSubscription(endpoint: string) {
  const user = await requireUser();
  await db.pushSubscription.deleteMany({ where: { endpoint, userId: user.id } });
  return { ok: true as const };
}
