"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import {
  requireActiveOrg,
  requireActiveOrgWithRole,
  requireOrgPermission,
  canManageMembers,
} from "@/server/org";
import { getMembershipGraph } from "@/server/queries";
import { wouldCycle } from "@/server/hierarchy";

export type TeamActionState = {
  error?: string;
  ok?: boolean;
  /** 成功後要導向的路徑（例如把占位成員合併進既有帳號後，跳到那個人的頁面）。 */
  redirectTo?: string;
} | null;

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
    return { ok: false as const, error: "你只能編輯自己的工作描述。" };
  }
  const res = await db.organizationMember.updateMany({
    where: { organizationId: org.id, userId: d.userId },
    data: { workDescription: d.workDescription.trim() || null },
  });
  if (res.count === 0) return { ok: false as const, error: "找不到成員" };
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
    return { ok: false as const, error: "只能更改自己的頭貼；管理者才能更改他人的。" };
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
      return { ok: false as const, error: "頭貼格式不正確。" };
    }
    // data URL 長度上限（約 500KB 圖片）；前端已壓縮成小圖，這是防呆。
    if (input.dataUrl.length > 700_000) {
      return { ok: false as const, error: "圖片太大，請換小一點的圖片。" };
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
  bio: z.string().trim().max(4000).optional(),
});

/**
 * 本人編輯自己的個人資料（任何在職成員皆可）。只能改身分顯示欄位與簡介；
 * 角色 / 權限 / 職稱 / 老闆 / 上級主管等仍只有管理者能改（於團隊頁 profile）。
 * Email（登入身分）不在這裡改——改 Email 需驗證新信箱，見 requestEmailChange。
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
    bio: formData.get("bio") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "資料格式錯誤" };
  }
  const d = parsed.data;

  const membership = await db.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: org.id, userId: user.id } },
    select: { id: true },
  });

  await db.$transaction([
    db.user.update({
      where: { id: user.id },
      data: {
        name: d.name ?? null,
        nickname: d.nickname || null,
        useNickname: d.useNickname ?? false,
      },
    }),
    ...(membership
      ? [
          db.organizationMember.update({
            where: { id: membership.id },
            data: { bio: d.bio || null },
          }),
        ]
      : []),
  ]);
  revalidatePath("/me");
  revalidatePath("/team");
  return { ok: true };
}

// ── 人事頁：單一欄位 setter（依細分權限授權，管理者天生擁有全部權限故一律通過） ──

/** 更新成員職稱（人事頁）。空＝清除。需 hr.manage_position。 */
export async function setMemberJobTitle(userId: string, jobTitle: string) {
  const { org } = await requireOrgPermission("hr.manage_position");
  const title = jobTitle.trim().slice(0, 120);
  const res = await db.organizationMember.updateMany({
    where: { organizationId: org.id, userId },
    data: { jobTitle: title || null },
  });
  if (res.count === 0) throw new Error("該成員不屬於目前組織。");
  revalidatePath("/hr");
  revalidatePath("/team");
  revalidatePath(`/me/${userId}`);
}

/** 更新成員到職日（人事頁）。yyyy-mm-dd；空＝清除。需 hr.manage_employment。 */
export async function setMemberHireDate(userId: string, hireDate: string) {
  const { org } = await requireOrgPermission("hr.manage_employment");
  const v = hireDate.trim();
  if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    return { ok: false as const, error: "到職日格式錯誤。" };
  }
  const res = await db.organizationMember.updateMany({
    where: { organizationId: org.id, userId },
    data: { hireDate: v ? new Date(`${v}T00:00:00.000Z`) : null },
  });
  if (res.count === 0) throw new Error("該成員不屬於目前組織。");
  revalidatePath("/hr");
  revalidatePath("/team");
  revalidatePath(`/me/${userId}`);
  return { ok: true as const };
}

/**
 * 更新成員離職日（人事頁）。yyyy-mm-dd；空＝清除。需 hr.manage_employment。
 * 純記錄用途，不會自動連動「在職」開關——離職當天要不要立刻停用帳號由人資另行決定
 * （例如需保留在職到交接完成），故兩者刻意分開欄位、各自手動維護。
 */
