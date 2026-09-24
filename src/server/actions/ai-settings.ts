"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { requireActiveOrgWithRole } from "@/server/org";
import { encryptSecret, isEncryptionConfigured } from "@/server/encryption";
import { verifyGeminiKey } from "@/server/gemini";

/** 設定組織自備的 Gemini API key（先驗證可用再加密存放）。限擁有者 / 管理員。 */
export async function setOrgGeminiKey(rawKey: string) {
  const { org } = await requireActiveOrgWithRole(["OWNER", "ADMIN"]);
  const key = rawKey.trim();
  if (!key) return { ok: false as const, error: "請輸入 API key。" };
  if (!isEncryptionConfigured()) {
    return {
      ok: false as const,
      error: "伺服器尚未設定 ENCRYPTION_KEY，無法安全存放 key，請聯絡平台管理者。",
    };
  }
  const check = await verifyGeminiKey(key);
  if (!check.ok) return { ok: false as const, error: `這把 key 無法使用：${check.error}` };
  await db.organization.update({
    where: { id: org.id },
    data: { geminiApiKeyEncrypted: encryptSecret(key), geminiApiKeyLast4: key.slice(-4) },
  });
  revalidatePath("/apps");
  revalidatePath("/crm");
  revalidatePath("/foodlabel");
  revalidatePath("/meetings");
  return { ok: true as const };
}

/** 移除組織的 Gemini API key（AI 功能隨即關閉）。限擁有者 / 管理員。 */
export async function clearOrgGeminiKey() {
  const { org } = await requireActiveOrgWithRole(["OWNER", "ADMIN"]);
  await db.organization.update({
    where: { id: org.id },
    data: { geminiApiKeyEncrypted: null, geminiApiKeyLast4: null },
  });
  revalidatePath("/apps");
  revalidatePath("/crm");
  revalidatePath("/foodlabel");
  revalidatePath("/meetings");
  return { ok: true as const };
}
