"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import {
  requireActiveOrg,
  requireActiveOrgWithRole,
  canManageMembers,
} from "@/server/org";
import { getMembershipGraph } from "@/server/queries";
import { wouldCycle } from "@/server/hierarchy";

export type TeamActionState = { error?: string; ok?: boolean } | null;

const WorkDescriptionInput = z.object({
  userId: z.string().min(1),
  workDescription: z.string().max(4000),
});

/**
 * 更新成員「工作描述」。本人可改自己的；管理者(OWNER/ADMIN)可改任何人的。
 */
export async function updateWorkDescription(
  input: z.input<typeof WorkDescriptionInput>,
) {
  const { user, org, membership } = await requireActiveOrg();
  const d = WorkDescriptionInput.parse(input);
  if (!canManageMembers(membership.role) && d.userId !== user.id) {
    throw new Error("你只能編輯自己的工作描述。");
  }
  const res = await db.organizationMember.updateMany({
    where: { organizationId: org.id, userId: d.userId },
    data: { workDescription: d.workDescription.trim() || null },
  });
  if (res.count === 0) throw new Error("找不到成員");
  revalidatePath("/team");
  return { ok: true as const };
}

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

  // 身分（全域）：先以「不分大小寫」找既有帳號。對方若曾登入過（例如 Google 登入），
  // DB 的 email 可能是大小寫混合，用小寫精準比對會漏掉、進而重複建立或撞唯一性。
  // 找到既有帳號就直接沿用（把他加進本組織），不覆蓋他本人的姓名 / email。
  const existing = await db.user.findFirst({
    where: { email: { equals: lower, mode: "insensitive" } },
    select: { id: true, name: true },
  });

  let userId: string;
  if (existing) {
    userId = existing.id;
    // 既有帳號只在他原本沒有姓名時補上，避免蓋掉本人資料。
    if (!existing.name && name) {
      await db.user.update({
        where: { id: existing.id },
        data: { name, nickname: nickname || null },
      });
    }
  } else {
    const created = await db.user.create({
      data: { email: lower, name, nickname: nickname || null },
    });
    userId = created.id;
  }

  // 組織成員關係：加入本組織（已存在則更新職稱）。
  await db.organizationMember.upsert({
    where: {
      organizationId_userId: { organizationId: org.id, userId },
    },
    update: { jobTitle: jobTitle || null },
    create: {
      organizationId: org.id,
      userId,
      email: lower,
      role: "MEMBER",
      jobTitle: jobTitle || null,
    },
  });

  revalidatePath("/team");
  return { ok: true };
}

// 頭貼 data URL 格式（png/jpeg/webp/gif 的 base64）。
const AVATAR_DATA_URL_RE = /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/;

/**
 * 更新頭貼。dataUrl＝壓縮後的圖片 data URL（存進 User.image）；null＝移除。
 * 本人可改自己的；管理者(OWNER/ADMIN)可改本組織任何人的。
 */
export async function updateAvatar(input: {
  userId: string;
  dataUrl: string | null;
}) {
  const { user, org, membership } = await requireActiveOrg();
  const targetId = input.userId;
  if (targetId !== user.id && !canManageMembers(membership.role)) {
    throw new Error("只能更改自己的頭貼；管理者才能更改他人的。");
  }
  // 管理者改他人：確認目標是本組織成員（縱深防禦，擋跨組織）。
  if (targetId !== user.id) {
    const target = await db.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId: org.id, userId: targetId } },
      select: { id: true },
    });
    if (!target) throw new Error("該成員不屬於目前組織。");
  }

  let image: string | null = null;
  if (input.dataUrl) {
    if (!AVATAR_DATA_URL_RE.test(input.dataUrl)) {
      throw new Error("頭貼格式不正確。");
    }
    // data URL 長度上限（約 500KB 圖片）；前端已壓縮成小圖，這是防呆。
    if (input.dataUrl.length > 700_000) {
      throw new Error("圖片太大，請換小一點的圖片。");
    }
    image = input.dataUrl;
  }

  await db.user.update({ where: { id: targetId }, data: { image } });
  revalidatePath("/me");
  revalidatePath(`/me/${targetId}`);
  revalidatePath("/team");
  revalidatePath("/", "layout");
  return { ok: true as const };
}

const MyProfileInput = z.object({
  name: z.string().trim().max(120).optional(),
  nickname: z.string().trim().max(120).optional(),
  useNickname: z.boolean().optional(),
  email: z.string().trim().email("Email 格式不正確").optional(),
  bio: z.string().trim().max(4000).optional(),
});

