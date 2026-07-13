import { redirect } from "next/navigation";
import { requireActiveOrg } from "@/server/org";

/**
 * 「個人資料」與「團隊 → 自己」融合成同一頁：一律導向 /team/[自己的 userId]。
 * 該頁本人（非管理者）看到可自編的個資表單 + 自己的統計 / 專案 / 任務 / 事件。
 */
export default async function MyProfilePage() {
  const { user } = await requireActiveOrg();
  redirect(`/me/${user.id}`);
}
