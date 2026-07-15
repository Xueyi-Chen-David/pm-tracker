"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { requireActiveOrgWithRole } from "@/server/org";
import { sanitizePermissions } from "@/lib/permissions";

/**
 * 自訂角色（人資 / 會計…）CRUD 與指派。皆需管理者（OWNER / ADMIN）。
 * 角色只是「職能 + 權限」的集合；權限 key 見 src/lib/permissions.ts。
 */

const RoleInput = z.object({
  name: z.string().trim().min(1, "請輸入角色名稱").max(40),
  description: z.string().trim().max(200).optional(),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "顏色需為 #RRGGBB")
    .optional(),
  permissions: z.array(z.string()).default([]),
});

export type RoleActionState = { error?: string; ok?: boolean } | null;

export async function createRole(input: z.input<typeof RoleInput>) {
  const { org } = await requireActiveOrgWithRole(["OWNER", "ADMIN"]);
  const d = RoleInput.parse(input);
  const count = await db.orgRoleDef.count({ where: { organizationId: org.id } });
  try {
    await db.orgRoleDef.create({
      data: {
        organizationId: org.id,
        name: d.name,
        description: d.description || null,
        color: d.color || null,
        permissions: sanitizePermissions(d.permissions),
        sortOrder: count,
      },
    });
  } catch (e) {
    if ((e as { code?: string })?.code === "P2002") {
      throw new Error("已有同名角色。");
    }
    throw e;
  }
  revalidatePath("/team");
  revalidatePath("/", "layout");
}

const UpdateRoleInput = RoleInput.extend({ id: z.string().min(1) });

export async function updateRole(input: z.input<typeof UpdateRoleInput>) {
  const { org } = await requireActiveOrgWithRole(["OWNER", "ADMIN"]);
  const d = UpdateRoleInput.parse(input);
  // 確認角色屬於本組織。
  const existing = await db.orgRoleDef.findFirst({
    where: { id: d.id, organizationId: org.id },
    select: { id: true },
  });
  if (!existing) throw new Error("找不到角色，或它不屬於目前組織。");
  try {
    await db.orgRoleDef.update({
      where: { id: d.id },
      data: {
        name: d.name,
        description: d.description || null,
        color: d.color || null,
        permissions: sanitizePermissions(d.permissions),
      },
    });
  } catch (e) {
    if ((e as { code?: string })?.code === "P2002") {
      throw new Error("已有同名角色。");
    }
    throw e;
  }
  revalidatePath("/team");
  revalidatePath("/", "layout");
}

export async function deleteRole(id: string) {
  const { org } = await requireActiveOrgWithRole(["OWNER", "ADMIN"]);
  // deleteMany + organizationId 條件＝縱深防禦（擋跨組織刪除）。m2m 指派由 FK CASCADE 自動清除。
  await db.orgRoleDef.deleteMany({ where: { id, organizationId: org.id } });
  revalidatePath("/team");
  revalidatePath("/", "layout");
}

/** 指派某成員的自訂角色（整組覆蓋）。roleIds＝要指派的角色 id（會過濾成本組織的合法角色）。 */
export async function setMemberRoles(userId: string, roleIds: string[]) {
  const { org } = await requireActiveOrgWithRole(["OWNER", "ADMIN"]);
  const membership = await db.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: org.id, userId } },
    select: { id: true },
  });
  if (!membership) throw new Error("該成員不屬於目前組織。");

  // 只接受屬於本組織的角色 id。
  const valid = await db.orgRoleDef.findMany({
    where: { organizationId: org.id, id: { in: roleIds } },
    select: { id: true },
  });

  await db.organizationMember.update({
    where: { id: membership.id },
    data: { roleDefs: { set: valid.map((r) => ({ id: r.id })) } },
  });
  revalidatePath("/team");
  revalidatePath(`/me/${userId}`);
  revalidatePath("/", "layout");
}
