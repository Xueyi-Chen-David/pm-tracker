"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/server/db";
import { requireUser } from "@/server/auth-helpers";
import {
  getMyMemberships,
  ACTIVE_ORG_COOKIE,
  ACTIVE_ORG_COOKIE_OPTS,
} from "@/server/org";

/** 切換目前組織：驗證是我的組織 → 寫 cookie → 進 dashboard。 */
export async function setActiveOrgAction(orgId: string) {
  const user = await requireUser();
  const memberships = await getMyMemberships(user.id);
  if (!memberships.some((m) => m.organizationId === orgId)) {
    throw new Error("你不是該組織的成員。");
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
