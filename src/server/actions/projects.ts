"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { requireActiveOrg, isManagerOrBoss } from "@/server/org";
import { assertCanEditProject } from "@/server/access";
import { logActivity } from "@/server/activity";
import { HEALTH, PROJECT_STATUS } from "@/lib/constants";

export type ActionState = { error?: string } | null;

const ProjectInput = z.object({
  name: z.string().trim().min(1, "請輸入名稱").max(200),
  type: z.enum(["ROUTINE", "PROJECT", "ONE_TIME"]),
  description: z.string().trim().max(4000).optional().nullable(),
  status: z.enum(["NOT_STARTED", "ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED"]),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]),
  health: z.enum(["GREEN", "YELLOW", "RED"]),
  progress: z.coerce.number().int().min(0).max(100),
  startDate: z.string().optional(),
  targetDate: z.string().optional(),
  ownerId: z.string().optional(),
  color: z.string().optional(),
});

function toDate(v?: string | null): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function parseForm(formData: FormData) {
  return ProjectInput.safeParse({
    name: formData.get("name"),
    type: formData.get("type"),
    description: formData.get("description"),
    status: formData.get("status"),
    priority: formData.get("priority"),
    health: formData.get("health"),
    progress: formData.get("progress") ?? 0,
    startDate: formData.get("startDate") || undefined,
    targetDate: formData.get("targetDate") || undefined,
    ownerId: formData.get("ownerId") || undefined,
    color: formData.get("color") || undefined,
  });
}

export async function createProjectAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, org } = await requireActiveOrg();
  const parsed = parseForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "資料格式錯誤" };
  }
  const d = parsed.data;
  const ownerId = d.ownerId || user.id;

  const now = new Date();
  const project = await db.project.create({
    data: {
      organizationId: org.id,
      name: d.name,
      type: d.type,
      description: d.description || null,
      status: d.status,
      priority: d.priority,
      health: d.health,
      progress: d.progress,
      startDate: toDate(d.startDate),
      targetDate: toDate(d.targetDate),
      color: d.color || null,
      ownerId,
      createdById: user.id,
      // 建立當下即記錄狀態時間戳；若一建立就是「已完成」，同步標記完成日。
      statusChangedAt: now,
      actualEndDate: d.status === "COMPLETED" ? now : null,
    },
  });

  await logActivity({
    projectId: project.id,
    kind: "CREATE",
    message: "建立了專案",
    userId: user.id,
  });

  revalidatePath("/dashboard");
  revalidatePath("/projects");
  redirect(`/projects/${project.id}`);
}

export async function updateProjectAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, org } = await requireActiveOrg();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "缺少專案 ID" };
  await assertCanEditProject(org.id, id);

  const parsed = parseForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "資料格式錯誤" };
  }
  const d = parsed.data;

  const before = await db.project.findUnique({
    where: { id },
    select: {
      name: true,
      type: true,
      description: true,
      status: true,
      priority: true,
      health: true,
      progress: true,
      ownerId: true,
      startDate: true,
      targetDate: true,
      color: true,
    },
  });

  // 只在狀態「真的改變」時才動 statusChangedAt / actualEndDate——否則單純編輯其他欄位
  // 會把完成時間洗成「現在」。狀態沒變時完全不寫這兩欄，保留原值。
  const statusChanged = !before || before.status !== d.status;
  const now = new Date();
  await db.project.update({
    where: { id },
    data: {
      name: d.name,
      type: d.type,
      description: d.description || null,
      status: d.status,
      priority: d.priority,
      health: d.health,
      progress: d.progress,
      startDate: toDate(d.startDate),
      targetDate: toDate(d.targetDate),
      color: d.color || null,
      ownerId: d.ownerId || undefined,
      ...(statusChanged && {
        statusChangedAt: now,
        actualEndDate: d.status === "COMPLETED" ? now : null,
      }),
    },
  });

  // 比對前後值，逐項寫入有意義的操作紀錄
  if (before) {
    if (before.status !== d.status) {
      await logActivity({
        projectId: id,
        kind: "STATUS",
        message: `狀態：${PROJECT_STATUS[before.status].label} → ${PROJECT_STATUS[d.status].label}`,
        userId: user.id,
      });
    }
    if (before.health !== d.health) {
      await logActivity({
        projectId: id,
        kind: "HEALTH",
        message: `健康度：${HEALTH[before.health].label} → ${HEALTH[d.health].label}`,
        userId: user.id,
      });
    }
    if (before.progress !== d.progress) {
      await logActivity({
        projectId: id,
        kind: "PROGRESS",
        message: `進度：${before.progress}% → ${d.progress}%`,
        userId: user.id,
      });
    }
    const otherChanged =
      before.name !== d.name ||
      before.type !== d.type ||
      before.priority !== d.priority ||
      (before.ownerId ?? "") !== (d.ownerId || before.ownerId || "") ||
      (before.description ?? "") !== (d.description || "") ||
      (before.color ?? "") !== (d.color || "");
    if (otherChanged) {
      await logActivity({
        projectId: id,
        kind: "FIELD",
        message: "更新了專案資訊",
        userId: user.id,
      });
    }
  }

  revalidatePath("/dashboard");
  revalidatePath("/projects");
  revalidatePath(`/projects/${id}`);
  redirect(`/projects/${id}`);
}

