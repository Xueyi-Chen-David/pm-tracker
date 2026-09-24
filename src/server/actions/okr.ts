"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { requireActiveOrg } from "@/server/org";

/** yyyy-mm-dd → UTC 午夜；空/無效回 null。 */
function toUtcDate(v?: string | null): Date | null {
  if (!v) return null;
  const [y, m, d] = v.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d));
}

function revalidate() {
  revalidatePath("/company");
}

// ── 年份 / 季度（OkrPeriod）─────────────────────

/** "2026" → {2026,0}；"2026 Q3" → {2026,3}；其他格式回 null。 */
function parseCycle(cycle: string): { year: number; quarter: number } | null {
  const m = /^(\d{4})(?: Q([1-4]))?$/.exec(cycle.trim());
  if (!m) return null;
  return { year: Number(m[1]), quarter: m[2] ? Number(m[2]) : 0 };
}

/** 確保某個 cycle 的年份（與季度）存在；建立 / 修改目標時呼叫，畫面才會出現對應區塊。 */
async function ensurePeriodsForCycle(orgId: string, cycle: string) {
  const p = parseCycle(cycle);
  if (!p) return;
  const keys = p.quarter ? [0, p.quarter] : [0];
  await db.okrPeriod.createMany({
    data: keys.map((quarter) => ({ organizationId: orgId, year: p.year, quarter })),
    skipDuplicates: true,
  });
}

const YearInput = z.number().int().min(2000, "年份不正確").max(2100, "年份不正確");

/** 新增年份。 */
export async function addOkrYear(year: number) {
  const { org } = await requireActiveOrg();
  const y = YearInput.safeParse(year);
  if (!y.success) return { ok: false as const, error: y.error.issues[0]?.message ?? "年份不正確" };
  await db.okrPeriod.createMany({
    data: [{ organizationId: org.id, year: y.data, quarter: 0 }],
    skipDuplicates: true,
  });
  revalidate();
  return { ok: true as const };
}

/** 在某年份底下新增季度（Q1–Q4）；年份不存在會一併建立。 */
export async function addOkrQuarter(year: number, quarter: number) {
  const { org } = await requireActiveOrg();
  const y = YearInput.safeParse(year);
  if (!y.success || ![1, 2, 3, 4].includes(quarter)) {
    return { ok: false as const, error: "年份或季度不正確" };
  }
  await db.okrPeriod.createMany({
    data: [
      { organizationId: org.id, year: y.data, quarter: 0 },
      { organizationId: org.id, year: y.data, quarter },
    ],
    skipDuplicates: true,
  });
  revalidate();
  return { ok: true as const };
}

/**
 * 刪除空的年份或季度（quarter=0＝年份）。底下還有目標就不能刪；
 * 刪年份時連同它的季度一起刪，但任何一季有目標也不行。
 */
export async function deleteOkrPeriod(year: number, quarter: number) {
  const { org } = await requireActiveOrg();
  const prefix = String(year);
  const cycles =
    quarter === 0
      ? { startsWith: prefix }
      : { equals: `${prefix} Q${quarter}` };
  const count = await db.objective.count({
    where: { organizationId: org.id, archived: false, cycle: cycles },
  });
  if (count > 0) {
    return {
      ok: false as const,
      error:
        quarter === 0
          ? `這個年份底下還有 ${count} 個目標（含季度），請先刪除或移到其他年份。`
          : `這一季還有 ${count} 個目標，請先刪除或移到其他季度。`,
    };
  }
  await db.okrPeriod.deleteMany({
    where: { organizationId: org.id, year, ...(quarter === 0 ? {} : { quarter }) },
  });
  revalidate();
  return { ok: true as const };
}

// ── Objective ──────────────────────────────────

const ObjectiveInput = z.object({
  title: z.string().trim().min(1, "請輸入目標名稱").max(200),
  level: z.enum(["ANNUAL", "QUARTERLY"]).default("QUARTERLY"),
  cycle: z.string().trim().min(1, "請選擇週期").max(40),
  description: z.string().trim().max(4000).optional(),
  targetDate: z.string().optional(),
  ownerId: z.string().optional(),
});

export async function createObjective(input: z.input<typeof ObjectiveInput>) {
  const { org } = await requireActiveOrg();
  const d = ObjectiveInput.parse(input);
  const max = await db.objective.aggregate({
    where: { organizationId: org.id, cycle: d.cycle },
    _max: { sortOrder: true },
  });
  await db.objective.create({
    data: {
      organizationId: org.id,
      title: d.title,
      level: d.level,
      cycle: d.cycle,
      description: d.description || null,
      targetDate: toUtcDate(d.targetDate),
      ownerId: d.ownerId || null,
      sortOrder: (max._max.sortOrder ?? 0) + 1,
    },
  });
  await ensurePeriodsForCycle(org.id, d.cycle);
  revalidate();
}

const ObjectivePatch = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  level: z.enum(["ANNUAL", "QUARTERLY"]).optional(),
  cycle: z.string().trim().min(1).max(40).optional(),
  description: z.string().trim().max(4000).nullable().optional(),
  targetDate: z.string().nullable().optional(),
  ownerId: z.string().nullable().optional(),
  archived: z.boolean().optional(),
});

