"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import {
  requireActiveOrg,
  requireActiveOrgWithRole,
  canManageMembers,
} from "@/server/org";

/** yyyy-mm-dd → UTC 午夜；空 / 無效回 null。 */
function toUtcDate(v?: string | null): Date | null {
  if (!v) return null;
  const [y, m, d] = v.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d));
}

const FORMATS = ["ONLINE", "VIDEO", "DOCUMENT", "IN_PERSON", "EXTERNAL"] as const;
const STATUSES = ["NOT_STARTED", "IN_PROGRESS", "COMPLETED"] as const;

// ── 課程（Course）：管理者建立 / 維護 ─────────────────────────

const CourseInput = z.object({
  title: z.string().trim().min(1, "請輸入課程名稱").max(200),
  description: z.string().trim().max(4000).optional(),
  category: z.string().trim().max(40).optional(),
  format: z.enum(FORMATS).default("ONLINE"),
  resourceUrl: z.string().trim().max(500).optional(),
  estimatedMin: z.coerce.number().int().min(0).max(100_000).optional(),
  required: z.boolean().optional(),
  renewMonths: z.coerce.number().int().min(1).max(120).optional(),
});

export async function createCourse(input: z.input<typeof CourseInput>) {
  const { user, org } = await requireActiveOrgWithRole(["OWNER", "ADMIN"]);
  const d = CourseInput.parse(input);
  const max = await db.trainingCourse.aggregate({
    where: { organizationId: org.id },
    _max: { sortOrder: true },
  });
  await db.trainingCourse.create({
    data: {
      organizationId: org.id,
      title: d.title,
      description: d.description || null,
      category: d.category?.trim() || "一般",
      format: d.format,
      resourceUrl: d.resourceUrl || null,
      estimatedMin: d.estimatedMin ?? null,
      required: d.required ?? false,
      renewMonths: d.renewMonths ?? null,
      sortOrder: (max._max.sortOrder ?? 0) + 1,
      createdById: user.id,
    },
  });
  revalidatePath("/training");
  return { ok: true as const };
}

const CoursePatch = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(4000).nullable().optional(),
  category: z.string().trim().max(40).optional(),
  format: z.enum(FORMATS).optional(),
  resourceUrl: z.string().trim().max(500).nullable().optional(),
  estimatedMin: z.coerce.number().int().min(0).max(100_000).nullable().optional(),
  required: z.boolean().optional(),
  renewMonths: z.coerce.number().int().min(1).max(120).nullable().optional(),
  active: z.boolean().optional(),
});

export async function updateCourse(
  id: string,
  patch: z.input<typeof CoursePatch>,
) {
  const { org } = await requireActiveOrgWithRole(["OWNER", "ADMIN"]);
  const p = CoursePatch.parse(patch);
  await db.trainingCourse.updateMany({
    where: { id, organizationId: org.id },
    data: {
      ...(p.title !== undefined ? { title: p.title } : {}),
      ...(p.description !== undefined ? { description: p.description || null } : {}),
      ...(p.category !== undefined ? { category: p.category.trim() || "一般" } : {}),
      ...(p.format !== undefined ? { format: p.format } : {}),
      ...(p.resourceUrl !== undefined ? { resourceUrl: p.resourceUrl || null } : {}),
      ...(p.estimatedMin !== undefined ? { estimatedMin: p.estimatedMin } : {}),
      ...(p.required !== undefined ? { required: p.required } : {}),
      ...(p.renewMonths !== undefined ? { renewMonths: p.renewMonths } : {}),
      ...(p.active !== undefined ? { active: p.active } : {}),
    },
  });
  revalidatePath("/training");
  return { ok: true as const };
}

export async function deleteCourse(id: string) {
  const { org } = await requireActiveOrgWithRole(["OWNER", "ADMIN"]);
  await db.trainingCourse.deleteMany({ where: { id, organizationId: org.id } });
  revalidatePath("/training");
}