const StatusHealthInput = z.object({
  projectId: z.string().min(1),
  status: z
    .enum(["NOT_STARTED", "ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED"])
    .optional(),
  health: z.enum(["GREEN", "YELLOW", "RED"]).optional(),
});

/**
 * 詳情頁的「快速調整」：只改狀態 / 健康度並寫入操作紀錄。
 * 「找不到專案」是可能在正常操作中發生的情況（例如專案已被他人刪除）——以回傳值
 * 帶回而非 throw，因為正式環境 Server Action 丟出的 Error 訊息會被 Next.js 隱去。
 */
export async function setProjectStatusHealth(
  input: z.input<typeof StatusHealthInput>,
) {
  const { user, org } = await requireActiveOrg();
  const d = StatusHealthInput.parse(input);
  await assertCanEditProject(org.id, d.projectId);

  const before = await db.project.findUnique({
    where: { id: d.projectId },
    select: { status: true, health: true },
  });
  if (!before) return { ok: false as const, error: "找不到專案" };

  const data: {
    status?: typeof d.status;
    health?: typeof d.health;
    actualEndDate?: Date | null;
    statusChangedAt?: Date;
  } = {};
  if (d.status && d.status !== before.status) {
    const now = new Date();
    data.status = d.status;
    data.statusChangedAt = now;
    data.actualEndDate = d.status === "COMPLETED" ? now : null;
  }
  if (d.health && d.health !== before.health) data.health = d.health;
  if (data.status === undefined && data.health === undefined) {
    return { ok: true as const };
  }

  await db.project.update({ where: { id: d.projectId }, data });

  if (data.status) {
    await logActivity({
      projectId: d.projectId,
      kind: "STATUS",
      message: `狀態：${PROJECT_STATUS[before.status].label} → ${PROJECT_STATUS[data.status].label}`,
      userId: user.id,
    });
  }
  if (data.health) {
    await logActivity({
      projectId: d.projectId,
      kind: "HEALTH",
      message: `健康度：${HEALTH[before.health].label} → ${HEALTH[data.health].label}`,
      userId: user.id,
    });
  }

  revalidatePath(`/projects/${d.projectId}`);
  revalidatePath("/dashboard");
  revalidatePath("/projects");
  return { ok: true as const };
}

export async function deleteProject(id: string) {
  const { org } = await requireActiveOrg();
  await assertCanEditProject(org.id, id);
  await db.project.delete({ where: { id } });
  revalidatePath("/dashboard");
  revalidatePath("/projects");
  redirect("/projects");
}

/** 設定某專案是否計入週報「完成度」（整體平均進度）統計。 */
export async function setProjectCountInProgress(input: {
  projectId: string;
  countInProgress: boolean;
}) {
  const { user, org } = await requireActiveOrg();
  await assertCanEditProject(org.id, input.projectId);
  await db.project.update({
    where: { id: input.projectId },
    data: { countInProgress: input.countInProgress },
  });
  await logActivity({
    projectId: input.projectId,
    kind: "FIELD",
    message: input.countInProgress
      ? "改為計入完成度統計"
      : "改為不計入完成度統計",
    userId: user.id,
  });
  revalidatePath(`/projects/${input.projectId}`);
  revalidatePath("/report");
}

export async function setProjectArchived(id: string, archived: boolean) {
  const { user, org } = await requireActiveOrg();
  await assertCanEditProject(org.id, id);
  await db.project.update({ where: { id }, data: { archived } });
  await logActivity({
    projectId: id,
    kind: "ARCHIVE",
    message: archived ? "封存了專案" : "取消封存專案",
    userId: user.id,
  });
  revalidatePath("/dashboard");
  revalidatePath("/projects");
  revalidatePath(`/projects/${id}`);
}

// ── 手動排序：依畫面可見專案的新順序重寫 sortOrder（限管理者 / 老闆）──────────
const ReorderInput = z.object({
  orderedIds: z.array(z.string().min(1)).min(1),
});

