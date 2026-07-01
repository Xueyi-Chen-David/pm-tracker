"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { requireActiveOrg } from "@/server/org";

const MeetingInput = z.object({
  date: z.string().min(1, "請選擇日期"),
  category: z.string().trim().min(1, "請輸入會議類別").max(50),
  title: z.string().trim().min(1, "請輸入會議主題").max(200),
  attendeeIds: z.array(z.string()).default([]),
  attendees: z.string().trim().max(2000).optional(),
  notes: z.string().trim().max(8000).optional(),
});

export type MeetingActionState = { error?: string; ok?: boolean } | null;

/** yyyy-mm-dd → UTC 午夜（對應 @db.Date，避免時區位移）。 */
function toDate(v: string): Date {
  const [y, m, day] = v.split("-").map(Number);
  if (!y || !m || !day) throw new Error("日期格式錯誤");
  return new Date(Date.UTC(y, m - 1, day));
}

function parse(formData: FormData) {
  return MeetingInput.safeParse({
    date: formData.get("date"),
    category: formData.get("category"),
    title: formData.get("title"),
    attendeeIds: formData.getAll("attendeeIds").map(String),
    attendees: formData.get("attendees") || undefined,
    notes: formData.get("notes") || undefined,
  });
}

export async function createMeetingAction(
  _prev: MeetingActionState,
  formData: FormData,
): Promise<MeetingActionState> {
  const { user, org } = await requireActiveOrg();
  const parsed = parse(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "資料格式錯誤" };
  }
  const d = parsed.data;
  await db.meeting.create({
    data: {
      organizationId: org.id,
      date: toDate(d.date),
      category: d.category,
      title: d.title,
      attendeeIds: d.attendeeIds,
      attendees: d.attendees || null,
      notes: d.notes || null,
      createdById: user.id,
    },
  });
  revalidatePath("/meetings");
  revalidatePath("/report");
  return { ok: true };
}

export async function updateMeetingAction(
  _prev: MeetingActionState,
  formData: FormData,
): Promise<MeetingActionState> {
  const { org } = await requireActiveOrg();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "缺少會議 ID" };
  const parsed = parse(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "資料格式錯誤" };
  }
  const d = parsed.data;
  await db.meeting.updateMany({
    where: { id, organizationId: org.id },
    data: {
      date: toDate(d.date),
      category: d.category,
      title: d.title,
      attendeeIds: d.attendeeIds,
      attendees: d.attendees || null,
      notes: d.notes || null,
    },
  });
  revalidatePath("/meetings");
  revalidatePath("/report");
  return { ok: true };
}

export async function deleteMeeting(id: string) {
  const { org } = await requireActiveOrg();
  await db.meeting.deleteMany({ where: { id, organizationId: org.id } });
  revalidatePath("/meetings");
  revalidatePath("/report");
}
