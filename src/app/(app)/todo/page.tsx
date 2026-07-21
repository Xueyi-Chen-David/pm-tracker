import { requireActiveOrg } from "@/server/org";
import { db } from "@/server/db";
import { todayUtc } from "@/lib/date";
import { PageHeader } from "@/components/page-header";
import { TodoWorkspace } from "@/components/todo/todo-workspace";

export const metadata = { title: "待辦 / 番茄鐘 · Project Pulse" };

function ymd(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

export default async function TodoPage() {
  const { org, user } = await requireActiveOrg();

  const [todos, pomodoros, myTasks, todayReport] = await Promise.all([
    db.todoItem.findMany({
      where: { userId: user.id, organizationId: org.id },
      orderBy: [{ done: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        title: true,
        note: true,
        done: true,
        startDate: true,
        dueDate: true,
        task: {
          select: {
            id: true,
            title: true,
            status: true,
            project: { select: { name: true } },
          },
        },
        _count: { select: { pomodoros: true } },
      },
    }),
    db.pomodoroSession.findMany({
      where: { userId: user.id, organizationId: org.id },
      orderBy: { startedAt: "desc" },
      take: 200,
      select: {
        id: true,
        startedAt: true,
        durationSec: true,
        todoId: true,
        todo: { select: { title: true } },
      },
    }),
    // 可關聯的任務：指派給本人、且進行中的任務（已完成 / 已取消不列入）。
    db.task.findMany({
      where: {
        project: { organizationId: org.id, archived: false },
        owners: { some: { id: user.id } },
        status: { notIn: ["DONE", "CANCELLED"] },
      },
      orderBy: [{ project: { sortOrder: "asc" } }, { sortOrder: "asc" }],
      select: { id: true, title: true, project: { select: { name: true } } },
    }),
    // 今日報告的工作項目標題——用來標示待辦是否已「丟到今日報告」。
    db.dailyReport.findFirst({
      where: { userId: user.id, organizationId: org.id, date: todayUtc() },
      select: { items: { select: { title: true } } },
    }),
  ]);

  const taskLabel = (t: {
    title: string;
    project: { name: string } | null;
  }) => (t.project?.name ? `${t.project.name} · ${t.title}` : t.title);

  const todoView = todos.map((t) => {
    // 關聯的任務若已完成 / 已取消，就不再顯示關聯（視同未關聯）。
    const linked =
      t.task && t.task.status !== "DONE" && t.task.status !== "CANCELLED"
        ? t.task
        : null;
    return {
      id: t.id,
      title: t.title,
      note: t.note,
      done: t.done,
      startDate: ymd(t.startDate),
      dueDate: ymd(t.dueDate),
      taskId: linked?.id ?? null,
      taskLabel: linked ? taskLabel(linked) : null,
      pomodoroCount: t._count.pomodoros,
    };
  });

  const pomodoroView = pomodoros.map((p) => ({
    id: p.id,
    startedAt: p.startedAt.toISOString(),
    durationSec: p.durationSec,
    todoId: p.todoId,
    todoTitle: p.todo?.title ?? null,
  }));

  const taskOptions = myTasks.map((t) => ({ id: t.id, label: taskLabel(t) }));
  // 已在今日報告的工作項目標題（依標題比對待辦）。
  const reportedTitles = (todayReport?.items ?? []).map((it) => it.title);

  return (
    // 桌機：填滿視窗高度（扣掉 AppContainer 的 py-6＝3rem），讓兩欄各自內部捲動、
    // 與底部保持固定距離；手機維持一般文件捲動。
    <div className="flex flex-col gap-4 lg:h-[calc(100dvh-3rem)] lg:overflow-hidden">
      <PageHeader
        title="待辦 / 番茄鐘"
        description="你個人的待辦清單與番茄鐘專注紀錄。"
      />
      <div className="min-h-0 lg:flex-1">
        <TodoWorkspace
          todos={todoView}
          pomodoros={pomodoroView}
          taskOptions={taskOptions}
          reportedTitles={reportedTitles}
        />
      </div>
    </div>
  );
}
