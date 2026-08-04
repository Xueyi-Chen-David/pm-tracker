"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { requireActiveOrg, requireOrgPermission } from "@/server/org";
import { hasPermission } from "@/lib/permissions";
import { displayName } from "@/lib/display";
import { taipeiTimeToUtc } from "@/lib/date";
import { createNotification, createNotifications } from "@/server/notify";

/** yyyy-mm-dd → UTC 午夜（對應 @db.Date，避免時區位移）。 */
function toUtcDate(v: string): Date {
  const [y, m, d] = v.split("-").map(Number);
  if (!y || !m || !d) throw new Error("日期格式錯誤");
  return new Date(Date.UTC(y, m - 1, d));
}

/** 確認 userId 是目前組織的成員，避免跨組織寫入。 */
async function assertOrgMember(orgId: string, userId: string) {
  const member = await db.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: orgId, userId } },
    select: { id: true },
  });
  if (!member) throw new Error("該成員不屬於目前組織。");
}

const SetInput = z.object({
  userId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式錯誤"),
  // present=出席、absent=缺席、offsite=在外工作（出差/在家工作）、holiday=休假/放假、leave=請假、clear=清除
  status: z.enum(["present", "absent", "offsite", "holiday", "leave", "clear"]),
  reason: z.string().trim().max(100).optional(),
  // 請假時對應的假別 id（決定薪資扣薪比例）；其它狀態忽略。
  leaveTypeId: z.string().optional(),
});

/**
 * 設定某人某天的出席狀態（出席 / 缺席 / 在外工作 / 請假 / 休假 / 清除）。每人每日一筆（限本組織）。
 * 一律需 `attendance.manage` 權限（人資 / 管理者）——含改自己那列。一般成員出缺勤以打卡為準，
 * 忘記打卡走「補打卡」申請（requestCheckInCorrection），不再開放直接點格子。
 */
export async function setAttendance(input: z.input<typeof SetInput>) {
  const { user: me, org } = await requireOrgPermission("attendance.manage");
  const d = SetInput.parse(input);
  await assertOrgMember(org.id, d.userId);
  const date = toUtcDate(d.date);

  if (d.status === "clear") {
    // 「清除」不能只是刪掉紀錄——沒有紀錄的過去平日會被「未打卡自動缺席」的顯示層
    // 重新標成缺席，來自請假 / 出差事件的紀錄也會被 recomputeAttendance 依事件長回來，
    // 使用者就會看到「清除了卻自己恢復」。改為留下一筆 cleared 墓碑（auto=false ＝人工，
    // 重算時一律不動），顯示為未記錄，也不列入出席 / 缺席 / 薪資統計。
    const blank = {
      present: false,
      reason: null,
      offsite: false,
      holiday: false,
      leave: false,
      leaveHours: null,
      leaveTypeId: null,
      cleared: true,
      auto: false,
      createdById: me.id,
    };
    await db.attendanceRecord.upsert({
      where: {
        organizationId_userId_date: {
          organizationId: org.id,
          userId: d.userId,
          date,
        },
      },
      update: blank,
      create: { organizationId: org.id, userId: d.userId, date, ...blank },
    });
  } else {
    const holiday = d.status === "holiday";
    const leave = d.status === "leave";
    const offsite = d.status === "offsite";
    // 缺席 / 休假 / 請假都不算出席；出差 / 在家工作算出席。
    const present =
      d.status !== "absent" && d.status !== "holiday" && d.status !== "leave";
    // 缺席 / 在外工作 / 請假保留事由；出席 / 休假清空事由。
    const reason = present && !offsite ? null : d.reason?.trim() || null;
    // 請假時的假別：驗證屬於本組織；其它狀態一律清空。
    let leaveTypeId: string | null = null;
    if (leave && d.leaveTypeId) {
      const lt = await db.leaveType.findFirst({
        where: { id: d.leaveTypeId, organizationId: org.id },
        select: { id: true },
      });
      leaveTypeId = lt?.id ?? null;
    }
    // 人工登記一律標為非自動：即使原本是事件帶出的，人工一改就「脫鉤」，
    // 之後刪除該事件也不會回收這筆，且不會被事件重新覆蓋。
    await db.attendanceRecord.upsert({
      where: {
        organizationId_userId_date: {
          organizationId: org.id,
          userId: d.userId,
          date,
        },
      },
      update: {
        present,
        reason,
        offsite,
        holiday,
        leave,
        // 人工改整天狀態時一併清掉時數請假殘值——leaveHours 只該由核准的時數
        // 請假申請寫入（materializeApprovedLeave），手動改狀態視為重新登記整天。
        leaveHours: null,
        leaveTypeId,
        cleared: false, // 重新登記狀態 → 解除先前的「清除」墓碑
        auto: false,
        createdById: me.id,
      },
      create: {
        organizationId: org.id,
        userId: d.userId,
        date,
        present,
        reason,
        offsite,
        holiday,
        leave,
        leaveTypeId,
        cleared: false, // 重新登記狀態 → 解除先前的「清除」墓碑
        auto: false,
        createdById: me.id,
      },
    });
  }
  revalidatePath("/attendance");
  revalidatePath("/payroll");
}

