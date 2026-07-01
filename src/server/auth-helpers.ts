import { redirect } from "next/navigation";
import { auth } from "./auth";
import { db } from "./db";
import { canSeeModule, firstAllowedHref, type ModuleKey } from "@/lib/modules";

export async function getCurrentUser() {
  const session = await auth();
  return session?.user ?? null;
}

/** 在 server component / action 中要求登入；未登入則導向 /login。 */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * 要求登入 + 該模組的可見權限（細分權限）。無權限時導向使用者第一個可見模組。
 * 每次都向 DB 讀最新的 allowedModules / isBoss，權限調整立即生效（不必重新登入）。
 */
export async function requireModuleAccess(key: ModuleKey) {
  const user = await requireUser();
  const access = await db.user.findUnique({
    where: { id: user.id },
    select: { isBoss: true, allowedModules: true },
  });
  if (!canSeeModule(access ?? {}, key)) {
    redirect(firstAllowedHref(access ?? {}));
  }
  return user;
}