export async function setMemberResignDate(userId: string, resignDate: string) {
  const { org } = await requireOrgPermission("hr.manage_employment");
  const v = resignDate.trim();
  if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    return { ok: false as const, error: "離職日格式錯誤。" };
  }
  const res = await db.organizationMember.updateMany({
    where: { organizationId: org.id, userId },
    data: { resignDate: v ? new Date(`${v}T00:00:00.000Z`) : null },
  });
  if (res.count === 0) throw new Error("該成員不屬於目前組織。");
  revalidatePath("/hr");
  revalidatePath("/team");
  revalidatePath(`/me/${userId}`);
  return { ok: true as const };
}

/** 覆蓋成員的自訂角色指派（人事頁）。只接受本組織的角色 id。需 hr.manage_roles。 */
export async function setMemberRoles(userId: string, roleIds: string[]) {
  const { org } = await requireOrgPermission("hr.manage_roles");
  const membership = await db.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: org.id, userId } },
    select: { id: true },
  });
  if (!membership) throw new Error("該成員不屬於目前組織。");
  const requested = Array.from(new Set(roleIds.map(String).filter(Boolean)));
  const validRoles = requested.length
    ? await db.orgRoleDef.findMany({
        where: { organizationId: org.id, id: { in: requested } },
        select: { id: true },
      })
    : [];
  await db.organizationMember.update({
    where: { id: membership.id },
    data: { roleDefs: { set: validRoles.map((r) => ({ id: r.id })) } },
  });
  revalidatePath("/hr");
  revalidatePath("/team");
  revalidatePath(`/me/${userId}`);
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
    return { ok: false as const, error: "擁有者一律是管理者，無法在此變更。" };
  }

  if (makeManager) {
    if (target.role === "ADMIN") return { ok: true as const };
    await db.organizationMember.update({
      where: { id: target.id },
      data: { role: "ADMIN" },
    });
  } else {
    if (target.role !== "ADMIN") return { ok: true as const };
    const managerCount = await db.organizationMember.count({
      where: { organizationId: org.id, role: { in: ["OWNER", "ADMIN"] } },
    });
    if (managerCount <= 1) {
      return { ok: false as const, error: "組織至少要有一位管理者。" };
    }
    await db.organizationMember.update({
      where: { id: target.id },
      data: { role: "MEMBER" },
    });
  }
  revalidatePath("/team");
  revalidatePath(`/me/${userId}`);
  return { ok: true as const };
}

/**
 * 就地設定某成員的直屬主管（組織架構頁用）。需擁有者 / 管理員。
 * managerMembershipId 為空＝清除；驗證同組織、非自己、不成循環。
 */
export async function setMemberManager(
  userId: string,
  managerMembershipId: string | null,
) {
  const { org } = await requireOrgPermission("hr.manage_position");
  const membership = await db.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: org.id, userId } },
    select: { id: true },
  });
  if (!membership) throw new Error("該成員不屬於目前組織。");

  let managerId: string | null = null;
  if (managerMembershipId) {
    if (managerMembershipId === membership.id) {
      return { ok: false as const, error: "不能把自己設為自己的主管。" };
    }
    const graph = await getMembershipGraph(org.id);
    if (!graph.find((m) => m.id === managerMembershipId)) {
      throw new Error("指定的主管不在目前組織。");
    }
    if (wouldCycle(graph, membership.id, managerMembershipId)) {
      return { ok: false as const, error: "此指派會造成主管關係循環。" };
    }
    managerId = managerMembershipId;
  }

  await db.organizationMember.update({
    where: { id: membership.id },
    data: { managerId },
  });
  revalidatePath("/hr");
  revalidatePath("/team");
  revalidatePath(`/me/${userId}`);
  revalidatePath("/daily");
  return { ok: true as const };
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
  const { org } = await requireOrgPermission("hr.manage_position");
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
  revalidatePath("/hr");
  revalidatePath("/team");
  revalidatePath(`/me/${userId}`);
  revalidatePath("/daily");
}