// ── 補打卡（忘記上/下班打卡的補救）──────────────────────────

/** 通知本組織所有具 attendance.manage 者（審核補打卡用）。 */
async function notifyAttendanceManagers(
  orgId: string,
  title: string,
  body: string,
  link: string,
) {
  const members = await db.organizationMember.findMany({
    where: { organizationId: orgId, active: true },
    select: {
      userId: true,
      role: true,
      roleDefs: { select: { permissions: true } },
    },
  });
  const targets = members.filter((m) =>
    hasPermission({ role: m.role, roleDefs: m.roleDefs }, "attendance.manage"),
  );
  if (targets.length === 0) return;
  await createNotifications(
    targets.map((m) => ({
      orgId,
      userId: m.userId,
      type: "checkin_correction",
      title,
      body,
      link,
    })),
  );
}

const CorrectionInput = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式錯誤"),
  kind: z.enum(["in", "out"]),
  time: z.string().regex(/^\d{2}:\d{2}$/, "時間格式錯誤"), // HH:mm（當日）
  reason: z.string().trim().max(500).optional(),
});

/** 送出補打卡申請（本人）。建立 pending 紀錄並通知出勤管理者審核。 */
export async function requestCheckInCorrection(
  input: z.input<typeof CorrectionInput>,
) {
  const { user, org } = await requireActiveOrg();
  const d = CorrectionInput.parse(input);
  const [hh, mm] = d.time.split(":").map(Number);
  const [y, mo, day] = d.date.split("-").map(Number);
  // 補登時間：把使用者輸入的台灣當地時刻換算成 UTC 存（與打卡 at 一致，供工時聚合）。
  // 不能用 `new Date(y, m, d, hh, mm)`——伺服器執行環境是 UTC，會把這些數字誤判成
  // 伺服器本地時間，存下的時刻整整偏差 8 小時（例如輸入 20:00 會變成隔天 4:00）。
  const at = taipeiTimeToUtc(y!, mo!, day!, hh!, mm!);

  await db.checkInCorrection.create({
    data: {
      organizationId: org.id,
      userId: user.id,
      date: toUtcDate(d.date),
      kind: d.kind,
      at,
      reason: d.reason || null,
      status: "pending",
    },
  });

  const who = displayName(user);
  await notifyAttendanceManagers(
    org.id,
    "補打卡待審核",
    `${who} 申請補登 ${d.date} ${d.kind === "in" ? "上班" : "下班"}（${d.time}）`,
    "/attendance",
  );
  revalidatePath("/attendance");
  revalidatePath("/checkin"); // 「我的打卡紀錄」打卡紙也要顯示這筆待審核時間
}

/**
 * 刪除自己的補打卡申請，不限狀態（待審核＝撤回；已核准/已駁回＝刪除紀錄）。
 * 若該申請已核准（已補建立一筆真實打卡），一併移除那筆打卡紀錄——使用者的原意
 * 就是連同打卡紀錄一起撤銷，留著會變成沒有申請紀錄可查的孤兒打卡。
 * 出席（是否算出席）與薪資不會自動回復，如需調整請洽出勤管理者另行處理。
 */
export async function deleteCheckInCorrection(id: string) {
  const { user, org } = await requireActiveOrg();
  const c = await db.checkInCorrection.findFirst({
    where: { id, organizationId: org.id, userId: user.id },
    select: { id: true, resultCheckInId: true },
  });
  if (!c) return { ok: false as const, error: "找不到這筆補打卡申請。" };

  if (c.resultCheckInId) {
    await db.checkIn.deleteMany({
      where: { id: c.resultCheckInId, organizationId: org.id, userId: user.id },
    });
  }
  await db.checkInCorrection.delete({ where: { id: c.id } });

  revalidatePath("/attendance");
  revalidatePath("/payroll");
  revalidatePath("/checkin"); // 「我的打卡紀錄」打卡紙要一併清掉這筆時間
  return { ok: true as const };
}

