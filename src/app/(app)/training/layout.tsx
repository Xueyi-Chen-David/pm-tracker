import { requireModuleAccess } from "@/server/org";

export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireModuleAccess("training");
  // 文件庫滿高：桌機以 dvh 建立貼齊視窗高的 flex 容器（扣掉外層容器 py-6 的 3rem），
  // 讓左樹與右側內容各自內捲、不整頁捲動。窄／矮螢幕（<lg）維持自然高度，避免破版。
  return (
    <div className="flex flex-col lg:h-[calc(100dvh-3rem)] lg:min-h-0">
      {children}
    </div>
  );
}