/**
 * 本人編輯自己的個人資料（任何在職成員皆可）。只能改身分顯示欄位與簡介；
 * 角色 / 權限 / 職稱 / 老闆 / 上級主管等仍只有管理者能改（於團隊頁 profile）。
 */
export async function updateMyProfileAction(
  _prev: TeamActionState,
  formData: FormData,
): Promise<TeamActionState> {
  const { user, org } = await requireActiveOrg();
  const parsed = MyProfileInput.safeParse({
    name: formData.get("name") || undefined,
    nickname: formData.get("nickname") || undefined,
    useNickname: formData.get("useNickname") === "on",
    email: formData.get("email") || undefined,
    bio: formData.get("bio") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "資料格式錯誤" };
  }
  const d = parsed.data;
  const lowerEmail = d.email ? d.email.toLowerCase() : undefined;

  const membership = await db.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: org.id, userId: user.id } },
    select: { id: true },
  });

  // 只有 email 真的變更時才寫入（不分大小寫比對目前值），避免修改其他資料時誤觸唯一性。
  const emailUpdate = await resolveEmailUpdate(user.id, lowerEmail);
  if (emailUpdate.error) return { error: emailUpdate.error };
  const setEmail = emailUpdate.email !== undefined;

  try {
    await db.$transaction([
      db.user.update({
        where: { id: user.id },
        data: {
          name: d.name ?? null,
          nickname: d.nickname || null,
          useNickname: d.useNickname ?? false,
          ...(setEmail ? { email: emailUpdate.email } : {}),
        },
      }),
      ...(membership
        ? [
            db.organizationMember.update({
              where: { id: membership.id },
              data: {
                ...(setEmail ? { email: emailUpdate.email } : {}),
                bio: d.bio || null,
              },
            }),
          ]
        : []),
    ]);
  } catch (e) {
    if ((e as { code?: string })?.code === "P2002") {
      return { error: "此 Email 已被其他帳號使用，請改用其他 Email。" };
    }
    throw e;
  }
  revalidatePath("/me");
  revalidatePath("/team");
  return { ok: true };
}

/**
 * 解析「要不要更新 email」。
 * - 表單沒帶 email（undefined）→ 不動。
 * - 與目前 email 相同（不分大小寫）→ 不動（避免修改其他資料時誤觸唯一性檢查）。
 * - 真的要改 → 先確認沒被「別的帳號」使用（不分大小寫）；被用則回錯誤訊息。
 */
async function resolveEmailUpdate(
  userId: string,
  lowerEmail: string | undefined,
): Promise<{ email?: string; error?: string }> {
  if (lowerEmail === undefined) return {};
  const current = await db.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  if ((current?.email ?? "").toLowerCase() === lowerEmail) return {}; // 沒變
  const clash = await db.user.findFirst({
    where: { email: { equals: lowerEmail, mode: "insensitive" }, id: { not: userId } },
    select: { id: true },
  });
  if (clash) {
    return { error: "此 Email 已被其他帳號使用，請改用其他 Email。" };
  }
  return { email: lowerEmail };
}

