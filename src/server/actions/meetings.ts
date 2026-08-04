"use server";

import { z } from "zod";
import sanitizeHtml from "sanitize-html";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { requireActiveOrg } from "@/server/org";
import { NOTE_IMG_CLASS } from "@/lib/meeting-notes";

/**
 * 會議記錄的 notes 是使用者用 contentEditable 打的 HTML（圖片內嵌、文字環繞，見
 * meeting-notes-canvas.tsx）。送進 DB 前一律過白名單：只留文字排版用的標籤，圖片
 * 一律強制套用固定 class（不理會前端傳來的 class/style，避免夾帶任意樣式），且圖片
 * 網址一定要符合站內 /api/report-image 的格式，不接受外部圖片或貼上的雜訊 HTML。
 */
function sanitizeNotes(raw: string): string {
  return sanitizeHtml(raw, {
    allowedTags: ["img", "br", "div", "b", "i", "strong", "em", "u"],
    allowedAttributes: { img: ["src", "alt", "class"] },
    transformTags: {
      img: (_tagName, attribs) => ({
        tagName: "img",
        attribs: { src: attribs.src ?? "", alt: "", class: NOTE_IMG_CLASS },
      }),
    },
    exclusiveFilter: (frame) =>
      frame.tag === "img" &&
      !/^\/api\/report-image\/[\w-]+$/.test(frame.attribs.src ?? ""),
  }).trim();
}

const MeetingInput = z.object({
  date: z.string().min(1, "請選擇日期"),
  category: z.string().trim().min(1, "請輸入會議類別").max(50),
  title: z.string().trim().min(1, "請輸入會議主題").max(200),
  attendeeIds: z.array(z.string()).default([]),
  attendees: z.string().trim().max(2000).optional(),
  link: z.string().trim().max(2000).optional(), // 會議連結（Meet / 文件…）
  notes: z.string().trim().max(20000).optional(), // HTML，圖片標籤比純文字長，上限拉高
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
  const notes = d.notes ? sanitizeNotes(d.notes) : "";
  await db.meeting.create({
    data: {
      organizationId: org.id,
      date,
      category: d.category,
      title: d.title,
      attendeeIds: d.attendeeIds,
      attendees: d.attendees || null,
      link: d.link || null,
      notes: notes || null,
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
  const notes = d.notes ? sanitizeNotes(d.notes) : "";
  // noteImages 刻意不動：新編輯器的圖片已內嵌在 notes 裡；若這筆是改版前的舊紀錄，
  // 保留原本的 noteImages 讓唯讀畫面的舊圖 fallback 繼續顯示（見 MeetingNotesCanvas）。
  await db.meeting.updateMany({
    where: { id, organizationId: org.id },
    data: {
      date,
      category: d.category,
      title: d.title,
      attendeeIds: d.attendeeIds,
      attendees: d.attendees || null,
      link: d.link || null,
      notes: notes || null,
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