/**
 * orderedIds＝目前畫面上「可見專案」的新順序（上/下移後的結果）。
 * 為避免打亂被視窗 / 篩選隱藏的專案，採「保留隱藏者原位」合併：走訪本組織所有未封存
 * 專案，遇到可見者就依 orderedIds 依序填入、隱藏者留在原位，最後整體重寫 sortOrder。
 * 只有管理者 / 老闆能調整順序——一般成員若透過某種方式觸發，屬於可能發生的正常情境
 * （非程式錯誤），以回傳值帶回，避免正式環境 Server Action 的 Error 訊息被 Next.js 隱去。
 */
export async function reorderProjects(input: z.input<typeof ReorderInput>) {
  const { org, membership } = await requireActiveOrg();
  if (!isManagerOrBoss(membership)) {
    return { ok: false as const, error: "只有管理者能調整專案順序。" };
  }
  const { orderedIds } = ReorderInput.parse(input);

  const list = await db.project.findMany({
    where: { organizationId: org.id, archived: false },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  const fullIds = list.map((p) => p.id);
  const fullSet = new Set(fullIds);
  // 只接受確實屬於本組織且未封存的可見 id（去重、擋越權）。
  const visibleOrder = [...new Set(orderedIds.filter((id) => fullSet.has(id)))];
  const visibleSet = new Set(visibleOrder);

  let qi = 0;
  const merged = fullIds.map((id) => (visibleSet.has(id) ? visibleOrder[qi++]! : id));

  await db.$transaction(
    merged.map((id, idx) =>
      db.project.update({ where: { id }, data: { sortOrder: idx } }),
    ),
  );
  revalidatePath("/projects");
  revalidatePath("/dashboard");
  return { ok: true as const };
}

// 詳情頁「就地內嵌編輯」的核心欄位（不含 status/health/countInProgress，那些有各自的
// 快速調整動作）。存檔後不轉頁，改由前端 router.refresh() 讓摘要即時反映。
const CoreInput = z.object({
  projectId: z.string().min(1),
  name: z.string().trim().min(1, "請輸入名稱").max(200),
  type: z.enum(["ROUTINE", "PROJECT", "ONE_TIME"]),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]),
  progress: z.coerce.number().int().min(0).max(100),
  description: z.string().trim().max(4000).optional().nullable(),
  ownerId: z.string().optional().nullable(),
  startDate: z.string().optional().nullable(),
  targetDate: z.string().optional().nullable(),
  color: z.string().optional().nullable(),
});

/**
 * 「找不到專案」是可能在正常操作中發生的情況（例如專案已被他人刪除）——以回傳值
 * 帶回而非 throw，因為正式環境 Server Action 丟出的 Error 訊息會被 Next.js 隱去。
 */
export async function updateProjectCore(input: z.input<typeof CoreInput>) {
  const { user, org } = await requireActiveOrg();
  const d = CoreInput.parse(input);
  await assertCanEditProject(org.id, d.projectId);

  const before = await db.project.findUnique({
    where: { id: d.projectId },
    select: {
      name: true,
      type: true,
      priority: true,
      progress: true,
      description: true,
      ownerId: true,
      startDate: true,
      targetDate: true,
      color: true,
    },
  });
  if (!before) return { ok: false as const, error: "找不到專案" };

  await db.project.update({
    where: { id: d.projectId },
    data: {
      name: d.name,
      type: d.type,
      priority: d.priority,
      progress: d.progress,
      description: d.description?.trim() || null,
      ownerId: d.ownerId || null,
      startDate: toDate(d.startDate),
      targetDate: toDate(d.targetDate),
      color: d.color?.trim() || null,
    },
  });

  // 進度單獨記錄（是完成度統計的關鍵值）；其餘欄位變動合併成一筆。
  if (before.progress !== d.progress) {
    await logActivity({
      projectId: d.projectId,
      kind: "PROGRESS",
      message: `進度：${before.progress}% → ${d.progress}%`,
      userId: user.id,
    });
  }
  const otherChanged =
    before.name !== d.name ||
    before.type !== d.type ||
    before.priority !== d.priority ||
    (before.ownerId ?? "") !== (d.ownerId ?? "") ||
    (before.description ?? "") !== (d.description?.trim() ?? "") ||
    (before.color ?? "") !== (d.color?.trim() ?? "") ||
    before.startDate?.getTime() !== toDate(d.startDate)?.getTime() ||
    before.targetDate?.getTime() !== toDate(d.targetDate)?.getTime();
  if (otherChanged) {
    await logActivity({
      projectId: d.projectId,
      kind: "FIELD",
      message: "更新了專案資訊",
      userId: user.id,
    });
  }

  revalidatePath("/dashboard");
  revalidatePath("/projects");
  revalidatePath(`/projects/${d.projectId}`);
  return { ok: true as const };
}
