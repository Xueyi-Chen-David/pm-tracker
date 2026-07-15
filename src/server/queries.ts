import { cache } from "react";
import type { OkrLevel, ProjectStatus } from "@prisma/client";
import { db } from "./db";
import { thisWeekStart, weekStartOf } from "@/lib/date";
import { DEFAULT_DEAL_STAGES } from "@/lib/crm";

// 註：所有查詢皆以「目前組織」(orgId) 收斂。Project 底下的子表（成員 / 週報 /
// 里程碑 / 任務 / 活動）不帶 organizationId，改用關聯過濾 project.organizationId。

/**
 * 確保某組織的「全體」系統視窗 + 各狀態預設分頁存在。
 * 「全體」設為「排除未開始 / 暫停」——這兩種狀態的專案只在各自分頁顯示，不混進全體。
 */
const EXCLUDED_FROM_ALL: ProjectStatus[] = ["NOT_STARTED", "ON_HOLD"];

function sameStatusSet(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every((x) => setB.has(x));
}

/** 系統「全體」是否已是「排除未開始 / 暫停」的設定。 */
function isAllConfigured(v: {
  statuses: string[];
  types: string[];
  exclude: boolean;
}) {
  return (
    v.exclude && v.types.length === 0 && sameStatusSet(v.statuses, EXCLUDED_FROM_ALL)
  );
}

export async function ensureProjectViews(orgId: string) {
  const count = await db.projectView.count({ where: { organizationId: orgId } });
  if (count === 0) {
    await db.projectView.createMany({
      data: [
        { organizationId: orgId, name: "全體", isSystem: true, sortOrder: 0, statuses: EXCLUDED_FROM_ALL, exclude: true },
        { organizationId: orgId, name: "未開始", statuses: ["NOT_STARTED"], sortOrder: 1 },
        { organizationId: orgId, name: "暫停", statuses: ["ON_HOLD"], sortOrder: 2 },
        { organizationId: orgId, name: "完成", statuses: ["COMPLETED"], sortOrder: 3 },
      ],
    });
    return;
  }

  // 1) 確保系統「全體」存在，且維持「排除未開始 / 暫停」
  const sys = await db.projectView.findFirst({
    where: { isSystem: true, organizationId: orgId },
  });
  if (!sys) {
    await db.projectView.create({
      data: { organizationId: orgId, name: "全體", isSystem: true, sortOrder: -1, statuses: EXCLUDED_FROM_ALL, exclude: true },
    });
  } else if (!isAllConfigured(sys)) {
    await db.projectView.update({
      where: { id: sys.id },
      data: { statuses: EXCLUDED_FROM_ALL, types: [], exclude: true },
    });
  }

  // 2) 補建「未開始」分頁
  const nonSystem = await db.projectView.findMany({
    where: { isSystem: false, organizationId: orgId },
  });
  const hasNotStarted = nonSystem.some(
    (v) =>
      !v.exclude &&
      v.types.length === 0 &&
      v.statuses.length === 1 &&
      v.statuses[0] === "NOT_STARTED",
  );
  if (!hasNotStarted) {
    const minOrder = Math.min(1, ...nonSystem.map((v) => v.sortOrder));
    await db.projectView.create({
      data: { organizationId: orgId, name: "未開始", statuses: ["NOT_STARTED"], sortOrder: minOrder - 1 },
    });
  }
}

const PROJECT_VIEW_ORDER = [
  { isSystem: "desc" as const },
  { sortOrder: "asc" as const },
  { createdAt: "asc" as const },
];

/**
 * 系統分頁的不變條件是否已滿足（分頁存在、「全體」設定正確、有「未開始」分頁）。
 * 只有回 true 時才需要跑「含寫入」的 ensureProjectViews 修補——避免每次讀取都多打
 * count + findFirst + findMany 三個查詢。
 */
function projectViewsNeedRepair(
  views: {
    isSystem: boolean;
    exclude: boolean;
    statuses: string[];
    types: string[];
  }[],
): boolean {
  if (views.length === 0) return true;
  const sys = views.find((v) => v.isSystem);
  if (!sys || !isAllConfigured(sys)) return true;
  const hasNotStarted = views.some(
    (v) =>
      !v.isSystem &&
      !v.exclude &&
      v.types.length === 0 &&
      v.statuses.length === 1 &&
      v.statuses[0] === "NOT_STARTED",
  );
  return !hasNotStarted;
}

