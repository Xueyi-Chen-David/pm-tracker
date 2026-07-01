"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { requireActiveOrg } from "@/server/org";
import { assertCanEditProject } from "@/server/access";
import { logActivity } from "@/server/activity";
import { weekStartOf, weekLabel } from "@/lib/date";

export type WeeklyActionState = { error?: string; ok?: boolean } | null;

const WeeklyInput = z.object({
  projectId: z.string().min(1),
  weekStart: z.string().min(1),
  progress: z.coerce.number().int().min(0).max(100),
  health: z.enum(["GREEN", "YELLOW", "RED"]),
  thisWeekGoals: z.string().trim().max(4000).optional(),
  thisWeekDone: z.string().trim().max(4000).optional(),
  nextWeekGoals: z.string().trim().max(4000).optional(),
  risks: z.string().trim().max(4000).optional(),
  needsDecision: z.string().trim().max(4000).optional(),
  note: z.string().trim().max(4000).optional(),
});

const TaskInput = z.object({
  title: z.string().trim().min(1).max(300),
  assigneeId: z.string().nullish(),
  done: z.boolean().optional(),
});

function parseTasks(raw: FormDataEntryValue | null) {
  if (typeof raw !== "string" || !raw) return [];
  try {
    const arr: unknown = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .map((t) => TaskInput.safeParse(t))
      .filter((r) => r.success)
      .map((r) => ({
        title: r.data.title,
        assigneeId: r.data.assigneeId || null,
        done: !!r.data.done,
      }))
      .slice(0, 50);
  } catch {
    return [];
  }
}

/** 把某筆週報的任務清單同步成傳入的內容（整批取代）。 */
async function syncWeeklyTasks(
  orgId: string,
  weeklyUpdateId: string,
  tasks: { title: string; assigneeId: string | null; done: boolean }[],
) {
  await db.weeklyTask.deleteMany({ where: { weeklyUpdateId } });
  if (!tasks.length) return;
  // 過濾不存在 / 非本組織成員的負責人，避免外鍵錯誤與跨組織指派
  const ids = [...new Set(tasks.map((t) => t.assigneeId).filter(Boolean))] as string[];
  const valid = new Set(
    ids.length
      ? (
          await db.user.findMany({
            where: {
              id: { in: ids },
              organizationMemberships: { some: { organizationId: orgId } },
            },
            select: { id: true },
          })
        ).map((u) => u.id)
      : [],
  );
  await db.weeklyTask.createMany({
    data: tasks.map((t, i) => ({
      weeklyUpdateId,
      title: t.title,
      done: t.done,
      assigneeId: t.assigneeId && valid.has(t.assigneeId) ? t.assigneeId : null,
      sortOrder: i,
    })),
  });
}

/** 把專案的整體進度 / 健康度同步成「最新一週」的數值。 */
async function syncProjectHeadline(projectId: string) {
  const latest = await db.weeklyUpdate.findFirst({
    where: { projectId },
    orderBy: { weekStart: "desc" },
    select: { progress: true, health: true },
  });
  if (latest) {
    await db.project.update({
      where: { id: projectId },
      data: { progress: latest.progress, health: latest.health },
    });
  }
}

export async function upsertWeeklyUpdateAction(
  _prev: WeeklyActionState,
  formData: FormData,
): Promise<WeeklyActionState> {
  const { user, org } = await requireActiveOrg();
  const parsed = WeeklyInput.safeParse({
    projectId: formData.get("projectId"),
    weekStart: formData.get("weekStart"),
    progress: formData.get("progress") ?? 0,
    health: formData.get("health"),
    thisWeekGoals: formData.get("thisWeekGoals") || undefined,
    thisWeekDone: formData.get("thisWeekDone") || undefined,
    nextWeekGoals: formData.get("nextWeekGoals") || undefined,
    risks: formData.get("risks") || undefined,
    needsDecision: formData.get("needsDecision") || undefined,
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "資料格式錯誤" };
  }
  const d = parsed.data;
  await assertCanEditProject(org.id, d.projectId);
  const weekStart = weekStartOf(d.weekStart);
  const tasks = parseTasks(formData.get("tasks"));

  // 編輯既有紀錄時帶入原本週次；若新週次不同＝把這筆「移動」到新的週。
  const originalRaw = formData.get("originalWeekStart");
  const originalWeekStart = originalRaw ? weekStartOf(String(originalRaw)) : null;
  const isMove =
    !!originalWeekStart && originalWeekStart.getTime() !== weekStart.getTime();

  const fields = {
    progress: d.progress,
    health: d.health,
    thisWeekGoals: d.thisWeekGoals || null,
    thisWeekDone: d.thisWeekDone || null,
    nextWeekGoals: d.nextWeekGoals || null,
    risks: d.risks || null,
    needsDecision: d.needsDecision || null,
    note: d.note || null,
    authorId: user.id,
  };

  // 目標週是否已有紀錄（用於去重 / 防止移動時覆蓋）
  const target = await db.weeklyUpdate.findUnique({
    where: { projectId_weekStart: { projectId: d.projectId, weekStart } },
    select: { id: true },
  });
  let wasUpdate = !!target;

  if (isMove) {
    if (target) {
      return {
        error: `目標週（${weekLabel(weekStart)}）已有進度紀錄，無法移到該週；請先刪除該週紀錄或改填其他週。`,
      };
    }
    const original = await db.weeklyUpdate.findUnique({
      where: {
        projectId_weekStart: {
          projectId: d.projectId,
          weekStart: originalWeekStart,
        },
      },
      select: { id: true },
    });
    if (original) {
      await db.weeklyUpdate.update({
        where: { id: original.id },
        data: { weekStart, ...fields },
      });
      wasUpdate = true;
    } else {
      // 原紀錄已不存在（例如被刪），直接在新週建立
      await db.weeklyUpdate.create({
        data: { projectId: d.projectId, weekStart, ...fields },
      });
      wasUpdate = false;
    }
  } else {
    await db.weeklyUpdate.upsert({
      where: {
        projectId_weekStart: { projectId: d.projectId, weekStart },
      },
      update: fields,
      create: { projectId: d.projectId, weekStart, ...fields },
    });
  }

  // 取得這筆週報並同步任務清單
  const saved = await db.weeklyUpdate.findUnique({
    where: { projectId_weekStart: { projectId: d.projectId, weekStart } },
    select: { id: true },
  });
  if (saved) await syncWeeklyTasks(org.id, saved.id, tasks);

  await syncProjectHeadline(d.projectId);

  await logActivity({
    projectId: d.projectId,
    kind: "WEEKLY",
    message: `${isMove ? "調整" : wasUpdate ? "更新" : "新增"}了 ${weekLabel(weekStart)} 週報`,
    userId: user.id,
  });

  revalidatePath(`/projects/${d.projectId}`);
  revalidatePath("/dashboard");
  revalidatePath("/report");
  return { ok: true };
}

export async function deleteWeeklyUpdate(input: {
  id: string;
  projectId: string;
}) {
  const { user, org } = await requireActiveOrg();
  await assertCanEditProject(org.id, input.projectId);
  const removed = await db.weeklyUpdate.delete({
    where: { id: input.id },
    select: { weekStart: true },
  });
  await syncProjectHeadline(input.projectId);
  await logActivity({
    projectId: input.projectId,
    kind: "WEEKLY",
    message: `刪除了 ${weekLabel(removed.weekStart)} 週報`,
    userId: user.id,
  });
  revalidatePath(`/projects/${input.projectId}`);
  revalidatePath("/dashboard");
}
