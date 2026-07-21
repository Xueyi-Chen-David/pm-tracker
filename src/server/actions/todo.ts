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

const ReorderTodos = z.object({
  orderedIds: z.array(z.string().min(1)).min(1),
});

/**
 * 調整待辦上下順序。orderedIds＝畫面上「可見清單」的新順序（某個分頁）；為避免打亂另一個
 * 分頁（未完成 / 已完成）的相對位置，採「保留未出現者原位」合併後整體重寫 sortOrder。
 * 只動本人的待辦。
 */
export async function reorderTodos(input: z.input<typeof ReorderTodos>) {
  const { org, user } = await requireActiveOrg();
  const { orderedIds } = ReorderTodos.parse(input);
  const all = await db.todoItem.findMany({
    where: { userId: user.id, organizationId: org.id },
    orderBy: [{ done: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  const fullIds = all.map((t) => t.id);
  const fullSet = new Set(fullIds);
  // 只收確實屬於本人的可見 id（去重、擋越權）。
  const visibleOrder = [...new Set(orderedIds.filter((id) => fullSet.has(id)))];
  const visibleSet = new Set(visibleOrder);
  let qi = 0;
  const merged = fullIds.map((id) =>
    visibleSet.has(id) ? visibleOrder[qi++]! : id,
  );
  await db.$transaction(
    merged.map((id, idx) =>
      db.todoItem.update({ where: { id }, data: { sortOrder: idx } }),
    ),
  );
  revalidatePath("/todo");
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

const PomodoroPatch = z.object({
  id: z.string().min(1),
  durationSec: z.number().int().min(1).max(24 * 3600).optional(),
  todoId: z.string().nullish(),
  clearTodo: z.boolean().optional(),
  // datetime-local 字串（"YYYY-MM-DDTHH:mm"，視為本地時間）。
  startedAt: z.string().optional(),
});

/** 編輯一筆番茄鐘紀錄（時長 / 關聯待辦 / 開始時間）。限本人本組織。 */
export async function updatePomodoro(input: z.input<typeof PomodoroPatch>) {
  const { org, user } = await requireActiveOrg();
  const p = PomodoroPatch.parse(input);

  // 關聯待辦：clearTodo＝清除；提供 todoId＝驗證屬本人後設定；未提供＝不動。
  let todoData: { todoId?: string | null } = {};
  if (p.clearTodo) {
    todoData = { todoId: null };
  } else if (p.todoId) {
    const todo = await db.todoItem.findFirst({
      where: { id: p.todoId, userId: user.id, organizationId: org.id },
      select: { id: true },
    });
    todoData = { todoId: todo?.id ?? null };
  }

  let startedAt: Date | undefined;
  if (p.startedAt) {
    const dt = new Date(p.startedAt);
    if (!isNaN(dt.getTime())) startedAt = dt;
  }

  const res = await db.pomodoroSession.updateMany({
    where: { id: p.id, userId: user.id, organizationId: org.id },
    data: {
      ...(p.durationSec !== undefined ? { durationSec: p.durationSec } : {}),
      ...(startedAt !== undefined ? { startedAt } : {}),
      ...todoData,
    },
  });
  if (res.count === 0) throw new Error("找不到番茄鐘紀錄");
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