export async function getProjectViews(orgId: string) {
  // 常見情況（分頁已建好且系統「全體」設定正確）→ 只要一次查詢就回傳。
  // 只有偵測到缺分頁 / 設定跑掉時，才跑會寫入的 ensureProjectViews 修補。
  const views = await db.projectView.findMany({
    where: { organizationId: orgId },
    orderBy: PROJECT_VIEW_ORDER,
  });
  if (!projectViewsNeedRepair(views)) return views;

  await ensureProjectViews(orgId);
  return db.projectView.findMany({
    where: { organizationId: orgId },
    orderBy: PROJECT_VIEW_ORDER,
  });
}

const userIdentitySelect = {
  id: true,
  name: true,
  nickname: true,
  useNickname: true,
  email: true,
  image: true,
} as const;

/**
 * 成員選單用：目前組織的成員（回傳身分欄位 + isBoss）。
 * 以 React cache 於單一請求內去重——版面（側欄）與幾乎每個頁面都會用同一個 orgId
 * 呼叫它，快取後同一次請求只查一次。
 */
export const getOrgMemberUsers = cache(async (orgId: string) => {
  const members = await db.organizationMember.findMany({
    where: { organizationId: orgId },
    orderBy: [{ isBoss: "desc" }, { user: { name: "asc" } }],
    select: { isBoss: true, user: { select: userIdentitySelect } },
  });
  return members.map((m) => ({ ...m.user, isBoss: m.isBoss }));
});

/** 團隊頁：目前組織的成員 + 負責/參與專案數、週報數（皆限本組織）。 */
export async function getOrgMembers(orgId: string) {
  const members = await db.organizationMember.findMany({
    where: { organizationId: orgId },
    orderBy: [{ isBoss: "desc" }, { active: "desc" }, { user: { name: "asc" } }],
    select: {
      isBoss: true,
      active: true,
      role: true,
      jobTitle: true,
      department: true,
      attendance: true,
      workDescription: true,
      // accounts>0 ＝ 曾用 OAuth（Google）登入過（被邀請但沒登入的 stub User 為 0）。
      user: { select: { ...userIdentitySelect, _count: { select: { accounts: true } } } },
    },
  });
  const userIds = members.map((m) => m.user.id);
  const [owned, ownedTasks, weeklies] = await Promise.all([
    db.project.groupBy({
      by: ["ownerId"],
      where: { organizationId: orgId, ownerId: { in: userIds } },
      _count: { _all: true },
    }),
    // 「參與」＝在該專案有負責任務的人（Task.owners）。以任務為單位撈出後，
    // 於記憶體算每人所參與的「相異專案數」。
    db.task.findMany({
      where: {
        project: { organizationId: orgId },
        owners: { some: { id: { in: userIds } } },
      },
      select: {
        projectId: true,
        owners: { where: { id: { in: userIds } }, select: { id: true } },
      },
    }),
    db.weeklyUpdate.groupBy({
      by: ["authorId"],
      where: { authorId: { in: userIds }, project: { organizationId: orgId } },
      _count: { _all: true },
    }),
  ]);
  const ownedMap = new Map(owned.map((r) => [r.ownerId, r._count._all]));
  // 每人參與的相異專案集合。
  const projByUser = new Map<string, Set<string>>();
  for (const t of ownedTasks) {
    for (const o of t.owners) {
      const set = projByUser.get(o.id) ?? new Set<string>();
      set.add(t.projectId);
      projByUser.set(o.id, set);
    }
  }
  const weeklyMap = new Map(weeklies.map((r) => [r.authorId, r._count._all]));
  return members.map((m) => {
    const { _count: userCounts, ...identity } = m.user;
    return {
      ...identity,
      isBoss: m.isBoss,
      active: m.active,
      role: m.role,
      jobTitle: m.jobTitle,
      department: m.department,
      attendance: m.attendance,
      workDescription: m.workDescription,
      hasLoggedIn: userCounts.accounts > 0, // 曾登入過
      _count: {
        ownedProjects: ownedMap.get(m.user.id) ?? 0,
        memberships: projByUser.get(m.user.id)?.size ?? 0,
        weeklyUpdates: weeklyMap.get(m.user.id) ?? 0,
      },
    };
  });
}

