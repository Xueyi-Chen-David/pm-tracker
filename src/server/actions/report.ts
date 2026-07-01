"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { requireActiveOrg } from "@/server/org";
import { weekStartOf } from "@/lib/date";
import { htmlHasContent, sanitizeReportHtml } from "@/lib/report-content";

const DocInput = z.object({
  weekStart: z.string().min(1),
  html: z.string().max(16_000_000),
  // 純文字鏡像（由編輯器的可見文字取得，不含圖片 raw data）
  text: z.string().max(40000),
});

/** 儲存某週週報「整體說明」文件（doc 風格 HTML + 純文字鏡像）；全空＝刪除。 */
export async function saveWeeklyReportDoc(input: z.input<typeof DocInput>) {
  const { org } = await requireActiveOrg();
  const d = DocInput.parse(input);
  const weekStart = weekStartOf(d.weekStart);
  const html = sanitizeReportHtml(d.html);
  const text = d.text.trim();

  if (!htmlHasContent(html)) {
    await db.weeklyReport.deleteMany({
      where: { organizationId: org.id, weekStart },
    });
  } else {
    await db.weeklyReport.upsert({
      where: {
        organizationId_weekStart: { organizationId: org.id, weekStart },
      },
      update: { contentHtml: html, summary: text, images: [] },
      create: {
        organizationId: org.id,
        weekStart,
        contentHtml: html,
        summary: text,
        images: [],
      },
    });
  }
  revalidatePath("/report");
}
