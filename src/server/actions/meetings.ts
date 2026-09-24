"use server";

import { z } from "zod";
import sanitizeHtml from "sanitize-html";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { requireActiveOrg } from "@/server/org";
import { NOTE_IMG_CLASS } from "@/lib/meeting-notes";
import { generateText } from "@/server/gemini";

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

/** 會議記錄 HTML → 純文字（給 AI 總結用；圖片略過）。 */
function notesToText(html: string): string {
  return html
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6])\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const SUMMARY_MAX_INPUT = 30_000; // 約上萬字的記錄；再長就截斷，避免單次成本失控

/**
 * 用組織自備的 Gemini key 替一場會議產生 AI 總結並存下（可重新產生，會覆蓋舊的）。
 * 用量記在 AiUsage（feature=meeting_summary）。
 */
export async function generateMeetingSummary(id: string) {
  const { org, user } = await requireActiveOrg();
  const meeting = await db.meeting.findFirst({
    where: { id, organizationId: org.id },
    select: { title: true, category: true, date: true, notes: true },
  });
  if (!meeting) return { ok: false as const, error: "找不到這場會議。" };
  const text = notesToText(meeting.notes ?? "");
  if (text.length < 20) {
    return { ok: false as const, error: "會議記錄內容太少，無法總結。" };
  }

  const prompt = `你是會議記錄整理助手。以下是一場會議的原始記錄，請用繁體中文整理成精簡的總結，使用 Markdown，依序包含：
## 重點摘要
（3–6 點條列）
## 決議事項
（條列；沒有就寫「無」）
## 待辦事項
（條列，格式「- 事項（負責人，期限）」；記錄裡沒寫負責人或期限就省略括號內對應部分；沒有就寫「無」）
## 待確認 / 未決問題
（條列；沒有就寫「無」）

規則：只根據記錄內容整理，不要自行補充或推測記錄裡沒有的資訊；人名、數字、日期照原文。

會議：${meeting.title}（${meeting.category}，${meeting.date.toISOString().slice(0, 10)}）
---
${text.slice(0, SUMMARY_MAX_INPUT)}`;

  const res = await generateText(
    { orgId: org.id, userId: user.id, feature: "meeting_summary" },
    prompt,
    2048,
  );
  if (!res.ok) return res;

  await db.meeting.update({
    where: { id },
    data: { aiSummary: res.text, aiSummaryAt: new Date() },
  });
  revalidatePath("/meetings");
  revalidatePath(`/meetings/${id}`);
  return { ok: true as const };
}
