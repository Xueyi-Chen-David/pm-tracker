"use server";

import { randomBytes } from "crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/server/db";
import { requireActiveOrg } from "@/server/org";
import { emailConfigured, sendEmail } from "@/lib/email";

const EXPIRY_MS = 24 * 60 * 60 * 1000; // 驗證連結 24 小時有效

/** 找出「新信箱是否已被別的帳號使用」（不分大小寫）。 */
async function emailTakenByOther(email: string, exceptUserId: string) {
  const clash = await db.user.findFirst({
    where: {
      email: { equals: email, mode: "insensitive" },
      id: { not: exceptUserId },
    },
    select: { id: true },
  });
  return !!clash;
}

async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto =
    h.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

/**
 * 本人申請變更登入 Email：**不會立即更換**，而是寄一封含驗證連結的信到「新信箱」，
 * 點了連結才真的換（見 confirmEmailChange）。避免打錯 / 被亂改而登不進來。
 */
export async function requestEmailChange(
  newEmailRaw: string,
): Promise<{ ok?: true; error?: string; devLink?: string }> {
  const { user } = await requireActiveOrg();
  const parsed = z.string().trim().email().safeParse(newEmailRaw);
  if (!parsed.success) return { error: "Email 格式不正確。" };
  const newEmail = parsed.data.toLowerCase();

  const me = await db.user.findUnique({
    where: { id: user.id },
    select: { email: true },
  });
  if ((me?.email ?? "").toLowerCase() === newEmail) {
    return { error: "這已經是你目前的 Email 了。" };
  }
  if (await emailTakenByOther(newEmail, user.id)) {
    return { error: "此 Email 已被其他帳號使用，請改用其他 Email。" };
  }
  if (!emailConfigured() && process.env.NODE_ENV === "production") {
    return {
      error:
        "系統尚未設定寄信服務（RESEND_API_KEY），暫時無法驗證新信箱。請聯絡系統管理員設定。",
    };
  }

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + EXPIRY_MS);
  // 一人同時只保留一個待驗證請求。
  await db.$transaction([
    db.emailChangeRequest.deleteMany({ where: { userId: user.id } }),
    db.emailChangeRequest.create({
      data: { userId: user.id, newEmail, token, expiresAt },
    }),
  ]);

  const link = `${await requestOrigin()}/verify-email-change?token=${token}`;
  const { sent } = await sendEmail({
    to: newEmail,
    subject: "確認變更 Project Pulse 登入 Email",
    text: `你（或你的帳號）申請把 Project Pulse 的登入 Email 改成這個信箱。\n\n請點以下連結完成變更（24 小時內有效）：\n${link}\n\n若不是你本人操作，請忽略這封信，你的登入方式不會改變。`,
    html: `
      <div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#0f172a">
        <h2 style="font-size:18px;margin:0 0 12px">確認變更登入 Email</h2>
        <p style="font-size:14px;line-height:1.6;color:#334155">
          你（或你的帳號）申請把 <b>Project Pulse</b> 的登入 Email 改成這個信箱。
          點下方按鈕完成變更，連結 <b>24 小時內</b>有效。
        </p>
        <p style="margin:20px 0">
          <a href="${link}" style="background:#7c3aed;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px;display:inline-block">確認變更 Email</a>
        </p>
        <p style="font-size:12px;color:#64748b;line-height:1.6">
          若按鈕無法點擊，請複製這個連結貼到瀏覽器：<br>
          <span style="word-break:break-all">${link}</span>
        </p>
        <p style="font-size:12px;color:#94a3b8;margin-top:16px">
          若不是你本人操作，請忽略這封信——你的登入方式不會有任何改變。
        </p>
      </div>`,
  });

  revalidatePath("/me");
  // 未實際寄出（開發、未設定寄信服務）時，把連結回傳讓你可直接測試。
  return { ok: true, ...(sent ? {} : { devLink: link }) };
}

/**
 * 點驗證連結後：把該帳號的登入 Email 換成新信箱，並**同步更新此人在所有組織的 email 副本**
 * （一個 email 可加入多個組織）。以 token 為憑證，不需登入；只會改動申請當時的那個帳號。
 */
export async function confirmEmailChange(
  token: string,
): Promise<{ ok?: true; email?: string; error?: string }> {
  const req = await db.emailChangeRequest.findUnique({ where: { token } });
  if (!req) return { error: "驗證連結無效或已使用過。" };
  if (req.expiresAt.getTime() < Date.now()) {
    await db.emailChangeRequest
      .deleteMany({ where: { userId: req.userId } })
      .catch(() => {});
    return { error: "驗證連結已過期，請回到個人資料頁重新申請。" };
  }
  if (await emailTakenByOther(req.newEmail, req.userId)) {
    return { error: "此 Email 在申請後已被其他帳號使用，無法變更。" };
  }

  await db.$transaction([
    db.user.update({
      where: { id: req.userId },
      data: { email: req.newEmail, emailVerified: new Date() },
    }),
    // 多組織：同步此人在每個組織的 email 副本。
    db.organizationMember.updateMany({
      where: { userId: req.userId },
      data: { email: req.newEmail },
    }),
    db.emailChangeRequest.deleteMany({ where: { userId: req.userId } }),
  ]);

  return { ok: true, email: req.newEmail };
}
