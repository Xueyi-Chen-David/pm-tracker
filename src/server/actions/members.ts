"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { requireUser } from "@/server/auth-helpers";
import { assertCanEditProject } from "@/server/access";
import { logActivity } from "@/server/activity";
import { primaryName } from "@/lib/display";

const Role = z.enum(["OWNER", "MEMBER", "VIEWER"]);

const nameSelect = {
  name: true,
  nickname: true,
  useNickname: true,
  email: true,
} as const;

/** 加入既有使用者為成員。 */
export async function addMember(input: {
  projectId: string;
  userId: string;
  role?: z.infer<typeof Role>;
  roleLabel?: string;
}) {
  const user = await requireUser();
  await assertCanEditProject(user.id, input.projectId, user.isBoss);
  const role = Role.parse(input.role ?? "MEMBER");
  const existing = await db.projectMember.findUnique({
    where: {
      projectId_userId: { projectId: input.projectId, userId: input.userId },
    },
    select: { id: true },
  });
  await db.projectMember.upsert({
    where: {
      projectId_userId: { projectId: input.projectId, userId: input.userId },
    },
    update: { role, roleLabel: input.roleLabel || null },
    create: {
      projectId: input.projectId,
      userId: input.userId,
      role,
      roleLabel: input.roleLabel || null,
    },
  });
  if (!existing) {
    const target = await db.user.findUnique({
      where: { id: input.userId },
      select: nameSelect,
    });
    await logActivity({
      projectId: input.projectId,
      kind: "MEMBER",
      message: `加入成員 ${primaryName(target)}`,
      userId: user.id,
    });
  }
  revalidatePath(`/projects/${input.projectId}`);
}

/** 用 Email 邀請（若該人尚未有帳號，先建立 placeholder 使用者）。 */
export async function inviteMemberByEmail(input: {
  projectId: string;
  email: string;
  name?: string;
  role?: z.infer<typeof Role>;
  roleLabel?: string;
}) {
  const user = await requireUser();
  await assertCanEditProject(user.id, input.projectId, user.isBoss);
  const email = input.email.trim().toLowerCase();
  if (!email.includes("@")) throw new Error("Email 格式不正確");
  const target = await db.user.upsert({
    where: { email },
    update: input.name ? { name: input.name } : {},
    create: { email, name: input.name || email.split("@")[0] },
  });
  await addMember({
    projectId: input.projectId,
    userId: target.id,
    role: input.role,
    roleLabel: input.roleLabel,
  });
}

export async function updateMember(input: {
  memberId: string;
  projectId: string;
  role?: z.infer<typeof Role>;
  roleLabel?: string;
}) {
  const user = await requireUser();
  await assertCanEditProject(user.id, input.projectId, user.isBoss);
  await db.projectMember.update({
    where: { id: input.memberId },
    data: {
      role: input.role ? Role.parse(input.role) : undefined,
      roleLabel:
        input.roleLabel === undefined ? undefined : input.roleLabel || null,
    },
  });
  revalidatePath(`/projects/${input.projectId}`);
}

export async function removeMember(input: {
  memberId: string;
  projectId: string;
}) {
  const user = await requireUser();
  await assertCanEditProject(user.id, input.projectId, user.isBoss);
  const member = await db.projectMember.delete({
    where: { id: input.memberId },
    select: { user: { select: nameSelect } },
  });
  await logActivity({
    projectId: input.projectId,
    kind: "MEMBER",
    message: `移除成員 ${primaryName(member.user)}`,
    userId: user.id,
  });
  revalidatePath(`/projects/${input.projectId}`);
}

/** 設定負責人（同時確保此人是 OWNER 成員）。 */
export async function setOwner(input: { projectId: string; userId: string }) {
  const user = await requireUser();
  await assertCanEditProject(user.id, input.projectId, user.isBoss);
  await db.project.update({
    where: { id: input.projectId },
    data: { ownerId: input.userId },
  });
  await db.projectMember.upsert({
    where: {
      projectId_userId: { projectId: input.projectId, userId: input.userId },
    },
    update: { role: "OWNER" },
    create: { projectId: input.projectId, userId: input.userId, role: "OWNER" },
  });
  const target = await db.user.findUnique({
    where: { id: input.userId },
    select: nameSelect,
  });
  await logActivity({
    projectId: input.projectId,
    kind: "MEMBER",
    message: `指定 ${primaryName(target)} 為負責人`,
    userId: user.id,
  });
  revalidatePath(`/projects/${input.projectId}`);
}
