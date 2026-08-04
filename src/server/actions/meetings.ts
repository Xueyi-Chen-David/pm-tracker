"use server";

import { z } from "zod";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { requireActiveOrg } from "@/server/org";

const NoteImageInput = z.object({
  id: z.string().min(1),
  url: z.string().regex(/^\/api\/report-image\/[\w-]+$/, "圖片來源不正確"),
  xPct: z.number().min(0).max(100),
  yPct: z.number().min(0).max(100),
  wPct: z.number().min(1).max(100),
  hPct: z.number().min(1).max(100),
});

/** noteImages 是隱藏欄位帶進來的 JSON 字串；壞資料就當沒有圖片，不擋整份表單送出。 */
function parseNoteImages(raw: FormDataEntryValue | null): z.infer<typeof NoteImageInput>[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    return z.array(NoteImageInput).max(30).parse(JSON.parse(raw));
  } catch {
    return [];
  }
}

const MeetingInput = z.object({
  date: z.string().min(1, "請選擇日期"),
  category: z.string().trim().min(1, "請輸入會議類別").max(50),
  title: z.string().trim().min(1, "請輸入會議主題").max(200),
  attendeeIds: z.array(z.string()).default([]),
  attendees: z.string().trim().max(2000).optional(),
  link: z.string().trim().max(2000).optional(), // 會議連結（Meet / 文件…）
  notes: z.string().trim().max(8000).optional(),
  recordedById: z.string().trim().optional(),
});

export type MeetingActionState = { error?: string; ok?: boolean } | null;

/**
 * yyyy-mm-dd → UTC 午夜（對應 @db.Date，避免時區位移）。回傳 null 表示格式錯誤——
 * 由呼叫端以 MeetingActionState 的 error 帶回（而非 throw）：Server Action 丟出的
 * Error 在正式環境會被 Next.js 隱去訊息內容，只留通用文字＋digest。
 */
function toDate(v: string): Date | null {
  const [y, m, day] = v.split("-").map(Number);
  if (!y || !m || !day) return null;
  return new Date(Date.UTC(y, m - 1, day));
}

function parse(formData: FormData) {
  return MeetingInput.safeParse({
    date: formData.get("date"),
    category: formData.get("category"),
    title: formData.get("title"),
    attendeeIds: formData.getAll("attendeeIds").map(String),
    attendees: formData.get("attendees") || undefined,
    link: formData.get("link") || undefined,
    notes: formData.get("notes") || undefined,
    recordedById: formData.get("recordedById") || undefined,
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
  const date = toDate(d.date);
  if (!date) return { error: "日期格式錯誤" };
  const noteImages = parseNoteImages(formData.get("noteImages"));
  await db.meeting.create({
    data: {
      organizationId: org.id,
      date,
      category: d.category,
      title: d.title,
      attendeeIds: d.attendeeIds,
      attendees: d.attendees || null,
      link: d.link || null,
      notes: d.notes || null,
      noteImages: noteImages.length ? noteImages : undefined,
      createdById: user.id,
      // 記錄人：未指定就預設是建立者本人；之後可在表單裡改成別人。
      recordedById: d.recordedById || user.id,
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
  const date = toDate(d.date);
  if (!date) return { error: "日期格式錯誤" };
  const noteImages = parseNoteImages(formData.get("noteImages"));
  await db.meeting.updateMany({
    where: { id, organizationId: org.id },
    data: {
      date,
      category: d.category,
      title: d.title,
      attendeeIds: d.attendeeIds,
      attendees: d.attendees || null,
      link: d.link || null,
      notes: d.notes || null,
      noteImages: noteImages.length ? noteImages : Prisma.JsonNull,
      ...(d.recordedById ? { recordedById: d.recordedById } : {}),
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
