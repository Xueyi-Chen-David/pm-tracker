"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { requireActiveOrg } from "@/server/org";
import { assertCanEditProject } from "@/server/access";
import { logActivity } from "@/server/activity";

const MilestoneInput = z.object({
  projectId: z.string().min(1),
  title: z.string().trim().min(1, "請輸入里程碑名稱").max(200),
  detail: z.string().trim().max(2000).optional(),
  status: z.enum(["PLANNED", "IN_PROGRESS", "DONE", "MISSED"]).optional(),
  plannedDate: z.string().optional(),
  actualDate: z.string().optional(),
  isGoal: z.boolean().optional(),
});

function toDate(v?: string): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

export async function createMilestone(input: z.input<typeof MilestoneInput>) {
  const { user, org } = await requireActiveOrg();
  const d = MilestoneInput.parse(input);
  await assertCanEditProject(org.id, d.projectId);
  const count = await db.milestone.count({ where: { projectId: d.projectId } });
  await db.milestone.create({
    data: {
      projectId: d.projectId,
      title: d.title,
      detail: d.detail || null,
      status: d.status ?? "PLANNED",
      plannedDate: toDate(d.plannedDate),
      actualDate: toDate(d.actualDate),
      isGoal: d.isGoal ?? false,
      sortOrder: count,
    },
  });
  await logActivity({
    projectId: d.projectId,
    kind: "MILESTONE",
    message: `新增${d.isGoal ? "目標" : "里程碑"}「${d.title}」`,
    userId: user.id,
  });
  revalidatePath(`/projects/${d.projectId}`);
  revalidatePath("/timeline");
}

export async function updateMilestone(input: {
  id: string;
  projectId: string;
  title?: string;
  detail?: string;
  status?: "PLANNED" | "IN_PROGRESS" | "DONE" | "MISSED";
  plannedDate?: string;
  actualDate?: string;
  isGoal?: boolean;
}) {
  const { org } = await requireActiveOrg();
  await assertCanEditProject(org.id, input.projectId);
  await db.milestone.update({
    where: { id: input.id },
    data: {
      title: input.title?.trim() || undefined,
      detail: input.detail === undefined ? undefined : input.detail || null,
      status: input.status,
      plannedDate:
        input.plannedDate === undefined ? undefined : toDate(input.plannedDate),
      actualDate:
        input.actualDate === undefined ? undefined : toDate(input.actualDate),
      isGoal: input.isGoal,
    },
  });
  revalidatePath(`/projects/${input.projectId}`);
  revalidatePath("/timeline");
}

/** 切換完成狀態：完成時記錄今天為實際達成日。 */
export async function toggleMilestoneDone(input: {
  id: string;
  projectId: string;
  done: boolean;
}) {
  const { user, org } = await requireActiveOrg();
  await assertCanEditProject(org.id, input.projectId);
  const m = await db.milestone.update({
    where: { id: input.id },
    data: {
      status: input.done ? "DONE" : "PLANNED",
      actualDate: input.done ? new Date() : null,
    },
    select: { title: true, isGoal: true },
  });
  await logActivity({
    projectId: input.projectId,
    kind: "MILESTONE",
    message: `${input.done ? "完成" : "取消完成"}${m.isGoal ? "目標" : "里程碑"}「${m.title}」`,
    userId: user.id,
  });
  revalidatePath(`/projects/${input.projectId}`);
  revalidatePath("/timeline");
}

export async function deleteMilestone(input: {
  id: string;
  projectId: string;
}) {
  const { user, org } = await requireActiveOrg();
  await assertCanEditProject(org.id, input.projectId);
  const m = await db.milestone.delete({
    where: { id: input.id },
    select: { title: true, isGoal: true },
  });
  await logActivity({
    projectId: input.projectId,
    kind: "MILESTONE",
    message: `刪除${m.isGoal ? "目標" : "里程碑"}「${m.title}」`,
    userId: user.id,
  });
  revalidatePath(`/projects/${input.projectId}`);
  revalidatePath("/timeline");
}
