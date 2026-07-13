"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { requireActiveOrg } from "@/server/org";
import { todayUtc } from "@/lib/date";
import { evaluateCheckIn, parseGeofences, pickClientIp } from "@/lib/checkin";

const PunchInput = z.object({
  kind: z.enum(["in", "out"]),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
});

/**
 * 員工打卡（上班 / 下班）。以來源 IP 或 GPS 座標驗證（任一符合即有效）；
 * 不符合則丟出錯誤說明。有效的「上班」打卡會標記當日出席。
 */
export async function punch(input: z.input<typeof PunchInput>) {
  const { user, org } = await requireActiveOrg();
  const d = PunchInput.parse(input);

  const orgRow = await db.organization.findUnique({
    where: { id: org.id },
    select: {
      checkInEnabled: true,
      checkInAllowedIps: true,
      checkInGeofences: true,
    },
  });
  if (!orgRow?.checkInEnabled) {
    throw new Error("打卡功能尚未開啟，請聯絡管理者。");
  }

  const hdrs = await headers();
  const ip = pickClientIp(
    hdrs.get("x-forwarded-for"),
    hdrs.get("x-real-ip"),
  );

  const lat = d.lat ?? null;
  const lng = d.lng ?? null;
  const result = evaluateCheckIn({
    ip,
    lat,
    lng,
    allowedIps: orgRow.checkInAllowedIps,
    geofences: parseGeofences(orgRow.checkInGeofences),
  });

  if (!result.valid) {
    throw new Error(result.reason ?? "打卡未通過驗證。");
  }

  const date = todayUtc();
  await db.checkIn.create({
    data: {
      organizationId: org.id,
      userId: user.id,
      date,
      kind: d.kind,
      method: result.method,
      valid: true,
      ip,
      lat,
      lng,
    },
  });

  // 有效上班打卡 → 標記當日出席（視為人工紀錄，事件同步不會覆蓋）。
  if (d.kind === "in") {
    await db.attendanceRecord.upsert({
      where: {
        organizationId_userId_date: {
          organizationId: org.id,
          userId: user.id,
          date,
        },
      },
      update: {
        present: true,
        offsite: false,
        reason: "打卡",
        auto: false,
        createdById: user.id,
      },
      create: {
        organizationId: org.id,
        userId: user.id,
        date,
        present: true,
        offsite: false,
        reason: "打卡",
        auto: false,
        createdById: user.id,
      },
    });
    revalidatePath("/attendance");
  }

  revalidatePath("/daily");
  return { ok: true as const, method: result.method };
}
