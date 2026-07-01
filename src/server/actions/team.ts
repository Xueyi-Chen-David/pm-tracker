"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { requireUser } from "@/server/auth-helpers";
import { MODULE_KEYS } from "@/lib/modules";

export type TeamActionState = { error?: string; ok?: boolean } | null;

const CreateInput = z.object({
  name: z.string().trim().min(1, "請輸入姓名").max(120),
  nickname: z.string().trim().max(120).optional(),
  email: z.string().trim().email("Email 格式不正確"),
  jobTitle: z.string().trim().max(120).optional(),
});

/** 在 workspace 新增成員（用 Email；若已存在則更新姓名/職稱）。 */
export async function createWorkspaceMemberAction(
  _prev: TeamActionState,
  formData: FormData,
): Promise<TeamActionState> {
  await requireUser();
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
  await db.user.upsert({
    where: { email: email.toLowerCase() },
    update: { name, nickname: nickname || null, jobTitle: jobTitle || null },
    create: {
      email: email.toLowerCase(),
      name,
      nickname: nickname || null,
      jobTitle: jobTitle || null,
    },
  });
  revalidatePath("/team");
  return { ok: true };
}

const ProfileInput = z.object({
  id: z.string().min(1),
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

/** 更新成員個人 profile。 */
export async function updateProfileAction(
  _prev: TeamActionState,
  formData: FormData,
): Promise<TeamActionState> {
  await requireUser();
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

  // 細分權限（可見模組）：勾「可存取全部」→ 空陣列（＝全開）；否則收集勾選的模組 key。
  const allModules = formData.get("allModules") === "on";
  const allowedModules = allModules
    ? []
    : MODULE_KEYS.filter((k) => formData.get(`mod_${k}`) === "on");
  const trackAttendance = formData.get("trackAttendance") === "on";

  try {
    await db.user.update({
      where: { id: d.id },
      data: {
        name: d.name ?? null,
        nickname: d.nickname || null,
        useNickname: d.useNickname ?? false,
        // email 是登入身分；提供才更新，留空不動
        email: d.email ? d.email.toLowerCase() : undefined,
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
    });
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

export async function setMemberActive(id: string, active: boolean) {
  await requireUser();
  await db.user.update({ where: { id }, data: { active } });
  revalidatePath("/team");
  revalidatePath(`/team/${id}`);
}

/**
 * 刪除工作區成員。先把該成員「建立 / 負責」的專案轉移給操作者（避免必填外鍵
 * createdBy 的限制），成員資格會連帶刪除、其週報的作者欄設為空。不能刪除自己。
 */
export async function deleteWorkspaceMember(id: string) {
  const me = await requireUser();
  if (id === me.id) {
    throw new Error("不能刪除自己。");
  }
  await db.$transaction([
    db.project.updateMany({
      where: { createdById: id },
      data: { createdById: me.id },
    }),
    db.project.updateMany({
      where: { ownerId: id },
      data: { ownerId: me.id },
    }),
    db.user.delete({ where: { id } }),
  ]);
  revalidatePath("/team");
}
