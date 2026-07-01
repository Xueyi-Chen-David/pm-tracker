import { requireModuleAccess } from "@/server/auth-helpers";

export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireModuleAccess("report");
  return children;
}
