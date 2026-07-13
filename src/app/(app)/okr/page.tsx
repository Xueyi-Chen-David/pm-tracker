import { redirect } from "next/navigation";

// OKR / 目標 已拆分：策略層（願景 / 年度 / 季度 OKR）移到「公司營運」，
// 營運層併入「專案與任務」。保留此轉址以相容舊書籤 / 連結。
export default function OkrRedirect() {
  redirect("/company");
}
