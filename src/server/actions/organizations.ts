"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/server/db";
import { requireUser } from "@/server/auth-helpers";
import {
  getMyMemberships,
  canManageMembers,
  ACTIVE_ORG_COOKIE,
  ACTIVE_ORG_COOKIE_OPTS,
} from "@/server/org";

/**
 * 切換目前組織：驗證是我的組織 → 寫 cookie → 進 dashboard。
 * 「不是該組織成員」在正常操作下也可能發生（例如清單顯示的組織在切換當下已被移除
 * 成員），以回傳值帶回而非 throw——Server Action 丟出的 Error 在正式環境會被
 * Next.js 隱去訊息內容。呼叫端（表單 action 綁定 / 客戶端直呼）自行決定如何呈現。
 */
export async function setActiveOrgAction(orgId: string) {
  const user = await requireUser();
  const memberships = await getMyMemberships(user.id);
  if (!memberships.some((m) => m.organizationId === orgId)) {
    return { ok: false as const, error: "你不是該組織的成員。" };
  }
  const store = await cookies();
  store.set(ACTIVE_ORG_COOKIE, orgId, ACTIVE_ORG_COOKIE_OPTS);
  redirect("/dashboard");
}

export type CreateOrgState = { error?: string } | null;

const NameInput = z.string().trim().min(1, "請輸入組織名稱").max(100, "名稱過長");

/** 建立新組織：任何登入者皆可，建立者自動成為 OWNER（並預設為老闆）。 */
export async function createOrganizationAction(
  _prev: CreateOrgState,
  formData: FormData,
): Promise<CreateOrgState> {
  const user = await requireUser();
  const parsed = NameInput.safeParse(formData.get("name"));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "資料格式錯誤" };
  }
  const org = await db.organization.create({
    data: {
      name: parsed.data,
      members: {
        create: {
          userId: user.id,
          email: (user.email ?? "").toLowerCase(),
          role: "OWNER",
          isBoss: true,
        },
      },
    },
  });
  const store = await cookies();
  store.set(ACTIVE_ORG_COOKIE, org.id, ACTIVE_ORG_COOKIE_OPTS);
  redirect("/dashboard");
}

export type RenameOrgState = { error?: string } | null;

/** 變更組織名稱：需為該組織的擁有者 / 管理員。 */
export async function renameOrganizationAction(
  orgId: string,
  rawName: string,
): Promise<RenameOrgState> {
  const user = await requireUser();
  const memberships = await getMyMemberships(user.id);
  const membership = memberships.find((m) => m.organizationId === orgId);
  if (!membership) return { error: "你不是該組織的成員。" };
  if (!canManageMembers(membership.role)) {
    return { error: "需要組織擁有者 / 管理員權限才能變更名稱。" };
  }
  const parsed = NameInput.safeParse(rawName);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "資料格式錯誤" };
  }
  if (parsed.data === membership.organization.name) return null; // 沒變更
  await db.organization.update({
    where: { id: orgId },
    data: { name: parsed.data },
  });
  revalidatePath("/orgs");
  revalidatePath("/", "layout"); // 更新側欄 OrgSwitcher 顯示的名稱
  return null;
}
