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
import { isReactionEmoji } from "@/lib/daily";

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

/**
 * 把一筆待辦「丟到今日報告」：以待辦標題新增一筆今日報告的工作項目。
 * 今日報告不存在時自動建立；已有同名工作項目則略過（不重複）。
 * 完成數量留 0，讓使用者稍後在報告表單自行填。
 */
export async function addTodoToDailyReport(todoId: string) {
  const { org, user } = await requireActiveOrg();
  const id = z.string().min(1).parse(todoId);
  // 待辦需屬於本人。
  const todo = await db.todoItem.findFirst({
    where: { id, userId: user.id, organizationId: org.id },
    select: { title: true },
  });
  // 「找不到待辦」/「待辦沒有內容」是可能的正常情境（例如待辦已在別的分頁被刪除、或標題
  // 只剩空白），以回傳值而非 throw 帶回——正式環境 Server Action 丟出的 Error 訊息
  // 會被 Next.js 隱去。
  if (!todo) return { ok: false as const, error: "找不到待辦" };
  const title = todo.title.trim();
  if (!title) return { ok: false as const, error: "待辦沒有內容" };

  const date = todayUtc();
  const report = await db.dailyReport.upsert({
    where: {
      organizationId_userId_date: {
        organizationId: org.id,
        userId: user.id,
        date,
      },
    },
    update: {},
    create: { organizationId: org.id, userId: user.id, date },
    select: { id: true },
  });

  const existing = await db.dailyReportItem.findFirst({
    where: { reportId: report.id, title },
    select: { id: true },
  });
  if (existing) {
    revalidatePath("/todo");
    return { ok: true as const, already: true };
  }

  const max = await db.dailyReportItem.aggregate({
    where: { reportId: report.id },
    _max: { sortOrder: true },
  });
  await db.dailyReportItem.create({
    data: {
      reportId: report.id,
      title,
      sortOrder: (max._max.sortOrder ?? 0) + 1,
    },
  });
  revalidatePath("/daily");
  revalidatePath("/todo");
  return { ok: true as const };
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

  // 「找不到該日報」是正常情境（例如日報剛好在此時被刪除），以回傳值而非 throw
  // 帶回——正式環境 Server Action 丟出的 Error 訊息會被 Next.js 隱去。
  const report = await db.dailyReport.findFirst({
    where: { id: d.reportId, organizationId: org.id },
    select: { id: true, userId: true },
  });
  if (!report) return { ok: false as const, error: "找不到該日報。" };

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
  // 內部完整性檢查（authorId 來自日報記錄本身，非使用者輸入）——正常操作下不會
  // 觸發，維持 throw 即可。
  if (!authorMember) throw new Error("報告作者不在目前組織。");
  const chainVisible = orgRow?.dailyReportChainVisible ?? false;
  // 「無權限留言」是真實可能發生的商業規則（例如可見範圍設定變動、或透過 view-as），
  // 以回傳值帶回。
  if (!canViewReportOf(graph, membership.id, authorMember.id, chainVisible)) {
    return { ok: false as const, error: "你沒有權限留言這份日報。" };
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
  return { ok: true as const };
}

const ReactionInput = z.object({
  reportId: z.string().min(1),
  emoji: z.string().refine(isReactionEmoji, "不支援的表情"),
});

/**
 * 對某份每日報告切換一個表情回應（emoji reaction）。
 * 已按過同一 emoji＝取消，否則＝新增。權限與留言相同：本人或可見範圍內的上級主管。
 * 新增（非本人）時通知報告作者。回傳最新的 { reacted } 供前端樂觀更新。
 */
export async function toggleDailyReportReaction(
  input: z.input<typeof ReactionInput>,
) {
  const { user, org, membership } = await requireActiveOrg();
  const d = ReactionInput.parse(input);

  // 「找不到該日報」是正常情境（例如日報剛好在此時被刪除），以回傳值而非 throw
  // 帶回——正式環境 Server Action 丟出的 Error 訊息會被 Next.js 隱去。
  const report = await db.dailyReport.findFirst({
    where: { id: d.reportId, organizationId: org.id },
    select: { id: true, userId: true },
  });
  if (!report) return { ok: false as const, error: "找不到該日報。" };

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
  // 內部完整性檢查（authorId 來自日報記錄本身，非使用者輸入）——正常操作下不會
  // 觸發，維持 throw 即可。
  if (!authorMember) throw new Error("報告作者不在目前組織。");
  const chainVisible = orgRow?.dailyReportChainVisible ?? false;
  // 「無權限回應」是真實可能發生的商業規則（例如可見範圍設定變動、或透過 view-as），
  // 以回傳值帶回。
  if (!canViewReportOf(graph, membership.id, authorMember.id, chainVisible)) {
    return { ok: false as const, error: "你沒有權限回應這份日報。" };
  }

  const existing = await db.dailyReportReaction.findUnique({
    where: {
      reportId_userId_emoji: {
        reportId: report.id,
        userId: user.id,
        emoji: d.emoji,
      },
    },
    select: { id: true },
  });

  if (existing) {
    await db.dailyReportReaction.delete({ where: { id: existing.id } });
    revalidatePath("/daily");
    return { ok: true as const, reacted: false as const };
  }

  await db.dailyReportReaction.create({
    data: { reportId: report.id, userId: user.id, emoji: d.emoji },
  });

  // 新增回應且非本人 → 通知報告作者（站內鈴鐺 + 桌面推播）。
  if (report.userId !== user.id) {
    const title = `${displayName(user)} 對你的每日報告按了 ${d.emoji}`;
    await db.notification.create({
      data: {
        organizationId: org.id,
        userId: report.userId,
        type: "daily_reaction",
        title,
        body: null,
        link: "/daily",
      },
    });
    await sendPushToUser(report.userId, {
      title,
      body: "",
      link: "/daily",
      tag: "daily_reaction",
    });
  }
  revalidatePath("/daily");
  return { ok: true as const, reacted: true as const };
}