/** 就地設定某成員的部門（組織架構 / 人事頁用）。空字串＝清除。需 hr.manage_position。 */
export async function setMemberDepartment(userId: string, department: string) {
  const { org } = await requireOrgPermission("hr.manage_position");
  const dept = department.trim().slice(0, 120);
  const res = await db.organizationMember.updateMany({
    where: { organizationId: org.id, userId },
    data: { department: dept || null },
  });
  if (res.count === 0) throw new Error("該成員不屬於目前組織。");
  revalidatePath("/hr");
  revalidatePath("/team");
  revalidatePath(`/me/${userId}`);
}

/**
 * 管理員直接更正某成員在「本組織」使用的 Email（不經驗證信）——用於修正打錯的字、
 * 或成員無法收信自助改信箱時的補救。跟自助改信箱（server/actions/email-change.ts）
 * 是兩條獨立路徑，互不干擾。需 hr.manage_position。
 *
 * 這個人「有沒有登入過」（有沒有連結的 Account）決定改的範圍：
 *   - 還沒登入過（邀請時打錯信箱的常見情境）：User.email 當初建立 placeholder 帳號時
 *     就是照邀請信箱填的，同時也是 Auth.js 拿去比對「這個 Google 帳號要不要接到這筆
 *     邀請」的唯一依據（見 handle-login.ts 的 getUserByEmail，只比對 User.email，
 *     完全不看 OrganizationMember.email）。只改 OrganizationMember.email 的話，這個人
 *     用正確信箱登入時仍然對不上 placeholder、Auth.js 會建一個全新、沒有任何組織成員
 *     資格的 User——這正是「改了對方還是看不到」的成因。所以還沒登入過時兩個欄位一起改。
 *   - 已經登入過：User.email 是驗證過的真實登入身分，不在這裡動，只改
 *     OrganizationMember.email（純本組織聯絡 / 顯示用）。
 *
 * 正確的信箱剛好已經是「另一個」User（這是多租戶系統，User 表是跨組織共用的——那個人
 * 很可能只是已經在別的組織用這個信箱登入過，跟「這個組織還沒加入」不衝突）：
 *   - 還沒登入過的邀請：不能硬改 stub 的 User.email（會撞 email 的 unique 限制），
 *     改成把這筆組織成員關係「轉接」到那個既有帳號上——這樣本人之後登入就是用他既有的
 *     帳號直接加進這個組織，符合「讓他直接加入」的預期。原本的 stub User 留著（沒有
 *     任何組織成員資格、無害），不主動刪除，避免波及可能已經掛在它身上的其他資料。
 *   - 已經登入過的成員撞號：這代表兩個都是真實帳號，需要人工合併，這裡不處理，回錯誤。
 */
export async function setMemberEmailByAdmin(userId: string, email: string) {
  const { org } = await requireOrgPermission("hr.manage_position");
  const parsed = z.string().trim().toLowerCase().email("Email 格式不正確").safeParse(email);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Email 格式不正確" };
  }
  const next = parsed.data;
  const dup = await db.organizationMember.findFirst({
    where: { organizationId: org.id, email: next, userId: { not: userId } },
    select: { id: true },
  });
  if (dup) {
    return { ok: false as const, error: "此組織已有其他成員使用這個 Email。" };
  }

  const [accountCount, existingUser] = await Promise.all([
    db.account.count({ where: { userId } }),
    db.user.findFirst({ where: { email: next, id: { not: userId } }, select: { id: true } }),
  ]);
  const hasLoggedIn = accountCount > 0;

  if (existingUser && hasLoggedIn) {
    return {
      ok: false as const,
      error: "已有其他帳號使用這個 Email，且這位成員已經登入過，無法直接更正（需要合併帳號）。",
    };
  }

  if (existingUser) {
    // 還沒登入過的邀請，而正確信箱其實是另一個既有帳號：把這筆組織成員關係轉接過去，
    // 而不是硬改 stub 的 email（User.email 是 unique，改了會撞號）。
    const alreadyMember = await db.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId: org.id, userId: existingUser.id } },
    });
    if (alreadyMember) {
      return { ok: false as const, error: "這個 Email 對應的帳號已經是本組織成員了。" };
    }
    const res = await db.organizationMember.updateMany({
      where: { organizationId: org.id, userId },
      data: { userId: existingUser.id, email: next },
    });
    if (res.count === 0) return { ok: false as const, error: "該成員不屬於目前組織。" };
    revalidatePath("/hr");
    revalidatePath("/team");
    revalidatePath(`/me/${existingUser.id}`);
    return { ok: true as const, mergedIntoExisting: true };
  }

  const res = await db.organizationMember.updateMany({
    where: { organizationId: org.id, userId },
    data: { email: next },
  });
  if (res.count === 0) return { ok: false as const, error: "該成員不屬於目前組織。" };

  if (!hasLoggedIn) {
    await db.user.update({ where: { id: userId }, data: { email: next } });
  }

  revalidatePath("/hr");
  revalidatePath("/team");
  revalidatePath(`/me/${userId}`);
  return { ok: true as const, updatedLoginEmail: !hasLoggedIn };
}

