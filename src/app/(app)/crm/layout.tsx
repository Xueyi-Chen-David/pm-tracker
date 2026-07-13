import { requireModuleAccess } from "@/server/org";

export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireModuleAccess("crm");
  // CRM 看板滿高：以 dvh 建立滿視窗高的 flex 容器，讓銷售管線隨視窗高度伸縮。
  // 寬度沿用外層版面（max-w-[90rem]），不做視窗全寬突破，避免超出頁面。
  return (
    <div className="flex h-[calc(100dvh-3rem)] min-h-0 flex-col">{children}</div>
  );
}
