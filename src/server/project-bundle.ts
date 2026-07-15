import { getProject, getKrLinksForProject } from "@/server/queries";
import { thisWeekStart, toDateInput } from "@/lib/date";
import { displayName } from "@/lib/display";

/**
 * 專案「就地展開管理」用的明細（里程碑 / 版本 / 每週 / 團隊 / 軌跡 / OKR），已整形成
 * 前端各面板可直接使用的形狀。專案清單頁只對「展開中」(URL `expand` 參數) 的專案呼叫，
 * 避免一次撈出所有專案的明細。純伺服器函式（非 server action），由 page 直接呼叫，
 * 面板的 router.refresh() 會重跑 page → 重新載入本 bundle，保持資料最新。
 */
export async function getProjectDetailBundle(orgId: string, projectId: string) {
  const [project, okrLinks] = await Promise.all([
    getProject(orgId, projectId),
    getKrLinksForProject(orgId, projectId),
  ]);
  if (!project) return null;

  // 團隊＝在該專案有負責任務的人（Task.owners 聯集），去重。
  const teamMap = new Map<
    string,
    (typeof project.tasks)[number]["owners"][number]
  >();
  for (const t of project.tasks) {
    for (const o of t.owners) if (!teamMap.has(o.id)) teamMap.set(o.id, o);
  }
  const team = [...teamMap.values()];

  const thisWeek = thisWeekStart();

  const weeklyItems = [...project.weeklyUpdates].reverse().map((u) => ({
    id: u.id,
    weekStart: u.weekStart.toISOString(),
    isPast: u.weekStart.getTime() < thisWeek.getTime(),
    progress: u.progress,
    health: u.health,
    thisWeekGoals: u.thisWeekGoals,
    thisWeekDone: u.thisWeekDone,
    nextWeekGoals: u.nextWeekGoals,
    risks: u.risks,
    needsDecision: u.needsDecision,
    note: u.note,
    authorName: u.author ? displayName(u.author) : null,
    tasks: u.tasks.map((t) => ({
      id: t.id,
      title: t.title,
      done: t.done,
      assigneeId: t.assigneeId,
      assigneeName: t.assignee ? displayName(t.assignee) : null,
    })),
  }));

  const prevWeekly = [...project.weeklyUpdates]
    .filter((u) => u.weekStart.getTime() < thisWeek.getTime())
    .at(-1);
  const carryOver = prevWeekly
    ? {
        thisWeekGoals: prevWeekly.nextWeekGoals,
        tasks: prevWeekly.tasks
          .filter((t) => !t.done)
          .map((t) => ({ title: t.title, assigneeId: t.assigneeId, done: false })),
      }
    : undefined;

  return {
    milestones: project.milestones,
    releases: project.releases.map((r) => ({
      id: r.id,
      version: r.version,
      title: r.title,
      notes: r.notes,
      status: r.status,
      releasedAt: r.releasedAt,
    })),
    team,
    weekly: {
      items: weeklyItems,
      // 週報任務指派對象＝專案的任務負責人。
      memberOptions: team,
      defaultWeekStart: toDateInput(thisWeek),
      carryOver,
    },
    okrLinks,
  };
}

export type ProjectDetailBundle = NonNullable<
  Awaited<ReturnType<typeof getProjectDetailBundle>>
>;
