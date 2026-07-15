"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { requireActiveOrg, membershipHas } from "@/server/org";
import { eventAttendanceEffect } from "@/lib/constants";
import { recomputeAttendance, weekdaysInRange } from "@/lib/attendance-sync";

const EventInput = z.object({
  userId: z.string().min(1),
  type: z.string().trim().min(1, "請選擇事件類型").max(50),
  startDate: z.string().min(1, "請選擇開始日期"),
  endDate: z.string().optional(),
  note: z.string().trim().max(2000).optional(),
});

/** yyyy-mm-dd → UTC 午夜（對應 @db.Date，避免時區位移）。 */
function toDate(v: string): Date {
  const [y, m, day] = v.split("-").map(Number);
  if (!y || !m || !day) throw new Error("日期格式錯誤");
  return new Date(Date.UTC(y, m - 1, day));
}

export async function createMemberEvent(input: z.input<typeof EventInput>) {
  const { user, org, membership } = await requireActiveOrg();
  const d = EventInput.parse(input);
  // 只能替自己登記事件；替他人登記需出勤管理權限（人資 / 管理者）。
  if (d.userId !== user.id && !membershipHas(membership, "attendance.manage")) {
    throw new Error("只能替自己登記請假 / 事件；需具備出勤管理權限才能替他人登記。");
  }
  const member = await db.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: org.id, userId: d.userId } },
    select: { id: true },
  });
  if (!member) throw new Error("該成員不屬於目前組織。");

  const start = toDate(d.startDate);
  const end = d.endDate ? toDate(d.endDate) : null;
  // 結束日早於開始日時忽略結束日
  const endDate = end && end.getTime() >= start.getTime() ? end : null;

  await db.memberEvent.create({
    data: {
      organizationId: org.id,
      userId: d.userId,
      type: d.type,
      startDate: start,
      endDate,
      note: d.note || null,
      createdById: user.id,
    },
  });

  // 請假 / 出差 / 在家工作：直接反映到出席月曆（其餘類型不影響）。
  if (eventAttendanceEffect(d.type)) {
    await recomputeAttendance(
      db,
      org.id,
      d.userId,
      user.id,
      weekdaysInRange(start, endDate ?? start),
    );
  }

  revalidatePath(`/me/${d.userId}`);
  revalidatePath("/team");
  revalidatePath("/attendance");
}

export async function deleteMemberEvent(input: { id: string; userId: string }) {
  const { user, org, membership } = await requireActiveOrg();
  // 先讀出事件（需要範圍 + 類型來回收自動出席紀錄），再刪除。
  const event = await db.memberEvent.findFirst({
    where: { id: input.id, organizationId: org.id },
    select: { userId: true, type: true, startDate: true, endDate: true },
  });
  if (!event) return;
  // 只能刪自己的事件；刪他人需出勤管理權限。
  if (event.userId !== user.id && !membershipHas(membership, "attendance.manage")) {
    throw new Error("只能刪除自己的事件；需具備出勤管理權限才能刪除他人的。");
  }
  await db.memberEvent.deleteMany({
    where: { id: input.id, organizationId: org.id },
  });

  if (event && eventAttendanceEffect(event.type)) {
    await recomputeAttendance(
      db,
      org.id,
      event.userId,
      user.id,
      weekdaysInRange(event.startDate, event.endDate ?? event.startDate),
    );
  }

  revalidatePath(`/me/${input.userId}`);
  revalidatePath("/team");
  revalidatePath("/attendance");
}