export async function updateObjective(
  id: string,
  patch: z.input<typeof ObjectivePatch>,
) {
  const { org } = await requireActiveOrg();
  const p = ObjectivePatch.parse(patch);
  await db.objective.updateMany({
    where: { id, organizationId: org.id },
    data: {
      ...(p.title !== undefined ? { title: p.title } : {}),
      ...(p.level !== undefined ? { level: p.level } : {}),
      ...(p.cycle !== undefined ? { cycle: p.cycle } : {}),
      ...(p.description !== undefined ? { description: p.description || null } : {}),
      ...(p.targetDate !== undefined ? { targetDate: toUtcDate(p.targetDate) } : {}),
      ...(p.ownerId !== undefined ? { ownerId: p.ownerId || null } : {}),
      ...(p.archived !== undefined ? { archived: p.archived } : {}),
    },
  });
  if (p.cycle !== undefined) await ensurePeriodsForCycle(org.id, p.cycle);
  revalidate();
}

export async function deleteObjective(id: string) {
  const { org } = await requireActiveOrg();
  await db.objective.deleteMany({ where: { id, organizationId: org.id } });
  revalidate();
}

// ── KeyResult ──────────────────────────────────

const KrCreateInput = z.object({
  objectiveId: z.string().min(1),
  title: z.string().trim().min(1, "請輸入 KR 名稱").max(200),
  kind: z.enum(["kr", "todo"]).default("kr"),
});

export async function createKeyResult(input: z.input<typeof KrCreateInput>) {
  const { org } = await requireActiveOrg();
  const d = KrCreateInput.parse(input);
  // 確認 objective 屬於本組織
  const obj = await db.objective.findFirst({
    where: { id: d.objectiveId, organizationId: org.id },
    select: { id: true },
  });
  if (!obj) return { ok: false as const, error: "找不到目標" };
  const max = await db.keyResult.aggregate({
    where: { objectiveId: d.objectiveId },
    _max: { sortOrder: true },
  });
  await db.keyResult.create({
    data: {
      objectiveId: d.objectiveId,
      title: d.title,
      kind: d.kind,
      sortOrder: (max._max.sortOrder ?? 0) + 1,
    },
  });
  revalidate();
  return { ok: true as const };
}

const KrPatch = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  kind: z.enum(["kr", "todo"]).optional(),
  status: z
    .enum(["NOT_STARTED", "IN_PROGRESS", "DONE", "BLOCKED", "CANCELLED"])
    .optional(),
  health: z.enum(["GREEN", "YELLOW", "RED"]).optional(),
  progress: z.number().int().min(0).max(100).optional(),
  note: z.string().max(2000).nullable().optional(),
  dueDate: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(), // null＝取消連結
  ownerLabel: z.string().max(200).nullable().optional(),
});

export async function updateKeyResult(
  id: string,
  patch: z.input<typeof KrPatch>,
) {
  const { org } = await requireActiveOrg();
  const p = KrPatch.parse(patch);
  // 連專案時，確認該專案屬於本組織
  if (p.projectId) {
    const proj = await db.project.findFirst({
      where: { id: p.projectId, organizationId: org.id },
      select: { id: true },
    });
    if (!proj) return { ok: false as const, error: "找不到專案" };
  }
  await db.keyResult.updateMany({
    where: { id, objective: { organizationId: org.id } },
    data: {
      ...(p.title !== undefined ? { title: p.title } : {}),
      ...(p.kind !== undefined ? { kind: p.kind } : {}),
      ...(p.status !== undefined ? { status: p.status } : {}),
      ...(p.health !== undefined ? { health: p.health } : {}),
      ...(p.progress !== undefined ? { progress: p.progress } : {}),
      ...(p.note !== undefined ? { note: p.note || null } : {}),
      ...(p.dueDate !== undefined ? { dueDate: toUtcDate(p.dueDate) } : {}),
      ...(p.projectId !== undefined ? { projectId: p.projectId || null } : {}),
      ...(p.ownerLabel !== undefined ? { ownerLabel: p.ownerLabel || null } : {}),
    },
  });
  revalidate();
  return { ok: true as const };
}

export async function setKrOwners(id: string, userIds: string[]) {
  const { org } = await requireActiveOrg();
  const kr = await db.keyResult.findFirst({
    where: { id, objective: { organizationId: org.id } },
    select: { id: true },
  });
  if (!kr) return { ok: false as const, error: "找不到 KR" };
  // 僅接受本組織成員
  const members = await db.organizationMember.findMany({
    where: { organizationId: org.id, userId: { in: userIds } },
    select: { userId: true },
  });
  const validIds = members.map((m) => m.userId);
  await db.keyResult.update({
    where: { id },
    data: { owners: { set: validIds.map((uid) => ({ id: uid })) } },
  });
  revalidate();
  return { ok: true as const };
}

export async function deleteKeyResult(id: string) {
  const { org } = await requireActiveOrg();
  await db.keyResult.deleteMany({
    where: { id, objective: { organizationId: org.id } },
  });
  revalidate();
}
