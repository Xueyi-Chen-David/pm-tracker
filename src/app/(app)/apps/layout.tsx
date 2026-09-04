import { requireModuleAccess } from "@/server/org";

/** 應用程式安裝頁：core + adminOnly 模組，只有管理者 / 老闆（或被加選授權者）進得來。 */
export default async function AppsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireModuleAccess("apps");
  return <>{children}</>;
}
