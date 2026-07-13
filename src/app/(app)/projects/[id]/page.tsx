import { redirect } from "next/navigation";

// 專案詳情已改為在「專案與任務」清單頁就地展開管理（每張卡片的「管理」按鈕）。
// 舊的獨立詳情路徑保留為轉址，確保任何既有連結仍可用；展開該專案的管理面板。
export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/projects?expand=${encodeURIComponent(id)}`);
}