export type WorkspaceMember = Awaited<ReturnType<typeof getOrgMembers>>[number];

/** 出席月曆：本組織被追蹤（trackAttendance）的在職成員 + 指定月份的每日出席紀錄。 */
export async function getAttendanceMonth(orgId: string, start: Date, end: Date) {
  const members = await db.organizationMember.findMany({
    where: { organizationId: orgId, active: true, trackAttendance: true },
    orderBy: [{ isBoss: "desc" }, { user: { name: "asc" } }],
    select: {
      isBoss: true,
      user: {
        select: {
          ...userIdentitySelect,
          attendanceRecords: {
            where: { organizationId: orgId, date: { gte: start, lt: end } },
            select: {
              date: true,
              present: true,
              reason: true,
              offsite: true,
              holiday: true,
              leave: true,
            },
          },
        },
      },
    },
  });
  return members.map((m) => ({ ...m.user, isBoss: m.isBoss }));
}

export type AttendanceMonthMember = Awaited<
  ReturnType<typeof getAttendanceMonth>
>[number];

/**
 * 個人出席（無 attendance.view_all 權限者只看自己）：指定月份、單一成員的每日出席紀錄。
 * 不受 trackAttendance 限制——本人一定看得到自己的出勤。回傳與 getAttendanceMonth 相同的元素形狀。
 */
export async function getSelfAttendanceMonth(
  orgId: string,
  userId: string,
  start: Date,
  end: Date,
) {
  const member = await db.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: orgId, userId } },
    select: {
      isBoss: true,
      user: {
        select: {
          ...userIdentitySelect,
          attendanceRecords: {
            where: { organizationId: orgId, date: { gte: start, lt: end } },
            select: {
              date: true,
              present: true,
              reason: true,
              offsite: true,
              holiday: true,
              leave: true,
            },
          },
        },
      },
    },
  });
  if (!member) return [];
  return [{ ...member.user, isBoss: member.isBoss }];
}

/** 出席追蹤成員管理：本組織所有在職成員 + 是否已納入追蹤。 */
export async function getTrackableMembers(orgId: string) {
  const members = await db.organizationMember.findMany({
    where: { organizationId: orgId, active: true },
    orderBy: [{ isBoss: "desc" }, { user: { name: "asc" } }],
    select: {
      isBoss: true,
      trackAttendance: true,
      user: { select: userIdentitySelect },
    },
  });
  return members.map((m) => ({
    ...m.user,
    isBoss: m.isBoss,
    trackAttendance: m.trackAttendance,
  }));
}

/** 成員個人頁：組織內 profile + 負責/參與專案 + 近期週報活動（皆限本組織）。 */
export async function getMemberProfile(orgId: string, userId: string) {
  const membership = await db.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: orgId, userId } },
    select: {
      id: true,
      jobTitle: true,
      department: true,
      isBoss: true,
      active: true,
      attendance: true,
      bio: true,
      allowedModules: true,
      trackAttendance: true,
      managerId: true,
      secondaryManagerIds: true,
      roleDefs: { select: { id: true }, orderBy: { sortOrder: "asc" } },
      manager: {
        select: { userId: true, user: { select: userIdentitySelect } },
      },
    },
  });
  if (!membership) return null;

  const user = await db.user.findUnique({
    where: { id: userId },
    include: {
      ownedProjects: {
        where: { organizationId: orgId, archived: false },
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          name: true,
          type: true,
          status: true,
          health: true,
          progress: true,
        },
      },
      memberEvents: {
        where: { organizationId: orgId },
        orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
        take: 50,
      },
      // 被指派的任務：以「專案與任務」頁的真實 Task 為唯一來源（本人為負責人之一）。
      // 「參與的專案」也由此推導（有負責任務即算參與該專案）。
      tasksOwned: {
        where: { project: { organizationId: orgId, archived: false } },
        orderBy: [{ project: { sortOrder: "asc" } }, { sortOrder: "asc" }],
        select: {
          id: true,
          title: true,
          status: true,
          progress: true,
          startDate: true,
          dueDate: true,
          project: {
            select: {
              id: true,
              name: true,
              type: true,
              status: true,
              health: true,
              progress: true,
            },
          },
        },
      },
    },
  });
  if (!user) return null;

  // 參與的專案＝有負責任務的相異專案（未封存）。
  const participatingMap = new Map<
    string,
    (typeof user.tasksOwned)[number]["project"]
  >();
  for (const t of user.tasksOwned) {
    if (!participatingMap.has(t.project.id)) {
      participatingMap.set(t.project.id, t.project);
    }
  }
  const participatingProjects = [...participatingMap.values()];

  // 註：membership.id 是「成員關係 id」，不可蓋掉 user.id（頁面各處以 user.id 為準）。
  const { id: membershipId, ...membershipRest } = membership;
  return {
    ...user,
    ...membershipRest,
    id: user.id,
    membershipId,
    participatingProjects,
  };
}

