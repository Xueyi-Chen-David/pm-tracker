"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { requireActiveOrg } from "@/server/org";

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
  // present=出席、absent=缺席、offsite=在外工作（出差/在家工作）、clear=清除
  status: z.enum(["present", "absent", "offsite", "clear"]),
  reason: z.string().trim().max(100).optional(),
});

/** 設定某人某天的出席狀態（出席 / 缺席 / 在外工作 / 清除）。每人每日一筆（限本組織）。 */
export async function setAttendance(input: z.input<typeof SetInput>) {
  const { user: me, org } = await requireActiveOrg();
  const d = SetInput.parse(input);
  await assertOrgMember(org.id, d.userId);
  const date = toUtcDate(d.date);

  if (d.status === "clear") {
    await db.attendanceRecord.deleteMany({
      where: { organizationId: org.id, userId: d.userId, date },
    });
  } else {
    const offsite = d.status === "offsite";
    const present = d.status !== "absent"; // 出差/在家工作也算出席
    // 缺席與在外工作保留事由；出席清空事由。
    const reason = present && !offsite ? null : d.reason?.trim() || null;
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
      update: { present, reason, offsite, auto: false, createdById: me.id },
      create: {
        organizationId: org.id,
        userId: d.userId,
        date,
        present,
        reason,
        offsite,
        auto: false,
        createdById: me.id,
      },
    });
  }
  revalidatePath("/attendance");
}

/** 設定某成員是否納入出席追蹤（月曆是否顯示他；限本組織）。 */
export async function setTrackAttendance(userId: string, on: boolean) {
  const { org } = await requireActiveOrg();
  await assertOrgMember(org.id, userId);
  await db.organizationMember.update({
    where: { organizationId_userId: { organizationId: org.id, userId } },
    data: { trackAttendance: on },
  });
  revalidatePath("/attendance");
  revalidatePath("/team");
  revalidatePath(`/team/${userId}`);
}
