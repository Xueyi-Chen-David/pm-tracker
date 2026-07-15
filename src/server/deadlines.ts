import { db } from "@/server/db";

/**
 * 到期通知：找出「今天到期」且尚未完成的項目（任務 / 里程碑 / 專案），
 * 對每個組織的所有在職成員各建立一筆站內通知（鈴鐺）。
 *
 * - 到期＝該項目的期限日就是今天（UTC 日期）。任務 dueDate / 里程碑 plannedDate /
 *   專案 targetDate。已完成 / 取消 / 已達成 / 封存者不通知。
 * - 「通知給所有人」＝該組織所有 active 成員。
 * - 去重：以 notification.type = `deadline:<kind>:<id>` 當唯一鍵；同一天已發過就跳過
 *   （避免 cron 同日重跑重複轟炸）。次日該項目已逾期、不再落在「今天」，自然不會再通知。
 *
 * 由每日 cron（/api/cron/deadlines）呼叫。now 由呼叫端傳入以利測試。
 */
export type DeadlineSummary = {
  organizations: number;
  tasksDue: number;
  milestonesDue: number;
  projectsDue: number;
  notificationsCreated: number;
  itemsSkipped: number;
  /** 任務「前 N 天」到期提醒建立的通知數。 */
  remindersCreated: number;
};

const DAY_MS = 24 * 3600 * 1000;

type NoticeItem = { key: string; title: string; body: string; link: string };

export async function runDeadlineNotifications(
  now: Date,
): Promise<DeadlineSummary> {
  // 今天（UTC）的日期範圍 [todayStart, tomorrowStart)。
  const todayStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const tomorrowStart = new Date(todayStart.getTime() + 24 * 3600 * 1000);
  const dueToday = { gte: todayStart, lt: tomorrowStart };

  const orgs = await db.organization.findMany({ select: { id: true } });
  const summary: DeadlineSummary = {
    organizations: orgs.length,
    tasksDue: 0,
    milestonesDue: 0,
    projectsDue: 0,
    notificationsCreated: 0,
    itemsSkipped: 0,
    remindersCreated: 0,
  };

  for (const { id: organizationId } of orgs) {
    const members = await db.organizationMember.findMany({
      where: { organizationId, active: true },
      select: { userId: true },
    });
    const userIds = [...new Set(members.map((m) => m.userId))];
    if (userIds.length === 0) continue;

    // 今天已發過的到期通知（依 type 去重）。
    const already = await db.notification.findMany({
      where: {
        organizationId,
        type: { startsWith: "deadline:" },
        createdAt: { gte: todayStart },
      },
      select: { type: true },
      distinct: ["type"],
    });
    const notified = new Set(already.map((n) => n.type));

    const items: NoticeItem[] = [];

    const tasks = await db.task.findMany({
      where: {
        project: { organizationId },
        dueDate: dueToday,
        status: { notIn: ["DONE", "CANCELLED"] },
      },
      select: { id: true, title: true, project: { select: { id: true, name: true } } },
    });
    summary.tasksDue += tasks.length;
    for (const t of tasks) {
      items.push({
        key: `deadline:task:${t.id}`,
        title: `任務今天到期：${t.title}`,
        body: `專案「${t.project.name}」的任務今天到期。`,
        link: `/projects/${t.project.id}`,
      });
    }

    const milestones = await db.milestone.findMany({
      where: {
        project: { organizationId },
        plannedDate: dueToday,
        status: { notIn: ["DONE", "MISSED"] },
      },
      select: { id: true, title: true, project: { select: { id: true, name: true } } },
    });
    summary.milestonesDue += milestones.length;
    for (const ms of milestones) {
      items.push({
        key: `deadline:milestone:${ms.id}`,
        title: `里程碑今天到期：${ms.title}`,
        body: `專案「${ms.project.name}」的里程碑今天到期。`,
        link: `/projects/${ms.project.id}`,
      });
    }

    const projects = await db.project.findMany({
      where: {
        organizationId,
        archived: false,
        targetDate: dueToday,
        status: { notIn: ["COMPLETED", "CANCELLED"] },
      },
      select: { id: true, name: true },
    });
    summary.projectsDue += projects.length;
    for (const p of projects) {
      items.push({
        key: `deadline:project:${p.id}`,
        title: `專案今天到達完成日：${p.name}`,
        body: `專案「${p.name}」的理想完成日就是今天。`,
        link: `/projects/${p.id}`,
      });
    }

    const rows: {
      organizationId: string;
      userId: string;
      type: string;
      title: string;
      body: string;
      link: string;
    }[] = [];
    for (const it of items) {
      if (notified.has(it.key)) {
        summary.itemsSkipped++;
        continue;
      }
      for (const userId of userIds) {
        rows.push({
          organizationId,
          userId,
          type: it.key,
          title: it.title,
          body: it.body,
          link: it.link,
        });
      }
    }
    if (rows.length > 0) {
      await db.notification.createMany({ data: rows });
      summary.notificationsCreated += rows.length;
    }

    // ── 任務「前 N 天」到期提醒 ──────────────────────────
    // 今天已發過的提醒（依 type 去重），避免 cron 同日重跑重複轟炸。
    const remindedRows = await db.notification.findMany({
      where: {
        organizationId,
        type: { startsWith: "reminder:task:" },
        createdAt: { gte: todayStart },
      },
      select: { type: true },
      distinct: ["type"],
    });
    const reminded = new Set(remindedRows.map((n) => n.type));

    // 未到期、未完成、且有設定提醒天數的任務。
    const remindTasks = await db.task.findMany({
      where: {
        project: { organizationId },
        dueDate: { gte: todayStart },
        status: { notIn: ["DONE", "CANCELLED"] },
        reminderDays: { isEmpty: false },
      },
      select: {
        id: true,
        title: true,
        dueDate: true,
        reminderDays: true,
        owners: { select: { id: true } },
        project: { select: { id: true, name: true } },
      },
    });

    const reminderRows: typeof rows = [];
    for (const t of remindTasks) {
      if (!t.dueDate) continue;
      // 收件人：任務負責人；無負責人則退回全體在職成員（避免提醒沒人收到）。
      const recipients = t.owners.length
        ? [...new Set(t.owners.map((o) => o.id))]
        : userIds;
      for (const n of t.reminderDays) {
        // dueDate 與 todayStart 皆為 UTC 午夜；提醒日＝到期日往前 n 天。
        if (t.dueDate.getTime() - n * DAY_MS !== todayStart.getTime()) continue;
        const key = `reminder:task:${t.id}:${n}`;
        if (reminded.has(key)) {
          summary.itemsSkipped++;
          continue;
        }
        for (const userId of recipients) {
          reminderRows.push({
            organizationId,
            userId,
            type: key,
            title: `任務將於 ${n} 天後到期：${t.title}`,
            body: `專案「${t.project.name}」的任務「${t.title}」將於 ${n} 天後到期。`,
            link: `/projects/${t.project.id}`,
          });
        }
      }
    }
    if (reminderRows.length > 0) {
      await db.notification.createMany({ data: reminderRows });
      summary.remindersCreated += reminderRows.length;
    }
  }

  return summary;
}