export type MemberProfile = NonNullable<
  Awaited<ReturnType<typeof getMemberProfile>>
>;

type Identity = {
  id: string;
  name: string | null;
  nickname: string | null;
  useNickname: boolean;
  email: string | null;
  image: string | null;
};

/** 專案團隊＝在該專案有負責任務的人（Task.owners 聯集），依 userId 去重。 */
export function distinctOwners(tasks: { owners: Identity[] }[]): Identity[] {
  const map = new Map<string, Identity>();
  for (const t of tasks) {
    for (const o of t.owners) if (!map.has(o.id)) map.set(o.id, o);
  }
  return [...map.values()];
}

/** 總覽 / 專案清單用：含負責人、團隊（任務負責人聯集）、最新一筆週報、里程碑數。 */
export async function getProjectsOverview(orgId: string) {
  const projects = await db.project.findMany({
    where: { archived: false, organizationId: orgId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: {
      owner: { select: userIdentitySelect },
      tasks: { select: { owners: { select: userIdentitySelect } } },
      milestones: { orderBy: [{ sortOrder: "asc" }, { plannedDate: "asc" }] },
      weeklyUpdates: { orderBy: { weekStart: "desc" }, take: 1 },
    },
  });
  return projects.map((p) => {
    const { tasks, ...rest } = p;
    return { ...rest, team: distinctOwners(tasks) };
  });
}

export type ProjectOverview = Awaited<
  ReturnType<typeof getProjectsOverview>
>[number];

/** 合併「專案與任務」頁用：本組織未封存專案 + 底下任務（含任務負責人）。 */
export async function getProjectsWithTasks(orgId: string, archived = false) {
  return db.project.findMany({
    where: { archived, organizationId: orgId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: {
      owner: { select: userIdentitySelect },
      tasks: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        include: { owners: { select: userIdentitySelect } },
      },
      milestones: {
        orderBy: [{ sortOrder: "asc" }, { plannedDate: "asc" }],
        select: {
          id: true,
          title: true,
          status: true,
          plannedDate: true,
          isGoal: true,
        },
      },
    },
  });
}

export type ProjectWithTasks = Awaited<
  ReturnType<typeof getProjectsWithTasks>
>[number];

/** 單一專案完整資料（限本組織；不屬本組織回 null）。 */
export async function getProject(orgId: string, id: string) {
  return db.project.findFirst({
    where: { id, organizationId: orgId },
    include: {
      owner: { select: userIdentitySelect },
      createdBy: { select: { id: true, name: true, nickname: true, useNickname: true, email: true } },
      tasks: { select: { owners: { select: userIdentitySelect } } },
      milestones: { orderBy: [{ plannedDate: "asc" }, { sortOrder: "asc" }] },
      releases: {
        orderBy: [
          { releasedAt: { sort: "desc", nulls: "last" } },
          { createdAt: "desc" },
        ],
      },
      weeklyUpdates: {
        orderBy: { weekStart: "asc" },
        include: {
          author: { select: { id: true, name: true, nickname: true, useNickname: true, email: true } },
          tasks: {
            orderBy: { sortOrder: "asc" },
            include: {
              assignee: { select: { id: true, name: true, nickname: true, useNickname: true, email: true } },
            },
          },
        },
      },
    },
  });
}

export type ProjectDetail = NonNullable<Awaited<ReturnType<typeof getProject>>>;

/** 某週本組織所有專案的週報（用於總覽當週欄、週報頁）。 */
export async function getWeeklyUpdatesForWeek(orgId: string, weekStart: Date) {
  return db.weeklyUpdate.findMany({
    where: { weekStart, project: { organizationId: orgId } },
    include: {
      author: { select: { id: true, name: true, nickname: true, useNickname: true } },
    },
  });
}

/** 總覽頁資料：本組織所有專案 + 本週/上週週報對照。 */
export async function getDashboardData(orgId: string) {
  const week = thisWeekStart();
  const prevWeek = weekStartOf(new Date(week.getTime() - 3 * 24 * 3600 * 1000));
  const projects = await getProjectsOverview(orgId);
  return { week, prevWeek, projects };
}

/** 時程藍圖：本組織所有未封存專案 + 里程碑。 */
export async function getTimelineData(orgId: string) {
  return db.project.findMany({
    where: { archived: false, organizationId: orgId },
    orderBy: [{ sortOrder: "asc" }, { startDate: "asc" }],
    include: {
      owner: { select: { id: true, name: true, nickname: true, useNickname: true } },
      milestones: { orderBy: [{ plannedDate: "asc" }, { sortOrder: "asc" }] },
    },
  });
}

/** 週報頁：本組織指定週的所有專案 + 該週週報 + 團隊（任務負責人聯集）。 */
export async function getReportData(orgId: string, weekStart: Date) {
  const projects = await db.project.findMany({
    where: { archived: false, organizationId: orgId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: {
      owner: { select: userIdentitySelect },
      tasks: { select: { owners: { select: userIdentitySelect } } },
      weeklyUpdates: { where: { weekStart }, take: 1 },
      milestones: {
        where: {
          OR: [{ status: "DONE" }, { actualDate: { not: null } }],
        },
        orderBy: { actualDate: "desc" },
      },
    },
  });
  return projects.map((p) => {
    const { tasks, ...rest } = p;
    return { ...rest, team: distinctOwners(tasks) };
  });
}

export type ReportProject = Awaited<ReturnType<typeof getReportData>>[number];

/** 本組織某週的「整體說明」自由文字（可能不存在）。 */
export async function getWeeklyReport(orgId: string, weekStart: Date) {
  return db.weeklyReport.findUnique({
    where: { organizationId_weekStart: { organizationId: orgId, weekStart } },
  });
}

/** 本組織所有會議（會議記錄頁用），最新在前。 */
export async function getMeetings(orgId: string, category?: string) {
  return db.meeting.findMany({
    where: { organizationId: orgId, ...(category ? { category } : {}) },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });
}

export type MeetingRow = Awaited<ReturnType<typeof getMeetings>>[number];

/** 本組織落在指定週內的會議，依日期排序。 */
export async function getMeetingsForWeek(orgId: string, weekStart: Date) {
  const weekEnd = new Date(weekStart.getTime() + 6 * 24 * 3600 * 1000);
  return db.meeting.findMany({
    where: { organizationId: orgId, date: { gte: weekStart, lte: weekEnd } },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
  });
}

// ─────────────────────────────────────────────
// OKR（org-scoped）
// ─────────────────────────────────────────────

/** 某層級（年度/季度）出現過的週期(cycle)，最新在前——給週期選單。 */
export async function getOkrCycles(orgId: string, level: OkrLevel) {
  const rows = await db.objective.findMany({
    where: { organizationId: orgId, level },
    distinct: ["cycle"],
    select: { cycle: true },
    orderBy: { cycle: "desc" },
  });
  return rows.map((r) => r.cycle);
}

/** 某層級 + 週期的目標 + KR（含負責人、連結專案的當下快照、目標負責人）。 */
export async function getObjectives(
  orgId: string,
  level: OkrLevel,
  cycle: string,
) {
  return db.objective.findMany({
    where: { organizationId: orgId, level, cycle, archived: false },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: {
      owner: { select: userIdentitySelect },
      keyResults: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        include: {
          owners: { select: userIdentitySelect },
          project: {
            select: {
              id: true,
              name: true,
              status: true,
              health: true,
              progress: true,
            },
          },
        },
      },
    },
  });
}

export type ObjectiveWithKrs = Awaited<ReturnType<typeof getObjectives>>[number];
export type KeyResultRow = ObjectiveWithKrs["keyResults"][number];

/**
 * 某層級「所有週期」的目標 + KR（年度 OKR 用：一次取回全部年份，於頁面依 cycle 分組）。
 * 回傳結構與 getObjectives 相同，可共用 toView。
 */
export async function getObjectivesByLevel(orgId: string, level: OkrLevel) {
  return db.objective.findMany({
    where: { organizationId: orgId, level, archived: false },
    orderBy: [{ cycle: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    include: {
      owner: { select: userIdentitySelect },
      keyResults: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        include: {
          owners: { select: userIdentitySelect },
          project: {
            select: {
              id: true,
              name: true,
              status: true,
              health: true,
              progress: true,
            },
          },
        },
      },
    },
  });
}

/** 公司營運頁：組織願景（Vision）文字。 */
export async function getOrgVision(orgId: string) {
  const o = await db.organization.findUnique({
    where: { id: orgId },
    select: { vision: true },
  });
  return o?.vision ?? null;
}

/** KR→專案選單用：本組織未封存專案的精簡清單（含當下狀態）。 */
export async function getProjectsLite(orgId: string) {
  return db.project.findMany({
    where: { organizationId: orgId, archived: false },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      status: true,
      health: true,
      progress: true,
    },
  });
}

/** 反向：某專案被哪些 KR / Objective 引用（專案頁「支援目標」chip 用）。 */
export async function getKrLinksForProject(orgId: string, projectId: string) {
  return db.keyResult.findMany({
    where: { projectId, objective: { organizationId: orgId } },
    select: {
      id: true,
      title: true,
      objective: { select: { id: true, title: true, cycle: true, level: true } },
    },
  });
}

// ─────────────────────────────────────────────
// 組織架構 / 成員名錄
// ─────────────────────────────────────────────

/** 組織架構運算用：全體成員的 (membership id, userId, managerId, 額外回報對象)。 */
export async function getMembershipGraph(orgId: string) {
  return db.organizationMember.findMany({
    where: { organizationId: orgId },
    select: {
      id: true,
      userId: true,
      managerId: true,
      secondaryManagerIds: true,
    },
  });
}

/** 成員名錄（主管下拉、組織架構顯示用）：membership id + 身分 + 職稱 + 主管。 */
export async function getOrgMemberDirectory(orgId: string) {
  const members = await db.organizationMember.findMany({
    where: { organizationId: orgId },
    orderBy: [{ isBoss: "desc" }, { active: "desc" }, { user: { name: "asc" } }],
    select: {
      id: true,
      managerId: true,
      secondaryManagerIds: true,
      role: true,
      isBoss: true,
      active: true,
      jobTitle: true,
      department: true,
      user: { select: userIdentitySelect },
    },
  });
  // 註：展開後 id＝userId（給連結用），membershipId＝成員關係 id（主管欄位的值）。
  return members.map((m) => ({
    ...m.user,
    membershipId: m.id,
    managerId: m.managerId,
    secondaryManagerIds: m.secondaryManagerIds,
    role: m.role,
    isBoss: m.isBoss,
    active: m.active,
    jobTitle: m.jobTitle,
    department: m.department,
  }));
}

export type OrgMemberDirectoryEntry = Awaited<
  ReturnType<typeof getOrgMemberDirectory>
>[number];

// ─────────────────────────────────────────────
// 人資：角色 / 假別
// ─────────────────────────────────────────────

/** 本組織的自訂角色（含權限與指派人數），依 sortOrder。 */
export async function getOrgRoles(orgId: string) {
  const roles = await db.orgRoleDef.findMany({
    where: { organizationId: orgId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      description: true,
      color: true,
      permissions: true,
      visibleModules: true,
      _count: { select: { members: true } },
    },
  });
  return roles.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    color: r.color,
    permissions: r.permissions,
    visibleModules: r.visibleModules,
    memberCount: r._count.members,
  }));
}

