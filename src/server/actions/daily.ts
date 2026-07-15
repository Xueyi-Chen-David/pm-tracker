"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { requireActiveOrg } from "@/server/org";
import { getMembershipGraph } from "@/server/queries";
import { canViewReportOf } from "@/server/hierarchy";
import { sendPushToUser } from "@/server/push";
import { todayUtc } from "@/lib/date";
import { displayName } from "@/lib/display";

const ItemInput = z.object({
  title: z.string().trim().min(1, "請輸入任務名稱").max(100),
  actual: z.coerce.number().min(0).max(1_000_000_000), // 完成數量
});

const SaveInput = z.object({
  items: z.array(ItemInput).max(30),
  note: z.string().trim().max(50, "說明文字不能超過 50 字").optional(),
});

/**
 * 儲存 / 更新「今天」的每日報告（每人每日一筆）。任何登入成員皆可寫自己的。
 * 內容＝當日任務清單（任務名稱 + 完成數量）＋ 一句說明（≤50 字）。
 */
export async function saveDailyReport(input: z.input<typeof SaveInput>) {
  const { user, org } = await requireActiveOrg();
  const d = SaveInput.parse(input);
  const date = todayUtc();

  const report = await db.dailyReport.upsert({
    where: {
      organizationId_userId_date: {
        organizationId: org.id,
        userId: user.id,
        date,
      },
    },
    update: { note: d.note || null },
    create: {
      organizationId: org.id,
      userId: user.id,
      date,
      note: d.note || null,
    },
    select: { id: true },
  });

  // 任務清單以整份覆寫（每日一筆、數量小，刪除後重建最單純）。
  await db.$transaction([
    db.dailyReportItem.deleteMany({ where: { reportId: report.id } }),
    db.dailyReportItem.createMany({
      data: d.items.map((it, i) => ({
        reportId: report.id,
        title: it.title,
        actual: it.actual,
        sortOrder: i,
      })),
    }),
  ]);

  revalidatePath("/daily");
}

const CommentInput = z.object({
  reportId: z.string().min(1),
  body: z.string().trim().min(1, "請輸入內容").max(1000),
});

/**
 * 對某份每日報告留言。只有本人或（依組織設定的可見範圍）其上級主管可留言。
 * 主管留言後會通知報告作者。
 */
export async function addDailyReportComment(input: z.input<typeof CommentInput>) {
  const { user, org, membership } = await requireActiveOrg();
  const d = CommentInput.parse(input);

  const report = await db.dailyReport.findFirst({
    where: { id: d.reportId, organizationId: org.id },
    select: { id: true, userId: true },
  });
  if (!report) throw new Error("找不到該日報。");

  const [orgRow, graph, authorMember] = await Promise.all([
    db.organization.findUnique({
      where: { id: org.id },
      select: { dailyReportChainVisible: true },
    }),
    getMembershipGraph(org.id),
    db.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: org.id,
          userId: report.userId,
        },
      },
      select: { id: true },
    }),
  ]);
  if (!authorMember) throw new Error("報告作者不在目前組織。");
  const chainVisible = orgRow?.dailyReportChainVisible ?? false;
  if (!canViewReportOf(graph, membership.id, authorMember.id, chainVisible)) {
    throw new Error("你沒有權限留言這份日報。");
  }

  await db.dailyReportComment.create({
    data: { reportId: report.id, authorId: user.id, body: d.body },
  });

  // 通知報告作者（非本人留言時）：站內鈴鐺 + 桌面推播。
  if (report.userId !== user.id) {
    const title = `${displayName(user)} 回饋了你的每日報告`;
    const body = d.body.slice(0, 140);
    await db.notification.create({
      data: {
        organizationId: org.id,
        userId: report.userId,
        type: "daily_comment",
        title,
        body,
        link: "/daily",
      },
    });
    await sendPushToUser(report.userId, {
      title,
      body,
      link: "/daily",
      tag: "daily_comment",
    });
  }
  revalidatePath("/daily");
}
