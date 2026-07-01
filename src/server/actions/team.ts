"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { requireActiveOrgWithRole } from "@/server/org";
import { MODULE_KEYS } from "@/lib/modules";

export type TeamActionState = { error?: string; ok?: boolean } | null;

const CreateInput = z.object({
  name: z.string().trim().min(1, "請輸入姓名").max(120),
  nickname: z.string().trim().max(120).optional(),
  email: z.string().trim().email("Email 格式不正確"),
  jobTitle: z.string().trim().max(120).optional(),
});

/**
 * 在目前組織新增成員（用 Email；可在該人登入前先加入）。
 * 若尚無帳號先建立 placeholder User，再建立 / 更新組織成員關係。需擁有者 / 管理員。
 */
export async function createWorkspaceMemberAction(
  _prev: TeamActionState,
  formData: FormData,
): Promise<TeamActionState> {
  const { org } = await requireActiveOrgWithRole(["OWNER", "ADMIN"]);
  const parsed = CreateInput.safeParse({
    name: formData.get("name"),
    nickname: formData.get("nickname") || undefined,
    email: formData.get("email"),
    jobTitle: formData.get("jobTitle") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "資料格式錯誤" };
  }
  const { name, nickname, email, jobTitle } = parsed.data;
  const lower = email.toLowerCase();

  // 身分（全域）：建立 / 更新 User。
  const user = await db.user.upsert({
    where: { email: lower },
    update: { name, nickname: nickname || null },
    create: { email: lower, name, nickname: nickname || null },
  });

  // 組織成員關係：加入本組織（已存在則更新職稱）。
  await db.organizationMember.upsert({
    where: {
      organizationId_userId: { organizationId: org.id, userId: user.id },
    },
    update: { jobTitle: jobTitle || null },
    create: {
      organizationId: org.id,
      userId: user.id,
      email: lower,
      role: "MEMBER",
      jobTitle: jobTitle || null,
    },
  });

  revalidatePath("/team");
  return { ok: true };
}

const ProfileInput = z.object({
  id: z.string().min(1), // User id
  name: z.string().trim().max(120).optional(),
  nickname: z.string().trim().max(120).optional(),
  useNickname: z.boolean().optional(),
  email: z.string().trim().email("Email 格式不正確").optional(),
  jobTitle: z.string().trim().max(120).optional(),
  attendance: z.string().trim().max(200).optional(),
  persona: z.string().trim().max(4000).optional(),
  personality: z.string().trim().max(4000).optional(),
  bio: z.string().trim().max(4000).optional(),
  productivityNote: z.string().trim().max(4000).optional(),
  isBoss: z.boolean().optional(),
  active: z.boolean().optional(),
});

/** 更新成員 profile：身分欄位寫 User，組織內欄位寫 membership。需擁有者 / 管理員。 */
export async function updateProfileAction(
  _prev: TeamActionState,
  formData: FormData,
): Promise<TeamActionState> {
  const { org } = await requireActiveOrgWithRole(["OWNER", "ADMIN"]);
  const parsed = ProfileInput.safeParse({
    id: formData.get("id"),
    name: formData.get("name") || undefined,
    nickname: formData.get("nickname") || undefined,
    useNickname: formData.get("useNickname") === "on",
    email: formData.get("email") || undefined,
    jobTitle: formData.get("jobTitle") || undefined,
    attendance: formData.get("attendance") || undefined,
    persona: formData.get("persona") || undefined,
    personality: formData.get("personality") || undefined,
    bio: formData.get("bio") || undefined,
    productivityNote: formData.get("productivityNote") || undefined,
    isBoss: formData.get("isBoss") === "on",
    active: formData.get("active") === "on",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "資料格式錯誤" };
  }
  const d = parsed.data;

  // 目標必須是本組織成員。
  const membership = await db.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: org.id, userId: d.id } },
    select: { id: true },
  });
  if (!membership) return { error: "該成員不屬於目前組織。" };

  // 細分權限（可見模組）：勾「可存取全部」→ 空陣列（＝全開）；否則收集勾選的模組 key。
  const allModules = formData.get("allModules") === "on";
  const allowedModules = allModules
    ? []
    : MODULE_KEYS.filter((k) => formData.get(`mod_${k}`) === "on");
  const trackAttendance = formData.get("trackAttendance") === "on";
  const lowerEmail = d.email ? d.email.toLowerCase() : undefined;

  try {
    await db.$transaction([
      // 身分（全域）
      db.user.update({
        where: { id: d.id },
        data: {
          name: d.name ?? null,
          nickname: d.nickname || null,
          useNickname: d.useNickname ?? false,
          email: lowerEmail, // 提供才更新
        },
      }),
      // 組織內欄位
      db.organizationMember.update({
        where: { id: membership.id },
        data: {
          email: lowerEmail, // 與 User email 同步
          jobTitle: d.jobTitle || null,
          attendance: d.attendance || null,
          persona: d.persona || null,
          personality: d.personality || null,
          bio: d.bio || null,
          productivityNote: d.productivityNote || null,
          isBoss: d.isBoss ?? false,
          active: d.active ?? true,
          allowedModules,
          trackAttendance,
        },
      }),
    ]);
  } catch (e) {
    if ((e as { code?: string })?.code === "P2002") {
      return { error: "此 Email 已被其他成員使用。" };
    }
    throw e;
  }
  revalidatePath("/team");
  revalidatePath(`/team/${d.id}`);
  revalidatePath("/attendance");
  return { ok: true };
}

/** 設定成員在本組織是否在職 / 啟用。需擁有者 / 管理員。 */
export async function setMemberActive(id: string, active: boolean) {
  const { org } = await requireActiveOrgWithRole(["OWNER", "ADMIN"]);
  await db.organizationMember.update({
    where: { organizationId_userId: { organizationId: org.id, userId: id } },
    data: { active },
  });
  revalidatePath("/team");
  revalidatePath(`/team/${id}`);
}

/**
 * 從目前組織移除成員（不刪除全域 User）。先把該成員在「本組織」建立 / 負責的專案
 * 轉給操作者（避免必填外鍵 createdBy 的限制），並清掉其在本組織的專案成員關係 /
 * 出席 / 事件，最後刪除組織成員關係。不能移除自己。需擁有者 / 管理員。
 */
export async function deleteWorkspaceMember(id: string) {
  const { user: me, org } = await requireActiveOrgWithRole(["OWNER", "ADMIN"]);
  if (id === me.id) {
    throw new Error("不能移除自己。");
  }
  await db.$transaction([
    db.project.updateMany({
      where: { organizationId: org.id, createdById: id },
      data: { createdById: me.id },
    }),
    db.project.updateMany({
      where: { organizationId: org.id, ownerId: id },
      data: { ownerId: me.id },
    }),
    db.projectMember.deleteMany({
      where: { userId: id, project: { organizationId: org.id } },
    }),
    db.attendanceRecord.deleteMany({
      where: { organizationId: org.id, userId: id },
    }),
    db.memberEvent.deleteMany({
      where: { organizationId: org.id, userId: id },
    }),
    db.organizationMember.delete({
      where: { organizationId_userId: { organizationId: org.id, userId: id } },
    }),
  ]);
  revalidatePath("/team");
}
