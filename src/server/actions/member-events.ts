"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { requireUser } from "@/server/auth-helpers";

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
  const user = await requireUser();
  const d = EventInput.parse(input);
  const start = toDate(d.startDate);
  const end = d.endDate ? toDate(d.endDate) : null;
  // 結束日早於開始日時忽略結束日
  const endDate = end && end.getTime() >= start.getTime() ? end : null;

  await db.memberEvent.create({
    data: {
      userId: d.userId,
      type: d.type,
      startDate: start,
      endDate,
      note: d.note || null,
      createdById: user.id,
    },
  });
  revalidatePath(`/team/${d.userId}`);
  revalidatePath("/team");
  revalidatePath("/attendance");
}

export async function deleteMemberEvent(input: { id: string; userId: string }) {
  await requireUser();
  await db.memberEvent.delete({ where: { id: input.id } });
  revalidatePath(`/team/${input.userId}`);
  revalidatePath("/team");
  revalidatePath("/attendance");
}
