import { requireModuleAccess } from "@/server/org";

export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireModuleAccess("timeline");
  return children;
}