const ProfileInput = z.object({
  id: z.string().min(1), // User id
  name: z.string().trim().max(120).optional(),
  nickname: z.string().trim().max(120).optional(),
  useNickname: z.boolean().optional(),
  email: z.string().trim().email("Email 格式不正確").optional(),
  jobTitle: z.string().trim().max(120).optional(),
  department: z.string().trim().max(120).optional(),
  attendance: z.string().trim().max(200).optional(),
  bio: z.string().trim().max(4000).optional(),
  isBoss: z.boolean().optional(),
  active: z.boolean().optional(),
  managerId: z.string().optional(), // 上級主管的 membership id（空＝清除）
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
    department: formData.get("department") || undefined,
    attendance: formData.get("attendance") || undefined,
    bio: formData.get("bio") || undefined,
    active: formData.get("active") === "on",
    managerId: formData.get("managerId") || undefined,
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

  // 上級主管（membership id）：驗證同組織、非自己、不成循環。空＝清除。
  let managerId: string | null = null;
  if (d.managerId) {
    if (d.managerId === membership.id) {
      return { error: "不能把自己設為自己的主管。" };
    }
    const graph = await getMembershipGraph(org.id);
    const target = graph.find((m) => m.id === d.managerId);
    if (!target) return { error: "指定的主管不在目前組織。" };
    if (wouldCycle(graph, membership.id, d.managerId)) {
      return { error: "此指派會造成主管關係循環。" };
    }
    managerId = d.managerId;
  }

  const trackAttendance = formData.get("trackAttendance") === "on";
  const lowerEmail = d.email ? d.email.toLowerCase() : undefined;

  // 只有 email 真的變更時才寫入（不分大小寫比對目前值），避免修改職稱 / 部門等資料時誤觸唯一性。
  const emailUpdate = await resolveEmailUpdate(d.id, lowerEmail);
  if (emailUpdate.error) return { error: emailUpdate.error };
  const setEmail = emailUpdate.email !== undefined;

  try {
    await db.$transaction([
      // 身分（全域）
      db.user.update({
        where: { id: d.id },
        data: {
          name: d.name ?? null,
          nickname: d.nickname || null,
          useNickname: d.useNickname ?? false,
          ...(setEmail ? { email: emailUpdate.email } : {}),
        },
      }),
      // 組織內欄位
      db.organizationMember.update({
        where: { id: membership.id },
        data: {
          ...(setEmail ? { email: emailUpdate.email } : {}), // 與 User email 同步
          jobTitle: d.jobTitle || null,
          department: d.department || null,
          attendance: d.attendance || null,
          bio: d.bio || null,
          active: d.active ?? true,
          trackAttendance,
          managerId,
        },
      }),
    ]);
  } catch (e) {
    if ((e as { code?: string })?.code === "P2002") {
      return { error: "此 Email 已被其他帳號使用，請改用其他 Email。" };
    }
    throw e;
  }
  revalidatePath("/team");
  revalidatePath(`/me/${d.id}`);
  revalidatePath("/attendance");
  revalidatePath("/daily");
  return { ok: true };
}

/**
 * 設定 / 取消某成員為「管理者」（ADMIN）。需擁有者 / 管理員。
 * - OWNER 一律是管理者，不可在此變更。
 * - 組織至少要保留一位管理者，降級最後一位會被擋下。
 */
export async function setMemberManagerRole(userId: string, makeManager: boolean) {
  const { org } = await requireActiveOrgWithRole(["OWNER", "ADMIN"]);
  const target = await db.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: org.id, userId } },
    select: { id: true, role: true },
  });
  if (!target) throw new Error("該成員不屬於目前組織。");
  if (target.role === "OWNER") {
    throw new Error("擁有者一律是管理者，無法在此變更。");
  }

  if (makeManager) {
    if (target.role === "ADMIN") return;
    await db.organizationMember.update({
      where: { id: target.id },
      data: { role: "ADMIN" },
    });
  } else {
    if (target.role !== "ADMIN") return;
    const managerCount = await db.organizationMember.count({
      where: { organizationId: org.id, role: { in: ["OWNER", "ADMIN"] } },
    });
    if (managerCount <= 1) throw new Error("組織至少要有一位管理者。");
    await db.organizationMember.update({
      where: { id: target.id },
      data: { role: "MEMBER" },
    });
  }
  revalidatePath("/team");
  revalidatePath(`/me/${userId}`);
}

/**
 * 就地設定某成員的直屬主管（組織架構頁用）。需擁有者 / 管理員。
 * managerMembershipId 為空＝清除；驗證同組織、非自己、不成循環。
 */
export async function setMemberManager(
  userId: string,
  managerMembershipId: string | null,
) {
  const { org } = await requireActiveOrgWithRole(["OWNER", "ADMIN"]);
  const membership = await db.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: org.id, userId } },
    select: { id: true },
  });
  if (!membership) throw new Error("該成員不屬於目前組織。");

  let managerId: string | null = null;
  if (managerMembershipId) {
    if (managerMembershipId === membership.id) {
      throw new Error("不能把自己設為自己的主管。");
    }
    const graph = await getMembershipGraph(org.id);
    if (!graph.find((m) => m.id === managerMembershipId)) {
      throw new Error("指定的主管不在目前組織。");
    }
    if (wouldCycle(graph, membership.id, managerMembershipId)) {
      throw new Error("此指派會造成主管關係循環。");
    }
    managerId = managerMembershipId;
  }

  await db.organizationMember.update({
    where: { id: membership.id },
    data: { managerId },
  });
  revalidatePath("/team");
  revalidatePath(`/me/${userId}`);
  revalidatePath("/daily");
}

