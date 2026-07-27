"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { requireActiveOrg } from "@/server/org";
import { assertCanEditProject } from "@/server/access";
import { logActivity } from "@/server/activity";

// 專案版本發布紀錄（changelog）的伺服器動作。內部團隊工具：本組織任何成員皆可編輯。

function toDate(v?: string | null): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

const STATUSES = ["PLANNED", "RELEASED"] as const;

const ReleaseCreate = z.object({
  projectId: z.string().min(1),
  version: z.string().trim().min(1, "請輸入版本號").max(60),
  title: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(20_000).optional(),
  status: z.enum(STATUSES).optional(),
  releasedAt: z.string().optional(),
});

export async function createRelease(input: z.input<typeof ReleaseCreate>) {
  const { user, org } = await requireActiveOrg();
  const d = ReleaseCreate.parse(input);
  await assertCanEditProject(org.id, d.projectId);

  const status = d.status ?? "RELEASED";
  // 已發布但沒填日期 → 預設今天；規劃中則保留使用者填的（可空）。
  const releasedAt =
    toDate(d.releasedAt) ?? (status === "RELEASED" ? new Date() : null);

  const count = await db.projectRelease.count({
    where: { projectId: d.projectId },
  });
  const rel = await db.projectRelease.create({
    data: {
      projectId: d.projectId,
      version: d.version,
      title: d.title || null,
      notes: d.notes || null,
      status,
      releasedAt,
      sortOrder: count,
      createdById: user.id,
    },
    select: { id: true },
  });
  await logActivity({
    projectId: d.projectId,
    kind: "RELEASE",
    message: `新增版本 ${d.version}${status === "RELEASED" ? "（已發布）" : "（規劃中）"}`,
    userId: user.id,
  });
  revalidatePath(`/projects/${d.projectId}`);
  return { ok: true as const, id: rel.id };
}

const ReleaseUpdate = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  version: z.string().trim().min(1).max(60).optional(),
  title: z.string().trim().max(200).nullable().optional(),
  notes: z.string().trim().max(20_000).nullable().optional(),
  status: z.enum(STATUSES).optional(),
  releasedAt: z.string().optional(),
});

export async function updateRelease(input: z.input<typeof ReleaseUpdate>) {
  const { user, org } = await requireActiveOrg();
  const d = ReleaseUpdate.parse(input);
  await assertCanEditProject(org.id, d.projectId);

  // 確認這筆 release 屬於該專案（縱深防禦）。「找不到」在正常操作下也可能發生
  // （例如另一個分頁已先刪除它），以回傳值帶回而非 throw——Server Action 丟出的
  // Error 在正式環境會被 Next.js 隱去訊息內容。
  const existing = await db.projectRelease.findFirst({
    where: { id: d.id, projectId: d.projectId },
    select: { id: true, version: true, status: true },
  });
  if (!existing) {
    return { ok: false as const, error: "找不到版本紀錄。" };
  }

  const data: {
    version?: string;
    title?: string | null;
    notes?: string | null;
    status?: (typeof STATUSES)[number];
    releasedAt?: Date | null;
  } = {};
  if (d.version !== undefined) data.version = d.version;
  if (d.title !== undefined) data.title = d.title || null;
  if (d.notes !== undefined) data.notes = d.notes || null;
  if (d.status !== undefined) data.status = d.status;
  if (d.releasedAt !== undefined) data.releasedAt = toDate(d.releasedAt);
  // 改標為已發布但沒有日期時，補上今天。
  if (d.status === "RELEASED" && data.releasedAt == null && d.releasedAt === undefined) {
    data.releasedAt = new Date();
  }

  await db.projectRelease.update({ where: { id: d.id }, data });

  const changedToReleased =
    d.status === "RELEASED" && existing.status !== "RELEASED";
  await logActivity({
    projectId: d.projectId,
    kind: "RELEASE",
    message: changedToReleased
      ? `發布版本 ${d.version ?? existing.version}`
      : `更新版本 ${d.version ?? existing.version}`,
    userId: user.id,
  });
  revalidatePath(`/projects/${d.projectId}`);
  return { ok: true as const };
}

export async function deleteRelease(input: { id: string; projectId: string }) {
  const { user, org } = await requireActiveOrg();
  await assertCanEditProject(org.id, input.projectId);
  const existing = await db.projectRelease.findFirst({
    where: { id: input.id, projectId: input.projectId },
    select: { version: true },
  });
  await db.projectRelease.deleteMany({
    where: { id: input.id, projectId: input.projectId },
  });
  if (existing) {
    await logActivity({
      projectId: input.projectId,
      kind: "RELEASE",
      message: `刪除版本 ${existing.version}`,
      userId: user.id,
    });
  }
  revalidatePath(`/projects/${input.projectId}`);
  return { ok: true as const };
}
