import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "./auth";

// 以 React cache 於單一請求內去重：layout / page / 各 require* 都會呼叫，
// 快取後同一次請求只解一次 session（JWT 解碼），不重複跑。
export const getCurrentUser = cache(async () => {
  const session = await auth();
  return session?.user ?? null;
});

/** 在 server component / action 中要求登入；未登入則導向 /login。 */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

// requireModuleAccess 已移至 @/server/org（改讀「目前組織」的 membership 權限）。
