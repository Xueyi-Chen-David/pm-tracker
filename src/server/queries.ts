import type { ProjectStatus } from "@prisma/client";
import { db } from "./db";
import { thisWeekStart, weekStartOf } from "@/lib/date";

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

export async function getProjectViews(orgId: string) {
  await ensureProjectViews(orgId);
  return db.projectView.findMany({
    where: { organizationId: orgId },
    orderBy: [{ isSystem: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
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

/** 成員選單用：目前組織的成員（回傳身分欄位 + isBoss）。 */
export async function getOrgMemberUsers(orgId: string) {
  const members = await db.organizationMember.findMany({
    where: { organizationId: orgId },
    orderBy: [{ isBoss: "desc" }, { user: { name: "asc" } }],
    select: { isBoss: true, user: { select: userIdentitySelect } },
  });
  return members.map((m) => ({ ...m.user, isBoss: m.isBoss }));
}

/** 團隊頁：目前組織的成員 + 負責/參與專案數、週報數（皆限本組織）。 */
export async function getOrgMembers(orgId: string) {
  const members = await db.organizationMember.findMany({
    where: { organizationId: orgId },
    orderBy: [{ isBoss: "desc" }, { active: "desc" }, { user: { name: "asc" } }],
    select: {
      isBoss: true,
      active: true,
      jobTitle: true,
      attendance: true,
      user: { select: userIdentitySelect },
    },
  });
  const userIds = members.map((m) => m.user.id);
  const [owned, memberOf, weeklies] = await Promise.all([
    db.project.groupBy({
      by: ["ownerId"],
      where: { organizationId: orgId, ownerId: { in: userIds } },
      _count: { _all: true },
    }),
    db.projectMember.groupBy({
      by: ["userId"],
      where: { userId: { in: userIds }, project: { organizationId: orgId } },
      _count: { _all: true },
    }),
    db.weeklyUpdate.groupBy({
      by: ["authorId"],
      where: { authorId: { in: userIds }, project: { organizationId: orgId } },
      _count: { _all: true },
    }),
  ]);
  const ownedMap = new Map(owned.map((r) => [r.ownerId, r._count._all]));
  const memberMap = new Map(memberOf.map((r) => [r.userId, r._count._all]));
  const weeklyMap = new Map(weeklies.map((r) => [r.authorId, r._count._all]));
  return members.map((m) => ({
    ...m.user,
    isBoss: m.isBoss,
    active: m.active,
    jobTitle: m.jobTitle,
    attendance: m.attendance,
    _count: {
      ownedProjects: ownedMap.get(m.user.id) ?? 0,
      memberships: memberMap.get(m.user.id) ?? 0,
      weeklyUpdates: weeklyMap.get(m.user.id) ?? 0,
    },
  }));
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
            select: { date: true, present: true, reason: true },
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
      jobTitle: true,
      isBoss: true,
      active: true,
      attendance: true,
      persona: true,
      personality: true,
      bio: true,
      productivityNote: true,
      allowedModules: true,
      trackAttendance: true,
    },
  });
  if (!membership) return null;

  const user = await db.user.findUnique({
    where: { id: userId },
    include: {
      ownedProjects: {
        where: { organizationId: orgId, archived: false },
        orderBy: { updatedAt: "desc" },
        include: { weeklyUpdates: { orderBy: { weekStart: "desc" }, take: 1 } },
      },
      memberships: {
        where: { project: { organizationId: orgId } },
        include: {
          project: {
            select: {
              id: true,
              name: true,
              type: true,
              status: true,
              health: true,
              progress: true,
              archived: true,
            },
          },
        },
      },
      weeklyUpdates: {
        where: { project: { organizationId: orgId } },
        orderBy: { weekStart: "desc" },
        take: 8,
        include: { project: { select: { id: true, name: true } } },
      },
      memberEvents: {
        where: { organizationId: orgId },
        orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
        take: 50,
      },
      weeklyTasks: {
        where: { weeklyUpdate: { project: { organizationId: orgId } } },
        orderBy: { createdAt: "desc" },
        take: 60,
        include: {
          weeklyUpdate: {
            select: {
              weekStart: true,
              project: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
  });
  if (!user) return null;
  return { ...user, ...membership };
}

export type MemberProfile = NonNullable<
  Awaited<ReturnType<typeof getMemberProfile>>
>;

const memberInclude = {
  include: { user: { select: userIdentitySelect } },
  orderBy: { role: "asc" as const },
};

/** 總覽 / 專案清單用：含負責人、成員、最新一筆週報、里程碑數。 */
export async function getProjectsOverview(orgId: string) {
  return db.project.findMany({
    where: { archived: false, organizationId: orgId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: {
      owner: { select: userIdentitySelect },
      members: memberInclude,
      milestones: { orderBy: [{ sortOrder: "asc" }, { plannedDate: "asc" }] },
      weeklyUpdates: { orderBy: { weekStart: "desc" }, take: 1 },
    },
  });
}

export type ProjectOverview = Awaited<
  ReturnType<typeof getProjectsOverview>
>[number];

/** 單一專案完整資料（限本組織；不屬本組織回 null）。 */
export async function getProject(orgId: string, id: string) {
  return db.project.findFirst({
    where: { id, organizationId: orgId },
    include: {
      owner: { select: userIdentitySelect },
      createdBy: { select: { id: true, name: true, nickname: true, useNickname: true, email: true } },
      members: memberInclude,
      milestones: { orderBy: [{ plannedDate: "asc" }, { sortOrder: "asc" }] },
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
      activities: {
        orderBy: { createdAt: "desc" },
        take: 100,
        include: {
          user: { select: { id: true, name: true, nickname: true, useNickname: true, email: true } },
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

/** 週報頁：本組織指定週的所有專案 + 該週週報。 */
export async function getReportData(orgId: string, weekStart: Date) {
  const projects = await db.project.findMany({
    where: { archived: false, organizationId: orgId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: {
      owner: { select: userIdentitySelect },
      members: memberInclude,
      weeklyUpdates: { where: { weekStart }, take: 1 },
      milestones: {
        where: {
          OR: [{ status: "DONE" }, { actualDate: { not: null } }],
        },
        orderBy: { actualDate: "desc" },
      },
    },
  });
  return projects;
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