// ── 批次設定（團隊清單多選）：一次對多位成員套用同一設定。需擁有者 / 管理員。 ──
const BulkIds = z
  .array(z.string().min(1))
  .min(1, "請先選擇成員")
  .max(1000);

export type BulkResult = { ok: true; count: number; skipped?: number };

/** 批次設定「在職 / 停用」。回傳實際更新筆數。 */
export async function bulkSetMemberActive(
  userIds: string[],
  active: boolean,
): Promise<BulkResult> {
  const { org } = await requireOrgPermission("hr.manage_employment");
  const ids = BulkIds.parse(userIds);
  const res = await db.organizationMember.updateMany({
    where: { organizationId: org.id, userId: { in: ids } },
    data: { active },
  });
  revalidatePath("/hr");
  revalidatePath("/team");
  revalidatePath("/attendance");
  revalidatePath("/daily");
  return { ok: true, count: res.count };
}

/** 批次設定「是否納入出席追蹤」（出勤概念，與 attendance 頁一致）。需 attendance.manage。 */
export async function bulkSetMemberTrackAttendance(
  userIds: string[],
  track: boolean,
): Promise<BulkResult> {
  const { org } = await requireOrgPermission("attendance.manage");
  const ids = BulkIds.parse(userIds);
  const res = await db.organizationMember.updateMany({
    where: { organizationId: org.id, userId: { in: ids } },
    data: { trackAttendance: track },
  });
  revalidatePath("/team");
  revalidatePath("/attendance");
  return { ok: true, count: res.count };
}

/**
 * 批次設定「上級主管」。managerMembershipId 為空＝清除所有選取者的主管。
 * 指派時逐一擋掉：主管不在組織、把某人設成自己的主管、會造成循環者（略過並回報 skipped）。
 */
export async function bulkSetMemberManager(
  userIds: string[],
  managerMembershipId: string | null,
): Promise<BulkResult> {
  const { org } = await requireOrgPermission("hr.manage_position");
  const ids = BulkIds.parse(userIds);

  if (!managerMembershipId) {
    const res = await db.organizationMember.updateMany({
      where: { organizationId: org.id, userId: { in: ids } },
      data: { managerId: null },
    });
    revalidatePath("/hr");
    revalidatePath("/team");
    revalidatePath("/daily");
    return { ok: true, count: res.count };
  }

  const graph = await getMembershipGraph(org.id);
  const manager = graph.find((m) => m.id === managerMembershipId);
  if (!manager) throw new Error("指定的主管不在目前組織。");
  const byUser = new Map(graph.map((m) => [m.userId, m]));

  // 全部指向同一位主管：對每個選取成員以「原始圖」檢查即可（不會互相影響是否成環）。
  const valid: string[] = [];
  let skipped = 0;
  for (const uid of ids) {
    const node = byUser.get(uid);
    if (!node || node.id === managerMembershipId) {
      skipped++; // 不在組織 / 不能設成自己的主管
      continue;
    }
    if (wouldCycle(graph, node.id, managerMembershipId)) {
      skipped++; // 會造成主管關係循環
      continue;
    }
    valid.push(uid);
  }
  if (valid.length) {
    await db.organizationMember.updateMany({
      where: { organizationId: org.id, userId: { in: valid } },
      data: { managerId: managerMembershipId },
    });
  }
  revalidatePath("/team");
  revalidatePath("/daily");
  return { ok: true, count: valid.length, skipped };
}

