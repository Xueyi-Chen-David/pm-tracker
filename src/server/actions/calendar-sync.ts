"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { requireOrgPermission } from "@/server/org";
import { displayName } from "@/lib/display";
import { eventAttendanceEffect } from "@/lib/constants";
import {
  getEffectiveServiceAccountEmail,
  isValidPrivateKeyPem,
  syncMemberAbsenceToCalendar,
} from "@/server/google-calendar";
import { encryptSecret, isEncryptionConfigured } from "@/server/encryption";

/**
 * 手動補同步：把「已核准」但是在 Google 日曆同步功能上線 / 這個組織設定日曆 ID 之前
 * 就核准的舊請假 / 出差，一次性補進日曆（新核准的請假 / 出差已經在簽核當下自動同步，
 * 不需要這顆按鈕）。同一筆重複按也不會建立重複事件——upsertCalendarEvent 用來源紀錄 id
 * 決定性推導事件 id，天生冪等。
 */
export async function backfillCalendarSync() {
  // 跟「Google 日曆同步」按鈕的顯示條件（attendance.manage 權限）對齊，見
  // setGoogleCalendarId 同樣的修正說明。
  const { org } = await requireOrgPermission("attendance.manage");

  const serviceAccount = await getEffectiveServiceAccountEmail(org.id);
  if (!serviceAccount) {
    return {
      ok: false as const,
      error: "沒有可用的 Google 服務帳戶（系統預設未設定，這個組織也沒有自訂憑證），無法同步。",
    };
  }
  const orgRow = await db.organization.findUnique({
    where: { id: org.id },
    select: { googleCalendarId: true },
  });
  if (!orgRow?.googleCalendarId?.trim()) {
    return { ok: false as const, error: "尚未設定要同步的日曆 ID，請先在上方填寫並儲存。" };
  }

  // 請假：已核准、未（軟）刪除的全部；假別名稱一次查完，避免每筆各打一次。
  const leaves = await db.leaveRequest.findMany({
    where: { organizationId: org.id, status: "APPROVED", deletedAt: null },
    select: {
      id: true,
      startDate: true,
      endDate: true,
      reason: true,
      startTime: true,
      endTime: true,
      hours: true,
      leaveTypeId: true,
      user: { select: { name: true, nickname: true, useNickname: true } },
    },
  });
  const leaveTypeIds = [...new Set(leaves.map((l) => l.leaveTypeId).filter((x): x is string => !!x))];
  const leaveTypes = leaveTypeIds.length
    ? await db.leaveType.findMany({ where: { id: { in: leaveTypeIds } }, select: { id: true, name: true } })
    : [];
  const leaveTypeName = new Map(leaveTypes.map((t) => [t.id, t.name]));

  // 出差 / 事件：已核准、且類型會影響出勤才同步（請假 / 出差 / 在家工作；外出 / 其他不同步，
  // 跟即時同步用同一個 eventAttendanceEffect() 邊界，行為一致）。
  const events = await db.memberEvent.findMany({
    where: { organizationId: org.id, status: "APPROVED" },
    select: {
      id: true,
      type: true,
      startDate: true,
      endDate: true,
      note: true,
      user: { select: { name: true, nickname: true, useNickname: true } },
    },
  });
  const relevantEvents = events.filter((e) => eventAttendanceEffect(e.type));

  let synced = 0;
  let failed = 0;

  for (const l of leaves) {
    const hourly = !!(l.startTime && l.endTime && l.hours != null);
    const typeName = l.leaveTypeId ? leaveTypeName.get(l.leaveTypeId) : undefined;
    const ok = await syncMemberAbsenceToCalendar({
      orgId: org.id,
      sourceKey: `leave:${l.id}`,
      memberName: displayName(l.user),
      typeLabel: typeName ? `請假（${typeName}）` : "請假",
      note: hourly ? `${l.startTime}–${l.endTime}${l.reason ? "・" + l.reason : ""}` : l.reason,
      startDate: l.startDate,
      endDate: hourly ? l.startDate : l.endDate,
    });
    if (ok) synced++;
    else failed++;
  }

  for (const e of relevantEvents) {
    const ok = await syncMemberAbsenceToCalendar({
      orgId: org.id,
      sourceKey: `member-event:${e.id}`,
      memberName: displayName(e.user),
      typeLabel: e.type,
      note: e.note,
      startDate: e.startDate,
      endDate: e.endDate ?? e.startDate,
    });
    if (ok) synced++;
    else failed++;
  }

  revalidatePath("/attendance");
  return {
    ok: true as const,
    total: leaves.length + relevantEvents.length,
    synced,
    failed,
  };
}