// ── 指派（Assign）：管理者把課程指派給成員 ─────────────────────

const AssignInput = z.object({
  courseId: z.string().min(1),
  userIds: z.array(z.string().min(1)).min(1, "請至少選一位成員"),
  dueDate: z.string().optional(),
});

export async function assignCourse(input: z.input<typeof AssignInput>) {
  const { user, org } = await requireActiveOrgWithRole(["OWNER", "ADMIN"]);
  const d = AssignInput.parse(input);

  const course = await db.trainingCourse.findFirst({
    where: { id: d.courseId, organizationId: org.id },
    select: { id: true, title: true },
  });
  if (!course) throw new Error("找不到課程");

  // 僅接受本組織成員。
  const members = await db.organizationMember.findMany({
    where: { organizationId: org.id, userId: { in: d.userIds } },
    select: { userId: true },
  });
  const validIds = members.map((m) => m.userId);
  if (validIds.length === 0) throw new Error("選取的成員不在目前組織。");

  const due = toUtcDate(d.dueDate);
  const existing = await db.trainingAssignment.findMany({
    where: { courseId: course.id, userId: { in: validIds } },
    select: { userId: true },
  });
  const existingSet = new Set(existing.map((e) => e.userId));
  const newIds = validIds.filter((id) => !existingSet.has(id));

  if (newIds.length > 0) {
    await db.trainingAssignment.createMany({
      data: newIds.map((uid) => ({
        organizationId: org.id,
        courseId: course.id,
        userId: uid,
        dueDate: due,
        assignedById: user.id,
      })),
    });
    // 通知被指派者（自己指派給自己不通知）。
    const notifyIds = newIds.filter((uid) => uid !== user.id);
    if (notifyIds.length > 0) {
      await db.notification.createMany({
        data: notifyIds.map((uid) => ({
          organizationId: org.id,
          userId: uid,
          type: "training_assigned",
          title: `你被指派了訓練課程：${course.title}`,
          link: "/training",
        })),
      });
    }
  }

  // 若有指定應完成日，一併套用到本次選取的所有成員（含既有指派）。
  if (due) {
    await db.trainingAssignment.updateMany({
      where: { courseId: course.id, userId: { in: validIds } },
      data: { dueDate: due },
    });
  }

  revalidatePath("/training");
  return { ok: true as const, assigned: newIds.length };
}

export async function unassignCourse(courseId: string, userId: string) {
  const { org } = await requireActiveOrgWithRole(["OWNER", "ADMIN"]);
  await db.trainingAssignment.deleteMany({
    where: { organizationId: org.id, courseId, userId },
  });
  revalidatePath("/training");
}

// ── 進度（Status）：員工更新自己的、或管理者更新任何人的 ─────────

const StatusInput = z.object({
  id: z.string().min(1),
  status: z.enum(STATUSES),
});

export async function setAssignmentStatus(input: z.input<typeof StatusInput>) {
  const { user, org, membership } = await requireActiveOrg();
  const d = StatusInput.parse(input);

  const a = await db.trainingAssignment.findFirst({
    where: { id: d.id, organizationId: org.id },
    select: { id: true, userId: true, startedAt: true },
  });
  if (!a) throw new Error("找不到指派紀錄。");

  const canManage = canManageMembers(membership.role);
  if (a.userId !== user.id && !canManage) {
    throw new Error("你只能更新自己的訓練進度。");
  }

  const now = new Date();
  const data =
    d.status === "COMPLETED"
      ? { status: d.status, completedAt: now, startedAt: a.startedAt ?? now }
      : d.status === "IN_PROGRESS"
        ? { status: d.status, completedAt: null, startedAt: a.startedAt ?? now }
        : { status: d.status, completedAt: null, startedAt: null };

  await db.trainingAssignment.update({ where: { id: a.id }, data });
  revalidatePath("/training");
  return { ok: true as const };
}
