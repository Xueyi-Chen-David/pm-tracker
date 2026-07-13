"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { requireActiveOrg } from "@/server/org";
import { assertCanEditProject } from "@/server/access";
import { rollupTasks } from "@/lib/tasks";

/** yyyy-mm-dd → UTC 午夜；空/無效回 null。 */
function toUtcDate(v?: string | null): Date | null {
  if (!v) return null;
  const [y, m, d] = v.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d));
}

function revalidate() {
  revalidatePath("/projects");
  revalidatePath("/dashboard");
  revalidatePath("/timeline");
  revalidatePath("/report");
  revalidatePath("/company"); // 連動的季度 KR 鏡像專案值
}

/**
 * 依任務即時重算專案的彙總進度/健康度並回寫。
 * 只有「有納入計算的任務（非取消）」時才回寫；無任務時保留專案自身手動設定值。
 */
async function recomputeProject(projectId: string): Promise<void> {
  const tasks = await db.task.findMany({
    where: { projectId },
    select: { status: true, health: true, progress: true },
  });
  const roll = rollupTasks(tasks);
  if (roll.total === 0) return;
  await db.project.update({
    where: { id: projectId },
    data: { progress: roll.progress, health: roll.health },
  });
}

// ── 建立 ──────────────────────────────────────────

const TaskCreateInput = z.object({
  projectId: z.string().min(1),
  title: z.string().trim().min(1, "請輸入任務名稱").max(200),
});

export async function createTask(input: z.input<typeof TaskCreateInput>) {
  const { org } = await requireActiveOrg();
  const d = TaskCreateInput.parse(input);
  await assertCanEditProject(org.id, d.projectId);
  const max = await db.task.aggregate({
    where: { projectId: d.projectId },
    _max: { sortOrder: true },
  });
  await db.task.create({
    data: {
      projectId: d.projectId,
      title: d.title,
      sortOrder: (max._max.sortOrder ?? 0) + 1,
    },
  });
  await recomputeProject(d.projectId);
  revalidate();
}

// ── 更新 ──────────────────────────────────────────

const TaskPatch = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  status: z
    .enum(["NOT_STARTED", "IN_PROGRESS", "DONE", "BLOCKED", "CANCELLED"])
    .optional(),
  health: z.enum(["GREEN", "YELLOW", "RED"]).optional(),
  progress: z.number().int().min(0).max(100).optional(),
  note: z.string().max(2000).nullable().optional(),
  dueDate: z.string().nullable().optional(),
  ownerLabel: z.string().max(200).nullable().optional(),
});

export async function updateTask(id: string, patch: z.input<typeof TaskPatch>) {
  const { org } = await requireActiveOrg();
  const p = TaskPatch.parse(patch);
  // 確認任務屬於本組織的專案
  const task = await db.task.findFirst({
    where: { id, project: { organizationId: org.id } },
    select: { projectId: true },
  });
  if (!task) throw new Error("找不到任務");
  await db.task.update({
    where: { id },
    data: {
      ...(p.title !== undefined ? { title: p.title } : {}),
      ...(p.status !== undefined ? { status: p.status } : {}),
      ...(p.health !== undefined ? { health: p.health } : {}),
      ...(p.progress !== undefined ? { progress: p.progress } : {}),
      ...(p.note !== undefined ? { note: p.note || null } : {}),
      ...(p.dueDate !== undefined ? { dueDate: toUtcDate(p.dueDate) } : {}),
      ...(p.ownerLabel !== undefined ? { ownerLabel: p.ownerLabel || null } : {}),
    },
  });
  // 狀態/進度/健康度變動才需重算專案彙總
  if (
    p.status !== undefined ||
    p.progress !== undefined ||
    p.health !== undefined
  ) {
    await recomputeProject(task.projectId);
  }
  revalidate();
}

export async function setTaskOwners(id: string, userIds: string[]) {
  const { org } = await requireActiveOrg();
  const task = await db.task.findFirst({
    where: { id, project: { organizationId: org.id } },
    select: { id: true },
  });
  if (!task) throw new Error("找不到任務");
  // 僅接受本組織成員
  const members = await db.organizationMember.findMany({
    where: { organizationId: org.id, userId: { in: userIds } },
    select: { userId: true },
  });
  const validIds = members.map((m) => m.userId);
  await db.task.update({
    where: { id },
    data: { owners: { set: validIds.map((uid) => ({ id: uid })) } },
  });
  revalidate();
}

export async function deleteTask(id: string) {
  const { org } = await requireActiveOrg();
  const task = await db.task.findFirst({
    where: { id, project: { organizationId: org.id } },
    select: { projectId: true },
  });
  if (!task) throw new Error("找不到任務");
  await db.task.delete({ where: { id } });
  await recomputeProject(task.projectId);
  revalidate();
}