export type OrgRoleEntry = Awaited<ReturnType<typeof getOrgRoles>>[number];

/** 本組織的假別（差勤 / 薪資共用）。activeOnly＝只取啟用中的。 */
export async function getOrgLeaveTypes(orgId: string, activeOnly = false) {
  return db.leaveType.findMany({
    where: { organizationId: orgId, ...(activeOnly ? { active: true } : {}) },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      paidPercent: true,
      annualQuotaDays: true,
      color: true,
      active: true,
    },
  });
}

export type OrgLeaveType = Awaited<
  ReturnType<typeof getOrgLeaveTypes>
>[number];

/**
 * 薪資頁總覽：本組織在職成員 + 其薪資設定 + 指定月份的薪資單（若已產生）。
 * Decimal 一律轉成 number，讓資料可安全傳給 client 元件。
 */
export async function getPayrollOverview(
  orgId: string,
  year: number,
  month: number,
) {
  const members = await db.organizationMember.findMany({
    where: { organizationId: orgId, active: true },
    orderBy: [{ isBoss: "desc" }, { user: { name: "asc" } }],
    select: {
      id: true,
      jobTitle: true,
      isBoss: true,
      user: { select: userIdentitySelect },
      salaryProfile: {
        select: {
          payType: true,
          baseAmount: true,
          currency: true,
          standardWorkDays: true,
          standardHoursPerDay: true,
          overtimeMultiplier: true,
          allowances: true,
          deductions: true,
          note: true,
        },
      },
      payslips: {
        where: { periodYear: year, periodMonth: month },
        take: 1,
        select: {
          id: true,
          payType: true,
          baseAmount: true,
          currency: true,
          workedDays: true,
          leaveDays: true,
          absentDays: true,
          overtimeHours: true,
          grossPay: true,
          overtimePay: true,
          allowanceTotal: true,
          leaveDeduction: true,
          absentDeduction: true,
          deductionTotal: true,
          netPay: true,
          breakdown: true,
          status: true,
          computedAt: true,
        },
      },
    },
  });

  return members.map((m) => {
    const sp = m.salaryProfile;
    const ps = m.payslips[0];
    return {
      membershipId: m.id,
      userId: m.user.id,
      name: m.user.name,
      nickname: m.user.nickname,
      useNickname: m.user.useNickname,
      email: m.user.email,
      image: m.user.image,
      jobTitle: m.jobTitle,
      isBoss: m.isBoss,
      salary: sp
        ? {
            payType: sp.payType,
            baseAmount: Number(sp.baseAmount),
            currency: sp.currency,
            standardWorkDays: sp.standardWorkDays,
            standardHoursPerDay: sp.standardHoursPerDay,
            overtimeMultiplier: sp.overtimeMultiplier,
            allowances: sp.allowances,
            deductions: sp.deductions,
            note: sp.note,
          }
        : null,
      payslip: ps
        ? {
            id: ps.id,
            payType: ps.payType,
            baseAmount: Number(ps.baseAmount),
            currency: ps.currency,
            workedDays: ps.workedDays,
            leaveDays: ps.leaveDays,
            absentDays: ps.absentDays,
            overtimeHours: ps.overtimeHours,
            grossPay: Number(ps.grossPay),
            overtimePay: Number(ps.overtimePay),
            allowanceTotal: Number(ps.allowanceTotal),
            leaveDeduction: Number(ps.leaveDeduction),
            absentDeduction: Number(ps.absentDeduction),
            deductionTotal: Number(ps.deductionTotal),
            netPay: Number(ps.netPay),
            breakdown: ps.breakdown,
            status: ps.status,
            computedAt: ps.computedAt,
          }
        : null,
    };
  });
}

