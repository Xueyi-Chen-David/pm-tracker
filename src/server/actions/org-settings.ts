"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { requireActiveOrg, requireActiveOrgWithRole } from "@/server/org";

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

  // 「兩者皆須符合」需同時設有網段與地點，否則其實只判單一條件、易誤導。
  if (d.enabled && d.matchMode === "all") {
    if (allowedIps.length === 0 || d.geofences.length === 0) {
      throw new Error(
        "選擇「兩者皆須符合」時，需同時設定至少一個 IP／網段與一個地點。",
      );
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