/** 設定成員在本組織是否在職 / 啟用（人事頁）。需 hr.manage_employment。 */
export async function setMemberActive(id: string, active: boolean) {
  const { org } = await requireOrgPermission("hr.manage_employment");
  await db.organizationMember.update({
    where: { organizationId_userId: { organizationId: org.id, userId: id } },
    data: { active },
  });
  revalidatePath("/hr");
  revalidatePath("/team");
  revalidatePath(`/me/${id}`);
  revalidatePath("/attendance");
  revalidatePath("/daily");
}

/**
 * 這位成員在本組織「建立 / 負責」的專案數（刪除成員前用來判斷要不要問「轉給誰接手」），
 * 以及可選的接手人選（本組織其他在職成員）。給刪除成員的確認對話框用。需 hr.manage_employment。
 */
export async function getMemberProjectHandoffInfo(userId: string) {
  const { org } = await requireOrgPermission("hr.manage_employment");
  const [ownedCount, others] = await Promise.all([
    db.project.count({
      where: {
        organizationId: org.id,
        OR: [{ ownerId: userId }, { createdById: userId }],
      },
    }),
    db.organizationMember.findMany({
      where: { organizationId: org.id, userId: { not: userId }, active: true },
      select: {
        jobTitle: true,
        user: {
          select: { id: true, name: true, nickname: true, useNickname: true, email: true },
        },
      },
      orderBy: [{ isBoss: "desc" }, { user: { name: "asc" } }],
    }),
  ]);
  return {
    ownedCount,
    others: others.map((m) => ({
      userId: m.user.id,
      name: m.user.name,
      nickname: m.user.nickname,
      useNickname: m.user.useNickname,
      email: m.user.email,
      jobTitle: m.jobTitle,
    })),
  };
}

/**
 * 從目前組織移除成員（不刪除全域 User）。他在「本組織」建立 / 負責的專案要轉給誰接手：
 * 有專案時 reassignToId 必填（由呼叫端先用 getMemberProjectHandoffInfo 問過使用者要轉給誰，
 * 不再預設悄悄轉給操作者本人）；沒有專案就不用指定。另外解除其在本組織專案的任務
 * 負責人關聯 / 出席 / 事件，最後刪除組織成員關係。不能移除自己。需擁有者 / 管理員。
 */
export async function deleteWorkspaceMember(id: string, reassignToId?: string) {
  const { user: me, org } = await requireOrgPermission("hr.manage_employment");
  if (id === me.id) {
    return { ok: false as const, error: "不能移除自己。" };
  }
  const ownedCount = await db.project.count({
    where: { organizationId: org.id, OR: [{ ownerId: id }, { createdById: id }] },
  });
  let targetUserId = me.id;
  if (ownedCount > 0) {
    if (!reassignToId) {
      return {
        ok: false as const,
        error: "此成員有建立 / 負責中的專案，請先指定要轉給誰接手。",
      };
    }
    if (reassignToId === id) {
      return { ok: false as const, error: "接手的人不能是被刪除的成員本人。" };
    }
    const target = await db.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId: org.id, userId: reassignToId } },
      select: { id: true },
    });
    if (!target) {
      return { ok: false as const, error: "指定的接手成員不屬於目前組織。" };
    }
    targetUserId = reassignToId;
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
      data: { createdById: targetUserId },
    }),
    db.project.updateMany({
      where: { organizationId: org.id, ownerId: id },
      data: { ownerId: targetUserId },
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
  revalidatePath("/hr");
  revalidatePath("/team");
  return { ok: true as const };
}
