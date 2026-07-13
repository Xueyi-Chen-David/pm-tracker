import { redirect } from "next/navigation";

// 專案編輯已改為在「專案與任務」清單頁就地展開管理（卡片「管理」→「設定」分頁）。
// 舊的獨立 /edit 路徑保留為轉址，直接展開該專案的管理面板。
export default async function EditProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/projects?expand=${encodeURIComponent(id)}`);
}
