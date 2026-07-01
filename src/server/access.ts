import { db } from "./db";

/**
 * 編輯權限：這是內部團隊工具——只要是「目前組織」的登入成員，都能編輯該組織的
 * 任何專案（呼叫端皆已先經過 requireActiveOrg()）。角色（負責人/成員/檢視者）與
 * 職位文字僅作顯示與週報用途，不限制編輯。
 *
 * 此函式改負責「縱深防禦」：確認專案確實屬於目前組織，擋掉跨組織存取。
 */
export async function assertCanEditProject(
  orgId: string,
  projectId: string,
): Promise<void> {
  const project = await db.project.findFirst({
    where: { id: projectId, organizationId: orgId },
    select: { id: true },
  });
  if (!project) {
    throw new Error("找不到專案，或它不屬於目前組織。");
  }
}
