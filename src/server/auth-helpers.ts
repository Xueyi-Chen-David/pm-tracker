import { redirect } from "next/navigation";
import { auth } from "./auth";

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
