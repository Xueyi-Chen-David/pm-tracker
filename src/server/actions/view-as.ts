"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireActiveOrg, isManagerOrBoss, VIEW_AS_COOKIE } from "@/server/org";
import { db } from "@/server/db";

/**
 * 切換「以…視角預覽」。只有管理者 / 老闆能開啟；一般成員呼叫無效果。
 * value：
 *   - null / ""     → 退出預覽（回真實身分）
 *   - "employee"    → 一般員工視角
 *   - "role:<id>"   → 某自訂角色（如 人資）視角，權限＝該角色 permissions
 * 開啟後側欄與頁面存取都會依所選視角呈現，方便確認該角色 / 員工實際看到什麼。
 */
export async function setViewAs(value: string | null) {
  const { org, membership } = await requireActiveOrg();
  const store = await cookies();

  if (!value || !isManagerOrBoss(membership)) {
    store.delete(VIEW_AS_COOKIE);
    revalidatePath("/", "layout");
    return;
  }

  let cookieVal: string | null = null;
  if (value === "employee") {
    cookieVal = "employee";
  } else if (value.startsWith("role:")) {
    const roleId = value.slice("role:".length);
    const role = await db.orgRoleDef.findFirst({
      where: { id: roleId, organizationId: org.id },
      select: { id: true },
    });
    if (role) cookieVal = `role:${roleId}`;
  }

  if (cookieVal) {
    // session cookie：關閉瀏覽器即失效，預覽不會長期黏著。
    store.set(VIEW_AS_COOKIE, cookieVal, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
  } else {
    store.delete(VIEW_AS_COOKIE);
  }
  revalidatePath("/", "layout");
}
