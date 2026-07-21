"use server";

import { randomBytes } from "crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/server/db";
import { requireActiveOrg } from "@/server/org";
import { emailConfigured, sendEmail } from "@/lib/email";

const EXPIRY_MS = 24 * 60 * 60 * 1000; // 驗證連結 24 小時有效

async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto =
    h.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

/**
 * 申請變更「目前這個組織」使用的 Email：**不會立即更換**，而是寄一封含驗證連結的信到
 * 「新信箱」，驗證後只更新該組織的成員 email（見 confirmEmailChange）。不動全域登入身分、
 * 不影響此人在其他組織的 email。避免打錯而收不到組織通知，或被亂改。
 */
export async function requestEmailChange(
  newEmailRaw: string,
): Promise<{ ok?: true; error?: string; devLink?: string }> {
  const { user, org } = await requireActiveOrg();
  const parsed = z.string().trim().email().safeParse(newEmailRaw);
  if (!parsed.success) return { error: "Email 格式不正確。" };
  const newEmail = parsed.data.toLowerCase();

  const membership = await db.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: org.id, userId: user.id } },
    select: { email: true },
  });
  if (!membership) return { error: "找不到你在此組織的成員資料。" };
  if ((membership.email ?? "").toLowerCase() === newEmail) {
    return { error: "這已經是你在此組織使用的 Email 了。" };
  }
  if (!emailConfigured() && process.env.NODE_ENV === "production") {
    return {
      error:
        "系統尚未設定寄信服務（RESEND_API_KEY），暫時無法驗證新信箱。請聯絡系統管理員設定。",
    };
  }

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + EXPIRY_MS);
  // 同一組織、同一人同時只保留一個待驗證請求。
  await db.$transaction([
    db.emailChangeRequest.deleteMany({
      where: { userId: user.id, organizationId: org.id },
    }),
    db.emailChangeRequest.create({
      data: { userId: user.id, organizationId: org.id, newEmail, token, expiresAt },
    }),
  ]);

  const link = `${await requestOrigin()}/verify-email-change?token=${token}`;
  const { sent } = await sendEmail({
    to: newEmail,
    subject: `確認變更 ${org.name} 使用的 Email`,
    text: `你申請把在「${org.name}」使用的 Email 改成這個信箱。\n\n請點以下連結完成變更（24 小時內有效）：\n${link}\n\n此變更只影響「${org.name}」，不會改變你的登入方式，也不影響你的其他組織。若不是你本人操作，請忽略這封信。`,
    html: `
      <div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#0f172a">
        <h2 style="font-size:18px;margin:0 0 12px">確認變更 Email</h2>
        <p style="font-size:14px;line-height:1.6;color:#334155">
          你申請把在 <b>${org.name}</b> 使用的 Email 改成這個信箱。
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
 * 點驗證連結後：只更新「該組織」的成員 email（OrganizationMember.email）。
 * **不動全域登入身分 User.email，也不影響此人的其他組織。**
 * 以 token 為憑證，不需登入；只會改動申請當時的那個組織成員資料。
 */
export async function confirmEmailChange(
  token: string,
): Promise<{ ok?: true; email?: string; error?: string }> {
  const req = await db.emailChangeRequest.findUnique({ where: { token } });
  if (!req) return { error: "驗證連結無效或已使用過。" };
  if (req.expiresAt.getTime() < Date.now()) {
    await db.emailChangeRequest.delete({ where: { id: req.id } }).catch(() => {});
    return { error: "驗證連結已過期，請回到個人資料頁重新申請。" };
  }

  const res = await db.organizationMember.updateMany({
    where: { userId: req.userId, organizationId: req.organizationId },
    data: { email: req.newEmail },
  });
  if (res.count === 0) {
    await db.emailChangeRequest.delete({ where: { id: req.id } }).catch(() => {});
    return { error: "找不到對應的組織成員資料，變更未完成。" };
  }
  // 清掉同組織的其他待驗證請求。
  await db.emailChangeRequest.deleteMany({
    where: { userId: req.userId, organizationId: req.organizationId },
  });

  return { ok: true, email: req.newEmail };
}
