"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { requireActiveOrgWithRole } from "@/server/org";
import {
  DEFAULT_INSTALLED_MODULES,
  INSTALLABLE_MODULES,
  getModule,
  type ModuleKey,
} from "@/lib/modules";

/**
 * 應用程式（模組）的安裝 / 停用。組織層的操作，一律需要 OWNER / ADMIN。
 *
 * 三種狀態（見 OrganizationModule 的說明）：
 *   未安裝（無資料列）→ 已啟用（enabled=true）→ 已停用（enabled=false）
 *
 * 「移除安裝」只刪這一列，**不會**刪掉模組自己的資料（商品、轉換紀錄…）——
 * 誤按不會造成資料損失，重新安裝即回復。真的要清資料是另一件事，需另外設計。
 */

const INSTALLABLE_KEYS = INSTALLABLE_MODULES.map((m) => m.key) as [
  ModuleKey,
  ...ModuleKey[],
];

const ModuleKeyInput = z.enum(INSTALLABLE_KEYS, {
  message: "未知的模組，或該模組是核心模組（不可安裝／停用）。",
});

export type ModuleActionResult = { ok: true } | { ok: false; error: string };

/** 安裝模組（已安裝過但停用者＝重新啟用）。 */
export async function installModule(
  rawKey: string,
): Promise<ModuleActionResult> {
  const { org, user } = await requireActiveOrgWithRole(["OWNER", "ADMIN"]);
  const parsed = ModuleKeyInput.safeParse(rawKey);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "資料格式錯誤" };
  }
  const key = parsed.data;

  // 相依模組：缺了就先擋下來並說清楚要先裝什麼（目前尚無模組宣告相依，保留機制）。
  const mod = getModule(key);
  if (mod?.dependsOn?.length) {
    const installed = await db.organizationModule.findMany({
      where: { organizationId: org.id, enabled: true },
      select: { moduleKey: true },
    });
    const have = new Set(installed.map((r) => r.moduleKey));
    const missing = mod.dependsOn.filter((d) => !have.has(d));
    if (missing.length > 0) {
      const names = missing.map((d) => getModule(d)?.label ?? d).join("、");
      return { ok: false, error: `請先安裝相依模組：${names}。` };
    }
  }

  await db.organizationModule.upsert({
    where: { organizationId_moduleKey: { organizationId: org.id, moduleKey: key } },
    create: {
      organizationId: org.id,
      moduleKey: key,
      enabled: true,
      installedById: user.id,
    },
    update: { enabled: true },
  });
  revalidateModuleUi();
  return { ok: true };
}

/** 停用已安裝的模組（保留資料與安裝紀錄，只是進不去）。 */
export async function setModuleEnabled(
  rawKey: string,
  enabled: boolean,
): Promise<ModuleActionResult> {
  const { org } = await requireActiveOrgWithRole(["OWNER", "ADMIN"]);
  const parsed = ModuleKeyInput.safeParse(rawKey);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "資料格式錯誤" };
  }
  // updateMany + organizationId 條件＝縱深防禦（擋跨組織操作）。
  const res = await db.organizationModule.updateMany({
    where: { organizationId: org.id, moduleKey: parsed.data },
    data: { enabled },
  });
  if (res.count === 0) return { ok: false, error: "這個模組尚未安裝。" };
  revalidateModuleUi();
  return { ok: true };
}

/** 移除安裝（刪除安裝紀錄；模組自己的資料保留）。 */
export async function uninstallModule(
  rawKey: string,
): Promise<ModuleActionResult> {
  const { org } = await requireActiveOrgWithRole(["OWNER", "ADMIN"]);
  const parsed = ModuleKeyInput.safeParse(rawKey);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "資料格式錯誤" };
  }
  await db.organizationModule.deleteMany({
    where: { organizationId: org.id, moduleKey: parsed.data },
  });
  revalidateModuleUi();
  return { ok: true };
}

/**
 * 新組織的預設安裝清單。由建立組織的流程呼叫。
 * 垂直應用（食品標示等）預設不裝，交由管理員自己決定。
 */
export async function installDefaultModules(
  organizationId: string,
  installedById?: string,
): Promise<void> {
  await db.organizationModule.createMany({
    data: DEFAULT_INSTALLED_MODULES.map((moduleKey) => ({
      organizationId,
      moduleKey,
      enabled: true,
      installedById: installedById ?? null,
    })),
    skipDuplicates: true,
  });
}

/**
 * 安裝狀態改變會影響側欄（根版面）與應用程式頁本身。
 * 側欄在根 layout 算出來，故要 revalidate layout 而非單一頁面。
 */
function revalidateModuleUi() {
  revalidatePath("/apps");
  revalidatePath("/", "layout");
}