/**
 * 就地設定某成員的「額外回報對象」（虛線 / 矩陣式回報；組織架構頁用）。需擁有者 / 管理員。
 * membershipIds＝額外回報對象的 membership id 陣列；會去重、排除自己與非本組織成員，上限 10。
 * 這些人與正式上級主管一樣，可在每日報告看到並回饋這位成員的日報。
 */
export async function setMemberSecondaryManagers(
  userId: string,
  membershipIds: string[],
) {
  const { org } = await requireActiveOrgWithRole(["OWNER", "ADMIN"]);
  const membership = await db.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: org.id, userId } },
    select: { id: true },
  });
  if (!membership) throw new Error("該成員不屬於目前組織。");

  const graph = await getMembershipGraph(org.id);
  const validIds = new Set(graph.map((m) => m.id));
  const cleaned = Array.from(new Set(membershipIds))
    .filter((id) => id && id !== membership.id && validIds.has(id))
    .slice(0, 10);

  await db.organizationMember.update({
    where: { id: membership.id },
    data: { secondaryManagerIds: cleaned },
  });
  revalidatePath("/team");
  revalidatePath(`/me/${userId}`);
  revalidatePath("/daily");
}

/** 就地設定某成員的部門（組織架構頁用）。空字串＝清除。需擁有者 / 管理員。 */
export async function setMemberDepartment(userId: string, department: string) {
  const { org } = await requireActiveOrgWithRole(["OWNER", "ADMIN"]);
  const dept = department.trim().slice(0, 120);
  const res = await db.organizationMember.updateMany({
    where: { organizationId: org.id, userId },
    data: { department: dept || null },
  });
  if (res.count === 0) throw new Error("該成員不屬於目前組織。");
  revalidatePath("/team");
  revalidatePath(`/me/${userId}`);
}

/** 設定成員在本組織是否在職 / 啟用。需擁有者 / 管理員。 */
export async function setMemberActive(id: string, active: boolean) {
  const { org } = await requireActiveOrgWithRole(["OWNER", "ADMIN"]);
  await db.organizationMember.update({
    where: { organizationId_userId: { organizationId: org.id, userId: id } },
    data: { active },
  });
  revalidatePath("/team");
  revalidatePath(`/me/${id}`);
}

/**
 * 從目前組織移除成員（不刪除全域 User）。先把該成員在「本組織」建立 / 負責的專案
 * 轉給操作者（避免必填外鍵 createdBy 的限制），解除其在本組織專案的任務負責人關聯 /
 * 出席 / 事件，最後刪除組織成員關係。不能移除自己。需擁有者 / 管理員。
 */
export async function deleteWorkspaceMember(id: string) {
  const { user: me, org } = await requireActiveOrgWithRole(["OWNER", "ADMIN"]);
  if (id === me.id) {
    throw new Error("不能移除自己。");
  }
  // 該成員的 membership id：用來把它從其他成員的「額外回報對象」陣列中移除（無 FK，需手動）。
  const membership = await db.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: org.id, userId: id } },
    select: { id: true },
  });
  // 該成員在本組織專案中負責的任務（用來解除 Task.owners 關聯，避免移除後仍算「參與」）。
  const ownedTasks = await db.task.findMany({
    where: { project: { organizationId: org.id }, owners: { some: { id } } },
    select: { id: true },
  });
  await db.$transaction([
    // 解除任務負責人關聯（m2m）與主負責人。
    db.user.update({
      where: { id },
      data: { tasksOwned: { disconnect: ownedTasks.map((t) => ({ id: t.id })) } },
    }),
    db.task.updateMany({
      where: { project: { organizationId: org.id }, primaryOwnerId: id },
      data: { primaryOwnerId: null },
    }),
    ...(membership
      ? [
          db.$executeRaw`UPDATE "OrganizationMember"
            SET "secondaryManagerIds" = array_remove("secondaryManagerIds", ${membership.id})
            WHERE "organizationId" = ${org.id}
              AND ${membership.id} = ANY("secondaryManagerIds")`,
        ]
      : []),
    db.project.updateMany({
      where: { organizationId: org.id, createdById: id },
      data: { createdById: me.id },
    }),
    db.project.updateMany({
      where: { organizationId: org.id, ownerId: id },
      data: { ownerId: me.id },
    }),
    // 任務負責人（Task.owners）是 m2m：移除該 User 時由 FK 自動解除關聯，毋須手動清。
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
