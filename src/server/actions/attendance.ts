"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import {
  requireActiveOrg,
  requireOrgPermission,
  membershipHas,
} from "@/server/org";

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
 * 只能改自己的；改他人需 `attendance.manage` 權限（人資 / 管理者）。
 */
export async function setAttendance(input: z.input<typeof SetInput>) {
  const { user: me, org, membership } = await requireActiveOrg();
  const d = SetInput.parse(input);
  await assertOrgMember(org.id, d.userId);
  // 只能改自己的出席；具「登記全體出勤」權限者（人資 / 管理者）才能改他人。
  if (d.userId !== me.id && !membershipHas(membership, "attendance.manage")) {
    throw new Error("只能修改自己的出席紀錄；需具備出勤管理權限才能修改他人。");
  }
  const date = toUtcDate(d.date);

  if (d.status === "clear") {
    await db.attendanceRecord.deleteMany({
      where: { organizationId: org.id, userId: d.userId, date },
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
        leaveTypeId,
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
        auto: false,
        createdById: me.id,
      },
    });
  }
  revalidatePath("/attendance");
  revalidatePath("/payroll");
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
