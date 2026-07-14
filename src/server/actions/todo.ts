"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { requireActiveOrg } from "@/server/org";

// 個人待辦（Todo）+ 番茄鐘（Pomodoro）的伺服器動作。全部以「目前使用者」收斂——
// 每個人只能看 / 改自己的，不涉及他人資料。

/** yyyy-mm-dd → UTC 午夜；空 / 無效回 null。 */
function toUtcDate(v?: string | null): Date | null {
  if (!v) return null;
  const [y, m, d] = v.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d));
}

/** 確認某任務屬於目前組織（可被本人關聯）；回傳有效 taskId 或 null。 */
async function resolveTaskId(
  orgId: string,
  taskId: string | null | undefined,
): Promise<string | null> {
  if (!taskId) return null;
  const task = await db.task.findFirst({
    where: { id: taskId, project: { organizationId: orgId } },
    select: { id: true },
  });
  return task?.id ?? null;
}

// ── 待辦（Todo）──────────────────────────────────────────

const TodoCreate = z.object({
  title: z.string().trim().min(1, "請輸入待辦內容").max(300),
  note: z.string().trim().max(2000).nullish(),
  taskId: z.string().nullish(),
  startDate: z.string().nullish(),
  dueDate: z.string().nullish(),
});

export async function createTodo(input: z.input<typeof TodoCreate>) {
  const { org, user } = await requireActiveOrg();
  const d = TodoCreate.parse(input);
  const max = await db.todoItem.aggregate({
    where: { userId: user.id, organizationId: org.id },
    _max: { sortOrder: true },
  });
  const todo = await db.todoItem.create({
    data: {
      userId: user.id,
      organizationId: org.id,
      title: d.title,
      note: d.note?.trim() || null,
      taskId: await resolveTaskId(org.id, d.taskId),
      startDate: toUtcDate(d.startDate),
      dueDate: toUtcDate(d.dueDate),
      sortOrder: (max._max.sortOrder ?? 0) + 1,
    },
    select: { id: true },
  });
  revalidatePath("/todo");
  return { ok: true as const, id: todo.id };
}

const TodoPatch = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1).max(300).optional(),
  note: z.string().trim().max(2000).optional(),
  done: z.boolean().optional(),
  taskId: z.string().nullish(),
  startDate: z.string().nullish(),
  dueDate: z.string().nullish(),
  // 用來區分「未提供」與「明確清成 null」。
  clearTask: z.boolean().optional(),
  clearStart: z.boolean().optional(),
  clearDue: z.boolean().optional(),
});

export async function updateTodo(input: z.input<typeof TodoPatch>) {
  const { org, user } = await requireActiveOrg();
  const p = TodoPatch.parse(input);
  const res = await db.todoItem.updateMany({
    where: { id: p.id, userId: user.id, organizationId: org.id },
    data: {
      ...(p.title !== undefined ? { title: p.title } : {}),
      ...(p.note !== undefined ? { note: p.note.trim() || null } : {}),
      ...(p.done !== undefined ? { done: p.done } : {}),
      ...(p.clearTask
        ? { taskId: null }
        : p.taskId !== undefined && p.taskId !== null
          ? { taskId: await resolveTaskId(org.id, p.taskId) }
          : {}),
      ...(p.clearStart
        ? { startDate: null }
        : p.startDate !== undefined && p.startDate !== null
          ? { startDate: toUtcDate(p.startDate) }
          : {}),
      ...(p.clearDue
        ? { dueDate: null }
        : p.dueDate !== undefined && p.dueDate !== null
          ? { dueDate: toUtcDate(p.dueDate) }
          : {}),
    },
  });
  if (res.count === 0) throw new Error("找不到待辦");
  revalidatePath("/todo");
  return { ok: true as const };
}

export async function deleteTodo(id: string) {
  const { org, user } = await requireActiveOrg();
  const res = await db.todoItem.deleteMany({
    where: { id, userId: user.id, organizationId: org.id },
  });
  if (res.count === 0) throw new Error("找不到待辦");
  revalidatePath("/todo");
  return { ok: true as const };
}

// ── 番茄鐘（Pomodoro）─────────────────────────────────────

const PomodoroInput = z.object({
  durationSec: z.number().int().min(1).max(24 * 3600),
  todoId: z.string().nullish(),
  startedAt: z.string().datetime().nullish(),
});

/** 記錄一次番茄鐘專注。todoId 可選；會確認該待辦屬於本人。 */
export async function logPomodoro(input: z.input<typeof PomodoroInput>) {
  const { org, user } = await requireActiveOrg();
  const d = PomodoroInput.parse(input);
  let todoId: string | null = null;
  if (d.todoId) {
    const todo = await db.todoItem.findFirst({
      where: { id: d.todoId, userId: user.id, organizationId: org.id },
      select: { id: true },
    });
    todoId = todo?.id ?? null;
  }
  await db.pomodoroSession.create({
    data: {
      userId: user.id,
      organizationId: org.id,
      todoId,
      durationSec: d.durationSec,
      startedAt: d.startedAt ? new Date(d.startedAt) : new Date(),
    },
  });
  revalidatePath("/todo");
  return { ok: true as const };
}

export async function deletePomodoro(id: string) {
  const { org, user } = await requireActiveOrg();
  const res = await db.pomodoroSession.deleteMany({
    where: { id, userId: user.id, organizationId: org.id },
  });
  if (res.count === 0) throw new Error("找不到番茄鐘紀錄");
  revalidatePath("/todo");
  return { ok: true as const };
}
