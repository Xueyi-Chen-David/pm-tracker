"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { requireUser } from "@/server/auth-helpers";

/** yyyy-mm-dd → UTC 午夜（對應 @db.Date，避免時區位移）。 */
function toUtcDate(v: string): Date {
  const [y, m, d] = v.split("-").map(Number);
  if (!y || !m || !d) throw new Error("日期格式錯誤");
  return new Date(Date.UTC(y, m - 1, d));
}

const SetInput = z.object({
  userId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式錯誤"),
  status: z.enum(["present", "absent", "clear"]),
  reason: z.string().trim().max(100).optional(),
});

/** 設定某人某天的出席狀態（出席 / 缺席 / 清除）。每人每日一筆。 */
export async function setAttendance(input: z.input<typeof SetInput>) {
  const me = await requireUser();
  const d = SetInput.parse(input);
  const date = toUtcDate(d.date);

  if (d.status === "clear") {
    await db.attendanceRecord.deleteMany({ where: { userId: d.userId, date } });
  } else {
    const present = d.status === "present";
    const reason = present ? null : d.reason?.trim() || null;
    await db.attendanceRecord.upsert({
      where: { userId_date: { userId: d.userId, date } },
      update: { present, reason, createdById: me.id },
      create: { userId: d.userId, date, present, reason, createdById: me.id },
    });
  }
  revalidatePath("/attendance");
}

/** 設定某成員是否納入出席追蹤（月曆是否顯示他）。 */
export async function setTrackAttendance(userId: string, on: boolean) {
  await requireUser();
  await db.user.update({
    where: { id: userId },
    data: { trackAttendance: on },
  });
  revalidatePath("/attendance");
  revalidatePath("/team");
  revalidatePath(`/team/${userId}`);
}
