import webpush from "web-push";
import { db } from "./db";

// ─────────────────────────────────────────────────────────────
// Web Push（桌面通知）。未設定 VAPID 金鑰時整組靜默停用——站內鈴鐺照常，
// 只是不發瀏覽器推播。避免本機 / 未設定環境噴錯。
// ─────────────────────────────────────────────────────────────

let configured: boolean | null = null;

function ensureConfigured(): boolean {
  if (configured !== null) return configured;
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) {
    configured = false;
    return false;
  }
  const subject = process.env.VAPID_SUBJECT?.trim() || "mailto:admin@example.com";
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

/** 是否已啟用 Web Push（VAPID 金鑰齊全）。 */
export function pushEnabled(): boolean {
  return ensureConfigured();
}

export type PushPayload = {
  title: string;
  body?: string | null;
  link?: string | null;
  /** 相同 tag 的通知會互相取代（例如同一任務的提醒）。 */
  tag?: string;
};

/** 發送推播給某使用者的所有裝置（best-effort）；失效訂閱（404/410）自動清除。 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
): Promise<void> {
  if (!ensureConfigured()) return;
  const subs = await db.pushSubscription.findMany({ where: { userId } });
  if (subs.length === 0) return;
  const body = JSON.stringify({
    title: payload.title,
    body: payload.body ?? "",
    link: payload.link ?? "/",
    tag: payload.tag,
  });
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
        );
      } catch (e) {
        const code = (e as { statusCode?: number })?.statusCode;
        if (code === 404 || code === 410) {
          // 訂閱已失效（使用者移除授權 / 端點過期）→ 刪除。
          await db.pushSubscription
            .delete({ where: { id: s.id } })
            .catch(() => {});
        }
      }
    }),
  );
}

/** 一次發送多筆（每筆帶各自 userId），供批次通知（如到期提醒）使用。 */
export async function sendPushMany(
  rows: (PushPayload & { userId: string })[],
): Promise<void> {
  if (!ensureConfigured() || rows.length === 0) return;
  await Promise.all(
    rows.map((r) =>
      sendPushToUser(r.userId, {
        title: r.title,
        body: r.body,
        link: r.link,
        tag: r.tag,
      }),
    ),
  );
}