/**
 * 審核補打卡申請（需 attendance.manage）。核准則補一筆有效打卡並更新出席，駁回則記原因。
 * 「找不到待審核」是正常情境（例如另一位管理者已搶先審核、或本人已撤回），以回傳值而非
 * throw 帶回——Server Action 丟出的 Error 在正式環境會被 Next.js 隱去訊息內容。
 */
export async function reviewCheckInCorrection(
  id: string,
  approve: boolean,
  note?: string,
) {
  const { user: me, org } = await requireOrgPermission("attendance.manage");
  const c = await db.checkInCorrection.findFirst({
    where: { id, organizationId: org.id, status: "pending" },
    select: { id: true, userId: true, date: true, kind: true, at: true },
  });
  if (!c) {
    return { ok: false as const, error: "找不到待審核的補打卡申請。" };
  }

  let resultCheckInId: string | null = null;
  if (approve) {
    // 核准＝覆蓋當天同種類（上班/下班）既有的打卡紀錄，而不是並存新增一筆——
    // 否則打卡紙以「當日最早上班 / 最晚下班」挑選顯示時，舊的錯誤時間可能繼續
    // 勝出，使用者會看到「明明核准了，時間卻沒改到」。
    await db.checkIn.deleteMany({
      where: {
        organizationId: org.id,
        userId: c.userId,
        date: c.date,
        kind: c.kind,
      },
    });
    // 補一筆有效打卡（method=manual，計入薪資工時聚合）。id 存回申請本身，
    // 之後本人若刪除這筆申請才能一併移除這筆補建立的打卡紀錄。
    const created = await db.checkIn.create({
      data: {
        organizationId: org.id,
        userId: c.userId,
        date: c.date,
        at: c.at,
        kind: c.kind,
        method: "manual",
        valid: true,
      },
      select: { id: true },
    });
    resultCheckInId = created.id;
    // 上班補卡：確保當日出席（與正常打卡一致；不覆蓋既有的請假 / 休假登記）。
    if (c.kind === "in") {
      const existing = await db.attendanceRecord.findUnique({
        where: {
          organizationId_userId_date: {
            organizationId: org.id,
            userId: c.userId,
            date: c.date,
          },
        },
        select: { id: true, leave: true, holiday: true },
      });
      if (!existing || (!existing.leave && !existing.holiday)) {
        await db.attendanceRecord.upsert({
          where: {
            organizationId_userId_date: {
              organizationId: org.id,
              userId: c.userId,
              date: c.date,
            },
          },
          update: {
            present: true,
            reason: "補打卡",
            cleared: false, // 補打卡核准＝當天確實有到，解除先前的「清除」墓碑
            auto: false,
            createdById: me.id,
          },
          create: {
            organizationId: org.id,
            userId: c.userId,
            date: c.date,
            present: true,
            reason: "補打卡",
            auto: false,
            createdById: me.id,
          },
        });
      }
    }
  }

  await db.checkInCorrection.update({
    where: { id: c.id },
    data: {
      status: approve ? "approved" : "rejected",
      reviewedById: me.id,
      reviewedAt: new Date(),
      reviewNote: note?.trim() || null,
      resultCheckInId,
    },
  });

  await createNotification({
    orgId: org.id,
    userId: c.userId,
    type: "checkin_correction",
    title: approve ? "補打卡已核准" : "補打卡已駁回",
    body: `${c.date.toISOString().slice(0, 10)} ${c.kind === "in" ? "上班" : "下班"}${note?.trim() ? `：${note.trim()}` : ""}`,
    link: "/attendance",
  });

  revalidatePath("/attendance");
  revalidatePath("/payroll");
  revalidatePath("/checkin"); // 申請人的「我的打卡紀錄」打卡紙要反映核准/駁回結果
  return { ok: true as const };
}

/** 設定某成員是否納入出席追蹤（月曆是否顯示他；限本組織、需出勤管理權限）。 */
export async function setTrackAttendance(userId: string, on: boolean) {
  const { org } = await requireOrgPermission("attendance.manage");
  await assertOrgMember(org.id, userId);
  await db.organizationMember.update({
    where: { organizationId_userId: { organizationId: org.id, userId } },
    data: { trackAttendance: on },
  });
  revalidatePath("/attendance");
  revalidatePath("/team");
  revalidatePath(`/me/${userId}`);
}
