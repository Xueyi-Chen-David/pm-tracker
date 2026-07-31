"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { requireActiveOrg } from "@/server/org";
import { taipeiTodayUtc } from "@/lib/date";
import { formatClock, taipeiMinutesOfDay } from "@/lib/checkin-reminder";
import {
  evaluateCheckIn,
  parseGeofences,
  parseMatchMode,
  pickClientIp,
} from "@/lib/checkin";

const PunchInput = z.object({
  kind: z.enum(["in", "out"]),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
});

/**
 * 員工打卡（上班 / 下班）。以來源 IP 或 GPS 座標驗證（任一符合即有效）；
 * 不符合則以回傳值（非 throw）帶回錯誤說明——這類「未在允許範圍」是打卡時的
 * 正常情境（非程式錯誤），Next.js 對 Server Action 丟出的 Error 在正式環境一律
 * 隱去訊息內容（只留通用文字＋digest），throw 會讓使用者看到的說明失真。
 * 有效的「上班」打卡會標記當日出席。
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
      checkInMatchMode: true,
    },
  });
  if (!orgRow?.checkInEnabled) {
    return { ok: false as const, error: "打卡功能尚未開啟，請聯絡管理者。" };
  }

  // 打卡日以「台灣當地日期」為準（見 taipeiTodayUtc）。用伺服器的 UTC 日期會讓
  // 早上 8 點前打的卡整筆記到前一天。
  const date = taipeiTodayUtc();

  // 同一天同一種卡只留一筆：重複按（或手殘連點）不再新增紀錄，直接擋下並告知
  // 原本打卡的時間。要修改時間請走補打卡流程（審核後會覆蓋當天該種類的打卡）。
  const existing = await db.checkIn.findFirst({
    where: {
      organizationId: org.id,
      userId: user.id,
      date,
      kind: d.kind,
      valid: true,
    },
    orderBy: { at: "asc" },
    select: { at: true },
  });
  if (existing) {
    const label = d.kind === "in" ? "上班" : "下班";
    return {
      ok: false as const,
      error: `今天已完成${label}打卡（${formatClock(taipeiMinutesOfDay(existing.at.getTime()))}），不需要重複打卡。如需更正時間，請到「補打卡」提出申請。`,
    };
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
    matchMode: parseMatchMode(orgRow.checkInMatchMode),
  });

  if (!result.valid) {
    return { ok: false as const, error: result.reason ?? "打卡未通過驗證。" };
  }

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
        // 之前被人工「清除」過的日子（墓碑 cleared=true）若又有人真的打卡，
        // 得把墓碑拿掉，否則月曆會繼續當成「未記錄」，出席打不出來。
        cleared: false,
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
  revalidatePath("/checkin"); // 今日打卡紀錄 / 打卡紙
  return { ok: true as const, method: result.method };
}
