"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireActiveOrg, isManagerOrBoss, VIEW_AS_COOKIE } from "@/server/org";

/**
 * 切換「以員工視角預覽」。只有管理者 / 老闆能開啟；一般成員呼叫無效果。
 * 開啟後側欄與頁面存取都降級成一般員工，方便確認員工實際看到什麼。
 */
export async function setViewAsEmployee(on: boolean) {
  const { membership } = await requireActiveOrg();
  const store = await cookies();
  if (on && isManagerOrBoss(membership)) {
    store.set(VIEW_AS_COOKIE, "employee", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      // session cookie：關閉瀏覽器即失效，預覽不會長期黏著。
    });
  } else {
    store.delete(VIEW_AS_COOKIE);
  }
  revalidatePath("/", "layout");
}