const SetServiceAccountInput = z.object({
  clientEmail: z.string().trim().max(200),
  privateKey: z.string().trim().max(10_000),
});

/**
 * 設定 / 清除這個組織自訂的 Google 服務帳戶（進階選項，見 google-calendar.ts 檔頭說明）。
 * 兩個欄位都留空＝清除、改用系統預設；否則兩個都要有值。私鑰加密後才存進資料庫。
 * 不動 googleCalendarImpersonateUser——模擬使用者是獨立設定（見 setGoogleCalendarImpersonateUser），
 * 清掉自訂服務帳戶不代表要一併清掉模擬使用者設定。
 */
export async function setGoogleCalendarServiceAccount(
  input: z.input<typeof SetServiceAccountInput>,
) {
  const { org } = await requireOrgPermission("attendance.manage");
  const d = SetServiceAccountInput.parse(input);

  if (!d.clientEmail && !d.privateKey) {
    await db.organization.update({
      where: { id: org.id },
      data: { googleCalendarClientEmail: null, googleCalendarPrivateKeyEncrypted: null },
    });
    revalidatePath("/attendance");
    return { ok: true as const };
  }
  if (!d.clientEmail || !d.privateKey) {
    return { ok: false as const, error: "服務帳戶 Email 與私鑰要嘛都填、要嘛都留空清除。" };
  }
  if (!isEncryptionConfigured()) {
    return {
      ok: false as const,
      error: "系統尚未設定加密金鑰（ENCRYPTION_KEY），無法儲存自訂服務帳戶，請洽系統管理員。",
    };
  }
  const privateKey = d.privateKey.replace(/\\n/g, "\n");
  if (!isValidPrivateKeyPem(privateKey)) {
    return { ok: false as const, error: "私鑰格式不正確，請確認貼的是完整的 PEM 私鑰內容。" };
  }

  let encrypted: string;
  try {
    encrypted = encryptSecret(privateKey);
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "加密失敗" };
  }
  await db.organization.update({
    where: { id: org.id },
    data: { googleCalendarClientEmail: d.clientEmail, googleCalendarPrivateKeyEncrypted: encrypted },
  });
  revalidatePath("/attendance");
  return { ok: true as const };
}

const SetImpersonateInput = z.object({
  impersonateUser: z.string().trim().max(200),
});

/**
 * 設定 / 清除「模擬使用者」（網域範圍委派，見 google-calendar.ts 檔頭說明）。留空＝不模擬，
 * 走原本直接分享日曆 ACL 給服務帳戶那條路。這是獨立於自訂服務帳戶的設定——即使用系統
 * 預設服務帳戶，只要該組織的 Workspace 管理員把它的用戶端 ID 授權了委派，一樣能用。
 */
export async function setGoogleCalendarImpersonateUser(
  input: z.input<typeof SetImpersonateInput>,
) {
  const { org } = await requireOrgPermission("attendance.manage");
  const d = SetImpersonateInput.parse(input);
  if (d.impersonateUser && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.impersonateUser)) {
    return { ok: false as const, error: "請輸入正確的 Email 格式。" };
  }
  await db.organization.update({
    where: { id: org.id },
    data: { googleCalendarImpersonateUser: d.impersonateUser || null },
  });
  revalidatePath("/attendance");
  return { ok: true as const };
}