export type PayrollMember = Awaited<
  ReturnType<typeof getPayrollOverview>
>[number];

// ─────────────────────────────────────────────
// 每日報告 / 通知
// ─────────────────────────────────────────────

/** 某人某日的每日報告（可能不存在）。 */
export async function getDailyReport(orgId: string, userId: string, date: Date) {
  return db.dailyReport.findUnique({
    where: {
      organizationId_userId_date: { organizationId: orgId, userId, date },
    },
  });
}

const dailyReportInclude = {
  user: { select: userIdentitySelect },
  items: { orderBy: { sortOrder: "asc" as const } },
  comments: {
    orderBy: { createdAt: "asc" as const },
    include: { author: { select: userIdentitySelect } },
  },
} as const;

/** 指定使用者集合、自某日起的每日報告（本人歷史 / 主管檢視共用），最新在前。 */
export async function getDailyReportsForUsers(
  orgId: string,
  userIds: string[],
  since: Date,
) {
  if (userIds.length === 0) return [];
  return db.dailyReport.findMany({
    where: {
      organizationId: orgId,
      userId: { in: userIds },
      date: { gte: since },
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    include: dailyReportInclude,
  });
}

export type DailyReportRow = Awaited<
  ReturnType<typeof getDailyReportsForUsers>
>[number];

/** 目前組織、目前使用者的通知（最新在前）。 */
export async function getNotifications(orgId: string, userId: string, take = 20) {
  return db.notification.findMany({
    where: { organizationId: orgId, userId },
    orderBy: { createdAt: "desc" },
    take,
  });
}

export type NotificationRow = Awaited<ReturnType<typeof getNotifications>>[number];

/** 目前組織、目前使用者的未讀通知數。 */
export async function getUnreadNotificationCount(orgId: string, userId: string) {
  return db.notification.count({
    where: { organizationId: orgId, userId, read: false },
  });
}

// ─────────────────────────────────────────────
// 員工教育訓練文件庫（Training Docs）— 巢狀資料夾 + markdown 文件
// ─────────────────────────────────────────────

/**
 * 本組織的全部文件樹（資料夾 + 文件含內容）。
 * 內部知識庫規模不大，一次載齊即可在前端建樹、即時搜尋與渲染，免逐頁往返。
 */
export async function getTrainingDocs(
  orgId: string,
  userId: string,
  canManage: boolean,
) {
  const [folders, pages] = await Promise.all([
    db.trainingDocFolder.findMany({
      where: { organizationId: orgId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, parentId: true, sortOrder: true },
    }),
    db.trainingDocPage.findMany({
      where: {
        organizationId: orgId,
        // 管理者一律可見；其他人只看 ALL、被列入可見白名單、或被列入可編輯白名單者。
        ...(canManage
          ? {}
          : {
              OR: [
                { visibility: "ALL" },
                { visibility: "RESTRICTED", allowedUserIds: { has: userId } },
                { editorUserIds: { has: userId } },
              ],
            }),
      },
      orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
      select: {
        id: true,
        title: true,
        content: true,
        folderId: true,
        sortOrder: true,
        updatedAt: true,
        visibility: true,
        allowedUserIds: true,
        editorUserIds: true,
      },
    }),
  ]);
  return { folders, pages };
}

export type TrainingDocFolderRow = Awaited<
  ReturnType<typeof getTrainingDocs>
>["folders"][number];

export type TrainingDocPageRow = Awaited<
  ReturnType<typeof getTrainingDocs>
>["pages"][number];

// ─────────────────────────────────────────────
// CRM（org-scoped）
// ─────────────────────────────────────────────

/** 所有商機（看板 + 統計用）：含聯絡人精簡、負責人、活動數。 */
export async function getCrmDeals(orgId: string) {
  return db.crmDeal.findMany({
    where: { organizationId: orgId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: {
      contact: { select: { id: true, name: true, company: true } },
      owner: { select: userIdentitySelect },
      _count: { select: { activities: true } },
    },
  });
}
export type CrmDealRow = Awaited<ReturnType<typeof getCrmDeals>>[number];

/** 聯絡人清單：含負責人與商機數。 */
export async function getCrmContacts(orgId: string) {
  return db.crmContact.findMany({
    where: { organizationId: orgId },
    orderBy: { createdAt: "desc" },
    include: {
      owner: { select: userIdentitySelect },
      _count: { select: { deals: true } },
    },
  });
}
export type CrmContactRow = Awaited<ReturnType<typeof getCrmContacts>>[number];

/** CRM 活動紀錄（最新在前），含關聯客戶精簡資料。 */
export async function getCrmEvents(orgId: string) {
  return db.crmEvent.findMany({
    where: { organizationId: orgId },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    include: {
      contact: { select: { id: true, name: true, company: true } },
    },
  });
}
export type CrmEventRow = Awaited<ReturnType<typeof getCrmEvents>>[number];

/** 每組織的管線階段（依 sortOrder）；若尚未種子則自動建立預設 8 階段。 */
export async function getDealStages(orgId: string) {
  const order = [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }];
  const existing = await db.dealStage.findMany({
    where: { organizationId: orgId },
    orderBy: order,
  });
  if (existing.length > 0) return existing;
  await db.dealStage.createMany({
    data: DEFAULT_DEAL_STAGES.map((s, i) => ({
      organizationId: orgId,
      key: s.key,
      label: s.label,
      color: s.color,
      sortOrder: i,
    })),
    skipDuplicates: true,
  });
  return db.dealStage.findMany({ where: { organizationId: orgId }, orderBy: order });
}
export type DealStageRow = Awaited<ReturnType<typeof getDealStages>>[number];
