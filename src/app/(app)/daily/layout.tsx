import { requireModuleAccess } from "@/server/org";

export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireModuleAccess("daily");
  return children;
}
