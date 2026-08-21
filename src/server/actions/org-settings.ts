"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { requireActiveOrg, requireActiveOrgWithRole, requireOrgPermission } from "@/server/org";

/** 公司營運頁：設定組織願景（Vision）。內部工具，任何在職成員皆可編輯（與 OKR 一致）。 */
export async function setOrgVision(vision: string) {
  const { org } = await requireActiveOrg();
  const v = vision.trim().slice(0, 4000);
  await db.organization.update({
    where: { id: org.id },
    data: { vision: v || null },
  });
  revalidatePath("/company");
}

/** 每日報告：是否讓「上級的上級」（整條主管鏈）也看得到下屬日報。需管理者。 */
export async function setDailyReportChainVisible(on: boolean) {
  const { org } = await requireActiveOrgWithRole(["OWNER", "ADMIN"]);
  await db.organization.update({
    where: { id: org.id },
    data: { dailyReportChainVisible: on },
  });
  revalidatePath("/daily");
  revalidatePath("/team");
}

const GeofenceInput = z.object({
  label: z.string().trim().max(60).optional(),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radiusM: z.coerce.number().min(10).max(100_000),
});

const CheckInConfigInput = z.object({
  enabled: z.boolean(),
  // 每行一個 IP / CIDR（前端以換行字串傳入亦可）。
  allowedIps: z.array(z.string().trim().max(64)).max(50),
  geofences: z.array(GeofenceInput).max(20),
  // 網段與地點的組合方式："any"＝任一符合、"all"＝兩者皆須符合。
  matchMode: z.enum(["any", "all"]).default("any"),
});

/** 設定打卡限制（啟用 + 允許 IP + 地理圍欄 + 組合方式）。需管理者。 */
export async function setCheckInConfig(input: z.input<typeof CheckInConfigInput>) {
  const { org } = await requireActiveOrgWithRole(["OWNER", "ADMIN"]);
  const d = CheckInConfigInput.parse(input);
  const allowedIps = d.allowedIps.map((s) => s.trim()).filter(Boolean);

  // 「兩者皆須符合」需同時設有網段與地點，否則其實只判單一條件、易誤導。以回傳值
  // 帶回（而非 throw）——正式環境 Server Action 丟出的 Error 訊息會被 Next.js 隱去。
  if (d.enabled && d.matchMode === "all") {
    if (allowedIps.length === 0 || d.geofences.length === 0) {
      return {
        ok: false as const,
        error: "選擇「兩者皆須符合」時，需同時設定至少一個 IP／網段與一個地點。",
      };
    }
  }

  await db.organization.update({
    where: { id: org.id },
    data: {
      checkInEnabled: d.enabled,
      checkInAllowedIps: allowedIps,
      checkInGeofences: d.geofences,
      checkInMatchMode: d.matchMode,
    },
  });
  revalidatePath("/attendance");
  revalidatePath("/daily");
  return { ok: true as const };
}

/**
 * 設定要同步請假 / 出差核准結果的 Google 日曆 ID（留空＝關閉同步）。需管理者。
 * 只存 ID，不驗證日曆是否真的存在／服務帳戶是否已被分享權限——那要打 Calendar API
 * 才能確認，且失敗不該擋住儲存；下次有請假 / 出差核准時同步失敗會留 server log 可查。
 */
export async function setGoogleCalendarId(calendarId: string) {
  // 跟畫面上「Google 日曆同步」按鈕的顯示條件一致（attendance.manage 權限，見
  // attendance/page.tsx 的 canManageAtt）——原本這裡限 OWNER/ADMIN 角色，但組織可能是
  // 用自訂角色（roleDefs）把 attendance.manage 授權給非 OWNER/ADMIN 的成員（例如
  // 「人資/會計」），那些成員會看得到按鈕、點下去卻因為角色檢查沒過而丟錯，正式環境
  // 又把 Server Action 丟出的錯誤訊息隱去，變成「看起來存了但其實完全沒存到、也沒有
  // 任何 log」。改用權限檢查，跟 UI 顯示條件對齊。
  const { org } = await requireOrgPermission("attendance.manage");
  await db.organization.update({
    where: { id: org.id },
    data: { googleCalendarId: calendarId.trim() || null },
  });
  revalidatePath("/attendance");
  return { ok: true as const };
}
