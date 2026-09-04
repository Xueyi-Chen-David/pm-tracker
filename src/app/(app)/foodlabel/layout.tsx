import { requireModuleAccess } from "@/server/org";

/**
 * 食品標示模組的守門。requireModuleAccess 會依序檢查：
 * 組織是否已安裝並啟用 foodlabel → 這位成員是否可見。任一不過就導回可見的頁面。
 */
export default async function FoodLabelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireModuleAccess("foodlabel");
  return <>{children}</>;
}
