import { cache } from "react";
import type { OkrLevel, ProjectStatus } from "@prisma/client";
import { db } from "./db";
import { thisWeekStart, weekStartOf } from "@/lib/date";
import {
  formatClock,
  taipeiMinutesOfDay,
  type CheckInReminderFacts,
} from "@/lib/checkin-reminder";
import { DEFAULT_DEAL_STAGES } from "@/lib/crm";
import { specialLeaveDays } from "@/lib/leave-entitlement";
import { LEAVE_EVENT_TYPES } from "@/lib/constants";

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
      email: true, // 此組織使用的 email（顯示用；非全域登入身分）
      isBoss: true,
      active: true,
      role: true,
      jobTitle: true,
      department: true,
      attendance: true,
      trackAttendance: true,
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
      email: m.email, // 此組織使用的 email（覆蓋全域 user.email）
      isBoss: m.isBoss,
      active: m.active,
      role: m.role,
      jobTitle: m.jobTitle,
      department: m.department,
      attendance: m.attendance,
      trackAttendance: m.trackAttendance,
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
      checkInExempt: true,
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
              leaveHours: true,
              // 人工清除的墓碑：顯示為未記錄，且壓過「未打卡自動缺席」。
              cleared: true,
              // 假別名稱（特休 / 事假…）：供月曆 tooltip 與 Excel 匯出顯示。
              leaveType: { select: { name: true } },
            },
          },
        },
      },
    },
  });
  return members.map((m) => ({
    ...m.user,
    isBoss: m.isBoss,
    checkInExempt: m.checkInExempt,
  }));
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
      checkInExempt: true,
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
              leaveHours: true,
              // 人工清除的墓碑：顯示為未記錄，且壓過「未打卡自動缺席」。
              cleared: true,
              // 假別名稱（特休 / 事假…）：供月曆 tooltip 與 Excel 匯出顯示。
              leaveType: { select: { name: true } },
            },
          },
        },
      },
    },
  });
  if (!member) return [];
  return [
    { ...member.user, isBoss: member.isBoss, checkInExempt: member.checkInExempt },
  ];
}

/** 本人近期補打卡申請（最新在前）。 */
export async function getMyCheckInCorrections(orgId: string, userId: string) {
  const rows = await db.checkInCorrection.findMany({
    where: { organizationId: orgId, userId },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      date: true,
      kind: true,
      at: true,
      reason: true,
      status: true,
      reviewNote: true,
    },
  });
  return rows.map((r) => ({
    ...r,
    date: r.date.toISOString().slice(0, 10),
    at: r.at.toISOString(),
  }));
}

export type CheckInCorrectionRow = Awaited<
  ReturnType<typeof getMyCheckInCorrections>
>[number];

/** 待審核的補打卡申請（出勤管理者用），附申請人身分。 */
export async function getPendingCheckInCorrections(orgId: string) {
  const rows = await db.checkInCorrection.findMany({
    where: { organizationId: orgId, status: "pending" },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      userId: true,
      date: true,
      kind: true,
      at: true,
      reason: true,
      user: { select: userIdentitySelect },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    date: r.date.toISOString().slice(0, 10),
    kind: r.kind,
    at: r.at.toISOString(),
    reason: r.reason,
    requester: r.user,
  }));
}

export type PendingCheckInCorrection = Awaited<
  ReturnType<typeof getPendingCheckInCorrections>
>[number];

/**
 * 「今天忘了打卡」提醒所需的今日事實（見 lib/checkin-reminder.ts）。
 * 每頁的 layout 都會跑，所以刻意省：週末 / 企業沒開打卡就直接回 null 不查後面的表，
 * 真的要查也只是三筆走索引的小查詢（同一天、同一人）。
 *
 * 回傳 null＝這個人現在完全不需要被提醒（前端連紅點都不會出現）。
 */
export async function getCheckInReminderFacts(
  orgId: string,
  userId: string,
  today: Date,
): Promise<CheckInReminderFacts | null> {
  const todayStr = today.toISOString().slice(0, 10);
  const weekday = today.getUTCDay();
  if (weekday === 0 || weekday === 6) return null; // 週末不提醒

  const [orgRow, member] = await Promise.all([
    db.organization.findUnique({
      where: { id: orgId },
      select: { checkInEnabled: true },
    }),
    db.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId: orgId, userId } },
      select: { checkInExempt: true },
    }),
  ]);
  if (!orgRow?.checkInEnabled) return null;
  if (member?.checkInExempt) return null; // 免打卡的人不提醒

  const [punches, record, corrections] = await Promise.all([
    db.checkIn.findMany({
      where: { organizationId: orgId, userId, date: today, valid: true },
      orderBy: { at: "asc" },
      select: { kind: true, at: true },
    }),
    db.attendanceRecord.findUnique({
      where: {
        organizationId_userId_date: { organizationId: orgId, userId, date: today },
      },
      select: { leave: true, holiday: true, offsite: true, cleared: true },
    }),
    db.checkInCorrection.findMany({
      where: { organizationId: orgId, userId, date: today, status: "pending" },
      select: { kind: true },
    }),
  ]);

  const firstIn = punches.find((p) => p.kind === "in");
  return {
    todayStr,
    weekend: false,
    hasIn: !!firstIn,
    hasOut: punches.some((p) => p.kind === "out"),
    // 請假 / 出差 / 在家工作 / 休假 / 人工清除的日子本來就不用打卡。
    dayOff: !!record && (record.leave || record.holiday || record.offsite || record.cleared),
    pendingIn: corrections.some((c) => c.kind === "in"),
    pendingOut: corrections.some((c) => c.kind === "out"),
    inAtLabel: firstIn ? taipeiClock(firstIn.at) : null,
  };
}

/** UTC 時刻 → 台灣當地 "HH:mm"（伺服器時區為 UTC，不能直接 format）。 */
function taipeiClock(at: Date): string {
  return formatClock(taipeiMinutesOfDay(at.getTime()));
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
      email: true, // 此組織使用的 email（覆蓋 user.email 全域登入身分，供顯示）
      jobTitle: true,
      department: true,
      hireDate: true,
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

/**
 * 單筆會議（分享連結 /meetings/[id] 用）。刻意不吃 orgId——連結不限「目前使用中的組織」，
 * 呼叫端要另外用回傳的 organizationId 檢查「這個人是不是該組織的成員」才能顯示內容。
 */
export async function getMeetingById(id: string) {
  return db.meeting.findUnique({
    where: { id },
    include: { organization: { select: { name: true } } },
  });
}

export type MeetingWithOrg = Awaited<ReturnType<typeof getMeetingById>>;

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
      email: true, // 此組織使用的 email（顯示用；非全域登入身分）
      managerId: true,
      secondaryManagerIds: true,
      role: true,
      isBoss: true,
      active: true,
      jobTitle: true,
      department: true,
      leaveApprovalExempt: true,
      user: { select: userIdentitySelect },
    },
  });
  // 註：展開後 id＝userId（給連結用），membershipId＝成員關係 id（主管欄位的值）。
  return members.map((m) => ({
    ...m.user,
    email: m.email, // 此組織使用的 email（覆蓋全域 user.email）
    membershipId: m.id,
    managerId: m.managerId,
    secondaryManagerIds: m.secondaryManagerIds,
    role: m.role,
    isBoss: m.isBoss,
    active: m.active,
    jobTitle: m.jobTitle,
    department: m.department,
    leaveApprovalExempt: m.leaveApprovalExempt,
  }));
}

export type OrgMemberDirectoryEntry = Awaited<
  ReturnType<typeof getOrgMemberDirectory>
>[number];

/**
 * 人事頁：本組織全體成員的任職資訊（含到職日、在職狀態、已指派角色）。
 * hireDate 轉成 yyyy-mm-dd 字串（給 <input type=date> 與年資計算用），Date 不直接傳給 client。
 */
export async function getHrDirectory(orgId: string) {
  const members = await db.organizationMember.findMany({
    where: { organizationId: orgId },
    orderBy: [{ active: "desc" }, { isBoss: "desc" }, { user: { name: "asc" } }],
    select: {
      id: true,
      email: true, // 此組織使用的聯絡 / 邀請信箱（非全域登入身分，見下方 orgEmail）
      role: true,
      isBoss: true,
      active: true,
      jobTitle: true,
      department: true,
      hireDate: true,
      resignDate: true,
      checkInExempt: true,
      managerId: true,
      secondaryManagerIds: true,
      user: { select: userIdentitySelect },
      roleDefs: { select: { id: true } },
    },
  });
  // 展開後 id＝userId（連結 / action 用），membershipId＝成員關係 id（主管欄位的值）。
  // m.user.email（展開進 ...m.user 的 email）＝全域登入信箱；orgEmail 才是這組織用的，
  // 兩者刻意分開欄位名稱，避免呼叫端誤把其中一個當另一個用。
  return members.map((m) => ({
    ...m.user,
    membershipId: m.id,
    orgEmail: m.email,
    role: m.role,
    isBoss: m.isBoss,
    active: m.active,
    jobTitle: m.jobTitle,
    department: m.department,
    hireDate: m.hireDate ? m.hireDate.toISOString().slice(0, 10) : null,
    resignDate: m.resignDate ? m.resignDate.toISOString().slice(0, 10) : null,
    checkInExempt: m.checkInExempt,
    managerId: m.managerId,
    secondaryManagerIds: m.secondaryManagerIds,
    roleIds: m.roleDefs.map((r) => r.id),
  }));
}

export type HrDirectoryEntry = Awaited<ReturnType<typeof getHrDirectory>>[number];

/** 本組織現有部門清單（去重、排序），供人事頁部門欄位的 datalist 建議。 */
export async function getOrgDepartments(orgId: string): Promise<string[]> {
  const rows = await db.organizationMember.findMany({
    where: { organizationId: orgId, department: { not: null } },
    select: { department: true },
    distinct: ["department"],
    orderBy: { department: "asc" },
  });
  return rows.map((r) => r.department).filter((d): d is string => Boolean(d));
}

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

// ─────────────────────────────────────────────
// 請假簽核（Leave approval）
// ─────────────────────────────────────────────

/** 本組織的簽核關卡設定（依順序，含指定簽核人的身分）。 */
export async function getLeaveApprovalFlow(orgId: string) {
  return db.leaveApprovalStep.findMany({
    where: { organizationId: orgId },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      sortOrder: true,
      approverType: true,
      approverMemberId: true,
      approverMember: {
        select: { id: true, active: true, user: { select: userIdentitySelect } },
      },
    },
  });
}

export type LeaveApprovalFlowStep = Awaited<
  ReturnType<typeof getLeaveApprovalFlow>
>[number];

/** 請假申請（含逐關簽核紀錄 + 申請人 / 各關簽核人身分）的共用 select。 */
const leaveRequestSelect = {
  id: true,
  startDate: true,
  endDate: true,
  days: true,
  startTime: true,
  endTime: true,
  hours: true,
  reason: true,
  attachment: true,
  attachmentName: true,
  status: true,
  currentStep: true,
  createdAt: true,
  decidedAt: true,
  deletedAt: true,
  leaveType: { select: { id: true, name: true, color: true } },
  member: { select: { id: true, user: { select: userIdentitySelect } } },
  approvals: {
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      sortOrder: true,
      status: true,
      comment: true,
      decidedAt: true,
      approverMemberId: true,
      approverMember: {
        select: { id: true, user: { select: userIdentitySelect } },
      },
    },
  },
} as const;

/** 我送出的請假申請（最新在前）。已被 HR 刪除的不顯示。 */
export async function getMyLeaveRequests(orgId: string, userId: string) {
  return db.leaveRequest.findMany({
    where: { organizationId: orgId, userId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: leaveRequestSelect,
  });
}

export type LeaveRequestRow = Awaited<
  ReturnType<typeof getMyLeaveRequests>
>[number];

/**
 * 「待我簽核」：目前這一關正是我、且尚待簽核的請假申請（嚴格逐關——前面關卡未輪到我時先不顯示）。
 * membershipId＝我在本組織的成員關係 id。
 */
export async function getPendingApprovalsForMember(
  orgId: string,
  membershipId: string,
) {
  const requests = await db.leaveRequest.findMany({
    where: {
      organizationId: orgId,
      status: "PENDING",
      deletedAt: null,
      approvals: { some: { approverMemberId: membershipId, status: "PENDING" } },
    },
    orderBy: { createdAt: "asc" },
    select: leaveRequestSelect,
  });
  return requests.filter((r) => {
    const current = r.approvals.find((a) => a.sortOrder === r.currentStep);
    return (
      current?.approverMemberId === membershipId && current.status === "PENDING"
    );
  });
}

/**
 * 「手上是否還卡著待簽核」——只給側欄判斷要不要顯示「請假簽核」用（見 app/(app)/layout.tsx）。
 * 請假申請 + 出差 / 事件登記都算（兩者共用同一組簽核流程，見 lib/leave-timeline.ts 註解）。
 *
 * 側欄在每一頁都會跑，不能為了一個布林值去撈完整的申請單（含巢狀簽核關卡）。這裡刻意省略
 * 「這關正好輪到我」(sortOrder === currentStep) 的比對——Prisma 無法直接比兩個欄位，得撈回來用
 * JS 過濾。因此本函式回的是**超集**：夠格顯示入口即可，精確的「輪到我」判斷仍由 /leave 頁自己做。
 */
export async function countPendingApprovalsForMember(
  orgId: string,
  membershipId: string,
) {
  const [leaves, events] = await Promise.all([
    db.leaveRequest.count({
      where: {
        organizationId: orgId,
        status: "PENDING",
        deletedAt: null,
        approvals: { some: { approverMemberId: membershipId, status: "PENDING" } },
      },
    }),
    db.memberEvent.count({
      where: {
        organizationId: orgId,
        status: "PENDING",
        approvals: { some: { approverMemberId: membershipId, status: "PENDING" } },
      },
    }),
  ]);
  return leaves + events;
}

/**
 * 這位成員「有沒有可能」出現在待我簽核 —— 依目前的簽核關卡設定判斷：
 *   - 有任一關卡是 MEMBER 且指定就是他 → 是。
 *   - 有任一關卡是 MANAGER，且他目前是至少一位在職成員的直屬主管 → 是（會動態解析到他）。
 * 一般成員（兩者皆非）不該在請假頁看到「待我簽核」分頁。
 */
export async function isEligibleLeaveApprover(
  orgId: string,
  membershipId: string,
): Promise<boolean> {
  const steps = await db.leaveApprovalStep.findMany({
    where: { organizationId: orgId },
    select: { approverType: true, approverMemberId: true },
  });
  if (steps.length === 0) return false;

  const isDirectlyNamed = steps.some(
    (s) => s.approverType === "MEMBER" && s.approverMemberId === membershipId,
  );
  if (isDirectlyNamed) return true;

  const hasManagerStep = steps.some((s) => s.approverType === "MANAGER");
  if (!hasManagerStep) return false;

  const managedCount = await db.organizationMember.count({
    where: { organizationId: orgId, managerId: membershipId, active: true },
  });
  return managedCount > 0;
}

/**
 * 出差 / 事件登記（含逐關簽核紀錄 + 登記人 / 各關簽核人身分）的共用 select。
 * 結構刻意對齊 leaveRequestSelect，讓「請假 / 出差」合併時間軸能共用同一套渲染邏輯
 * （見 lib/leave-timeline.ts、components/leave/member-event-row.tsx）。
 */
const memberEventSelect = {
  id: true,
  type: true,
  startDate: true,
  endDate: true,
  note: true,
  attachment: true,
  attachmentName: true,
  status: true,
  currentStep: true,
  createdAt: true,
  decidedAt: true,
  user: { select: userIdentitySelect },
  approvals: {
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      sortOrder: true,
      status: true,
      comment: true,
      decidedAt: true,
      approverMemberId: true,
      approverMember: {
        select: { id: true, user: { select: userIdentitySelect } },
      },
    },
  },
} as const;

/** 某成員的請假 / 出差 / 事件登記（最新在前）。 */
export async function getMemberEventsForUser(orgId: string, userId: string) {
  return db.memberEvent.findMany({
    where: { organizationId: orgId, userId },
    orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
    take: 50,
    select: memberEventSelect,
  });
}

export type MemberEventRow = Awaited<
  ReturnType<typeof getMemberEventsForUser>
>[number];

/**
 * 「待我簽核」：目前這一關正是我、且尚待簽核的出差 / 事件登記（邏輯同
 * getPendingApprovalsForMember，只是換一張表）。
 */
export async function getPendingEventApprovalsForMember(
  orgId: string,
  membershipId: string,
) {
  const events = await db.memberEvent.findMany({
    where: {
      organizationId: orgId,
      status: "PENDING",
      approvals: { some: { approverMemberId: membershipId, status: "PENDING" } },
    },
    orderBy: { createdAt: "asc" },
    select: memberEventSelect,
  });
  return events.filter((e) => {
    const current = e.approvals.find((a) => a.sortOrder === e.currentStep);
    return (
      current?.approverMemberId === membershipId && current.status === "PENDING"
    );
  });
}

/** 全體請假申請（HR / 管理者總覽，最新在前）。已刪除的不顯示，見 getDeletedLeaveRequests。 */
export async function getAllLeaveRequests(orgId: string, take = 100) {
  return db.leaveRequest.findMany({
    where: { organizationId: orgId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    take,
    select: leaveRequestSelect,
  });
}

/** 已刪除的請假申請（HR 復原用；最近刪除的在前）。 */
export async function getDeletedLeaveRequests(orgId: string, take = 100) {
  return db.leaveRequest.findMany({
    where: { organizationId: orgId, deletedAt: { not: null } },
    orderBy: { deletedAt: "desc" },
    take,
    select: leaveRequestSelect,
  });
}

/**
 * 全體出差 / 事件（HR / 管理者總覽）——與「全體請假」合併成同一條時間軸顯示
 * （見 lib/leave-timeline.ts），讓出差 / 在家工作 / 外出等免簽核登記也有個統一能查看
 * 全體的地方，不必逐一切換成員。排除「請假」類型：正式請假走簽核流程，已經在
 * LeaveRequest 看得到，這裡重複列出只會混淆。createdAt 供合併排序 tie-break 用。
 */
export async function getAllMemberEvents(orgId: string, take = 100) {
  return db.memberEvent.findMany({
    where: {
      organizationId: orgId,
      type: { notIn: Array.from(LEAVE_EVENT_TYPES) },
    },
    orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
    take,
    select: memberEventSelect,
  });
}

export type AllMemberEventRow = Awaited<
  ReturnType<typeof getAllMemberEvents>
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
      hireDate: true,
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
          insuredSalary: true,
          dependents: true,
          laborInsured: true,
          healthInsured: true,
          pensionEnrolled: true,
          pensionSelfRate: true,
          items: true,
          taxWithholdRate: true,
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
          insuredSalary: true,
          laborInsEmployee: true,
          healthInsEmployee: true,
          pensionSelfEmployee: true,
          laborInsEmployer: true,
          healthInsEmployer: true,
          pensionEmployer: true,
          occupationalEmployer: true,
          supplementaryEmployer: true,
          employerCostTotal: true,
          supplementaryEmployee: true,
          incomeTaxWithheld: true,
          taxableIncome: true,
          bonusAmount: true,
        },
      },
      // 當月一次性獎金 / 調整（三節 / 臨時 / 年終…）。
      payslipAdjustments: {
        where: { periodYear: year, periodMonth: month },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          label: true,
          kind: true,
          amount: true,
          taxable: true,
          countsToInsurance: true,
          recurring: true,
          note: true,
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
      hireDate: m.hireDate,
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
            insuredSalary: sp.insuredSalary,
            dependents: sp.dependents,
            laborInsured: sp.laborInsured,
            healthInsured: sp.healthInsured,
            pensionEnrolled: sp.pensionEnrolled,
            pensionSelfRate: sp.pensionSelfRate,
            items: sp.items,
            taxWithholdRate: sp.taxWithholdRate,
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
            insuredSalary: ps.insuredSalary,
            laborInsEmployee: Number(ps.laborInsEmployee),
            healthInsEmployee: Number(ps.healthInsEmployee),
            pensionSelfEmployee: Number(ps.pensionSelfEmployee),
            laborInsEmployer: Number(ps.laborInsEmployer),
            healthInsEmployer: Number(ps.healthInsEmployer),
            pensionEmployer: Number(ps.pensionEmployer),
            occupationalEmployer: Number(ps.occupationalEmployer),
            supplementaryEmployer: Number(ps.supplementaryEmployer),
            employerCostTotal: Number(ps.employerCostTotal),
            supplementaryEmployee: Number(ps.supplementaryEmployee),
            incomeTaxWithheld: Number(ps.incomeTaxWithheld),
            taxableIncome: Number(ps.taxableIncome),
            bonusAmount: Number(ps.bonusAmount),
          }
        : null,
      adjustments: m.payslipAdjustments.map((a) => ({
        id: a.id,
        label: a.label,
        kind: a.kind,
        amount: Number(a.amount),
        taxable: a.taxable,
        countsToInsurance: a.countsToInsurance,
        recurring: a.recurring,
        note: a.note,
      })),
    };
  });
}

/** 薪資科目目錄（依 sortOrder）。 */
export async function getSalaryItemDefs(orgId: string, activeOnly = false) {
  return db.salaryItemDef.findMany({
    where: { organizationId: orgId, ...(activeOnly ? { active: true } : {}) },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      kind: true,
      taxable: true,
      countsToInsurance: true,
      recurring: true,
      taxFreeLimit: true,
      active: true,
    },
  });
}

export type SalaryItemDefRow = Awaited<
  ReturnType<typeof getSalaryItemDefs>
>[number];

/**
 * 特休 / 假別額度總覽（每組織，指定年度）：
 *  - 特休：依到職日年資（§38）給應有天數，比對當年已休天數 → 剩餘 + 未休折算金額。
 *  - 其他有年度額度（annualQuotaDays）的假別：顯示額度 / 已用 / 剩餘。
 * 已休天數由出席月曆的請假紀錄（leave=true）依假別統計。
 */
export async function getLeaveQuotaOverview(orgId: string, year: number) {
  const start = new Date(Date.UTC(year, 0, 1));
  const end = new Date(Date.UTC(year + 1, 0, 1));
  const asOf = new Date();
  const [members, leaveTypes, records] = await Promise.all([
    db.organizationMember.findMany({
      where: { organizationId: orgId, active: true },
      orderBy: [{ isBoss: "desc" }, { user: { name: "asc" } }],
      select: {
        id: true,
        userId: true,
        hireDate: true,
        jobTitle: true,
        user: { select: userIdentitySelect },
        salaryProfile: { select: { payType: true, baseAmount: true } },
      },
    }),
    db.leaveType.findMany({
      where: { organizationId: orgId, active: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, annualQuotaDays: true, color: true },
    }),
    db.attendanceRecord.findMany({
      where: {
        organizationId: orgId,
        leave: true,
        date: { gte: start, lt: end },
      },
      select: { userId: true, leaveTypeId: true },
    }),
  ]);

  // used[userId][leaveTypeId] = 天數
  const used = new Map<string, Map<string, number>>();
  for (const r of records) {
    if (!r.leaveTypeId) continue;
    const m = used.get(r.userId) ?? new Map<string, number>();
    m.set(r.leaveTypeId, (m.get(r.leaveTypeId) ?? 0) + 1);
    used.set(r.userId, m);
  }

  const specialType = leaveTypes.find((t) => t.name === "特休");
  const quotaTypes = leaveTypes.filter(
    (t) => t.id !== specialType?.id && t.annualQuotaDays != null,
  );

  const rows = members.map((mem) => {
    const umap = used.get(mem.userId) ?? new Map<string, number>();
    const specialTotal = specialLeaveDays(mem.hireDate, asOf);
    const specialUsed = specialType ? (umap.get(specialType.id) ?? 0) : 0;
    const specialRemaining =
      specialTotal != null ? Math.max(0, specialTotal - specialUsed) : null;
    const monthlyBase =
      mem.salaryProfile?.payType === "MONTHLY"
        ? Number(mem.salaryProfile.baseAmount)
        : null;
    const dailyRate = monthlyBase ? Math.round((monthlyBase / 30) * 100) / 100 : null;
    const unpaidValue =
      specialRemaining != null && dailyRate
        ? Math.round(specialRemaining * dailyRate)
        : null;
    return {
      membershipId: mem.id,
      userId: mem.userId,
      name: mem.user.name,
      nickname: mem.user.nickname,
      useNickname: mem.user.useNickname,
      image: mem.user.image,
      jobTitle: mem.jobTitle,
      hireDate: mem.hireDate,
      specialTotal,
      specialUsed,
      specialRemaining,
      dailyRate,
      unpaidValue,
      otherLeaves: quotaTypes.map((t) => ({
        id: t.id,
        name: t.name,
        color: t.color,
        quota: t.annualQuotaDays as number,
        used: umap.get(t.id) ?? 0,
      })),
    };
  });

  return { rows, quotaTypes: quotaTypes.map((t) => ({ id: t.id, name: t.name })) };
}

export type LeaveQuotaOverview = Awaited<
  ReturnType<typeof getLeaveQuotaOverview>
>;
export type LeaveQuotaRow = LeaveQuotaOverview["rows"][number];

/**
 * 人事「當月概況」：一頁看到每位在職成員本月的出勤 / 缺勤 / 各假別請假天數 / 打卡完整度 / 特休剩餘。
 * 特休剩餘＝依到職日年資的法定特休 − 本年度已休特休。
 */
export async function getHrMonthlyOverview(
  orgId: string,
  year: number,
  month: number,
) {
  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const monthEnd = new Date(Date.UTC(year, month, 1));
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year + 1, 0, 1));
  const asOf = new Date();

  const [members, monthRecords, yearSpecial, monthCheckIns, specialType] =
    await Promise.all([
      db.organizationMember.findMany({
        where: { organizationId: orgId, active: true },
        orderBy: [{ isBoss: "desc" }, { user: { name: "asc" } }],
        select: {
          id: true,
          userId: true,
          jobTitle: true,
          hireDate: true,
          user: { select: userIdentitySelect },
        },
      }),
      db.attendanceRecord.findMany({
        where: { organizationId: orgId, date: { gte: monthStart, lt: monthEnd } },
        select: {
          userId: true,
          present: true,
          offsite: true,
          holiday: true,
          leave: true,
          cleared: true,
          leaveType: { select: { name: true } },
        },
      }),
      db.attendanceRecord.findMany({
        where: {
          organizationId: orgId,
          leave: true,
          date: { gte: yearStart, lt: yearEnd },
          leaveType: { name: "特休" },
        },
        select: { userId: true },
      }),
      db.checkIn.findMany({
        where: {
          organizationId: orgId,
          valid: true,
          date: { gte: monthStart, lt: monthEnd },
        },
        select: { userId: true, date: true, kind: true },
      }),
      db.leaveType.findFirst({
        where: { organizationId: orgId, name: "特休" },
        select: { id: true },
      }),
    ]);

  // 本月應上班日（平日，到「今天」或月底較早者為止）。
  const todayMs = Date.UTC(
    asOf.getUTCFullYear(),
    asOf.getUTCMonth(),
    asOf.getUTCDate(),
  );
  let expectedWorkdays = 0;
  for (let t = monthStart.getTime(); t < monthEnd.getTime(); t += 86_400_000) {
    if (t > todayMs) break;
    const wd = new Date(t).getUTCDay();
    if (wd !== 0 && wd !== 6) expectedWorkdays += 1;
  }

  // 年度特休已休（天）。
  const specialUsedByUser = new Map<string, number>();
  for (const r of yearSpecial) {
    specialUsedByUser.set(r.userId, (specialUsedByUser.get(r.userId) ?? 0) + 1);
  }

  // 本月打卡：每人 → 日期 → { in, out }。
  const punchByUser = new Map<string, Map<string, { in: boolean; out: boolean }>>();
  for (const c of monthCheckIns) {
    const ds = c.date.toISOString().slice(0, 10);
    const um = punchByUser.get(c.userId) ?? new Map();
    const slot = um.get(ds) ?? { in: false, out: false };
    if (c.kind === "in") slot.in = true;
    else if (c.kind === "out") slot.out = true;
    um.set(ds, slot);
    punchByUser.set(c.userId, um);
  }

  // 本月出勤彙總（每人）。
  type MonthAgg = {
    present: number;
    absent: number;
    leaveDays: number;
    offsite: number;
    leaveByType: Map<string, number>;
  };
  const aggByUser = new Map<string, MonthAgg>();
  const getAgg = (uid: string): MonthAgg => {
    let a = aggByUser.get(uid);
    if (!a) {
      a = { present: 0, absent: 0, leaveDays: 0, offsite: 0, leaveByType: new Map() };
      aggByUser.set(uid, a);
    }
    return a;
  };
  for (const r of monthRecords) {
    if (r.cleared) continue; // 人工清除＝未記錄，不列入出勤 / 缺勤統計
    if (r.holiday) continue;
    const a = getAgg(r.userId);
    if (r.leave) {
      a.leaveDays += 1;
      const name = r.leaveType?.name ?? "未指定";
      a.leaveByType.set(name, (a.leaveByType.get(name) ?? 0) + 1);
    } else if (r.present) {
      a.present += 1;
      if (r.offsite) a.offsite += 1;
    } else {
      a.absent += 1;
    }
  }

  const rows = members.map((m) => {
    const a = aggByUser.get(m.userId);
    const punches = punchByUser.get(m.userId);
    const clockInDays = punches
      ? [...punches.values()].filter((p) => p.in).length
      : 0;
    const completeDays = punches
      ? [...punches.values()].filter((p) => p.in && p.out).length
      : 0;
    const specialTotal = specialLeaveDays(m.hireDate, asOf);
    const specialUsed = specialType ? (specialUsedByUser.get(m.userId) ?? 0) : 0;
    const specialRemaining =
      specialTotal != null ? Math.max(0, specialTotal - specialUsed) : null;
    return {
      membershipId: m.id,
      userId: m.userId,
      name: m.user.name,
      nickname: m.user.nickname,
      useNickname: m.user.useNickname,
      email: m.user.email,
      image: m.user.image,
      jobTitle: m.jobTitle,
      present: a?.present ?? 0,
      absent: a?.absent ?? 0,
      leaveDays: a?.leaveDays ?? 0,
      offsite: a?.offsite ?? 0,
      leaveByType: a
        ? [...a.leaveByType.entries()].map(([name, days]) => ({ name, days }))
        : [],
      clockInDays,
      completeDays,
      specialTotal,
      specialRemaining,
    };
  });

  return { rows, expectedWorkdays };
}

export type HrMonthlyOverview = Awaited<ReturnType<typeof getHrMonthlyOverview>>;
export type HrMonthlyRow = HrMonthlyOverview["rows"][number];

/** 薪資 / 勞健保設定（每組織一份）；未設定回 null（＝尚未帶入法定預設）。 */
export async function getPayrollSetting(orgId: string) {
  return db.payrollSetting.findUnique({
    where: { organizationId: orgId },
  });
}

export type PayrollSettingRow = Awaited<
  ReturnType<typeof getPayrollSetting>
>;

/** 投保金額分級表（由低到高）。 */
export async function getInsuranceBrackets(orgId: string) {
  const rows = await db.insuranceBracket.findMany({
    where: { organizationId: orgId },
    orderBy: { sortOrder: "asc" },
    select: { amount: true },
  });
  return rows.map((r) => r.amount);
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
  reactions: {
    orderBy: { createdAt: "asc" as const },
    include: { user: { select: userIdentitySelect } },
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
      contact: { select: { id: true, name: true, company: true, email: true } },
      owner: { select: userIdentitySelect },
      _count: { select: { activities: true } },
    },
  });
}
export type CrmDealRow = Awaited<ReturnType<typeof getCrmDeals>>[number];

/**
 * 聯絡人清單：含負責人與商機數。刻意用明確 select（不用 include 撈全部欄位）——
 * CrmContact 有 businessCardImage 這種大 data URL 欄位，列表不需要它，撈了只是拖慢
 * 頁面；要看單一聯絡人的名片圖，改用 getContactCard 個別查。
 */
export async function getCrmContacts(orgId: string) {
  return db.crmContact.findMany({
    where: { organizationId: orgId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      company: true,
      title: true,
      email: true,
      phone: true,
      note: true,
      ownerId: true,
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
      contact: { select: { id: true, name: true, company: true, email: true } },
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

/**
 * 每組織自訂的 CRM 試算表分頁（含欄位定義＋每欄的所有格子值）。跟管線階段不同，
 * 這裡沒有預設種子——沒有任何自訂分頁是合理狀態（純看板／漏斗也能用），使用者從
 * CRM 頁自己按「新增清單」才會有第一筆。cellsByDeal 在查詢時就攤平成
 * `Map<dealId, Map<columnId, value>>`，元件端不用自己重新分組。
 */
export async function getCrmViews(orgId: string) {
  const views = await db.crmView.findMany({
    where: { organizationId: orgId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: {
      columns: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        include: { values: { select: { dealId: true, value: true } } },
      },
    },
  });
  return views.map((v) => ({
    id: v.id,
    name: v.name,
    columns: v.columns.map((c) => ({
      id: c.id,
      label: c.label,
      type: c.type,
      selectOptions: c.selectOptions,
      // 以下三個都僅 type=MAIL 使用，每個 MAIL 欄位（每一輪信）各自一套，不共用：
      header: c.header,
      template: c.template,
      footer: c.footer,
      // 攤平成純物件（不是 Map）——這份資料會經 RSC 邊界傳給 client 元件，Map 過不去。
      valueByDealId: Object.fromEntries(c.values.map((cell) => [cell.dealId, cell.value])),
    })),
  }));
}
export type CrmViewRow = Awaited<ReturnType<typeof getCrmViews>>[number];

/** 待跟進活動（type=task 且未完成），跨所有商機彙整（今日跟進總覽用）。無到期日的排最後。 */
export async function getCrmFollowUps(orgId: string) {
  return db.crmActivity.findMany({
    where: { type: "task", done: false, deal: { organizationId: orgId } },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
    include: {
      deal: {
        select: {
          id: true,
          title: true,
          contact: { select: { id: true, name: true, company: true, email: true } },
        },
      },
    },
  });
}
export type CrmFollowUpRow = Awaited<ReturnType<typeof getCrmFollowUps>>[number];

/**
 * 全部商機的「活動 / 跟進」紀錄（CrmActivity，不限類型、不限完成狀態），依時間新到舊排序，
 * 含負責人（是誰）。跟 getCrmFollowUps 的差異：那個只挑「未完成的待辦」給人去處理；這個是
 * 完整歷史紀錄，給「銷售管道發生過什麼事」這種總覽用途，見 CRM 頁的「跟進紀錄」分頁。
 * limit 防呆（紀錄會一直長，不用一次全撈）。
 */
export async function getCrmActivityLog(orgId: string, limit = 300) {
  const rows = await db.crmActivity.findMany({
    where: { deal: { organizationId: orgId } },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      type: true,
      body: true,
      dueDate: true,
      done: true,
      createdById: true,
      createdAt: true,
      deal: {
        select: {
          id: true,
          title: true,
          contact: { select: { id: true, name: true, company: true, email: true } },
        },
      },
    },
  });
  const authorIds = [
    ...new Set(rows.map((r) => r.createdById).filter((v): v is string => !!v)),
  ];
  const authors = authorIds.length
    ? await db.user.findMany({
        where: { id: { in: authorIds } },
        select: {
          id: true,
          name: true,
          nickname: true,
          useNickname: true,
          email: true,
          image: true,
        },
      })
    : [];
  const authorById = new Map(authors.map((u) => [u.id, u]));
  return rows.map((r) => ({
    ...r,
    author: r.createdById ? (authorById.get(r.createdById) ?? null) : null,
  }));
}
export type CrmActivityLogRow = Awaited<ReturnType<typeof getCrmActivityLog>>[number];

export type CompanyRow = {
  company: string;
  contactCount: number;
  decisionMakers: string[];
  openDealCount: number;
  openValue: number;
  wonDealCount: number;
  wonValue: number;
  noteCount: number;
  latestNote: string | null;
};

/**
 * 以「公司」為單位彙整（依 CrmContact.company 字串分組，同名視為同一企業，
 * 跟企業時間軸 / 進度備註同一套分組邏輯）：聯絡人數、決策者名單、進行中
 * / 已成交商機數與金額、備註則數與最新一則預覽。供依公司視角的總覽列表使用。
 */
export async function getCrmCompanies(orgId: string): Promise<CompanyRow[]> {
  const [contacts, profileCompanies] = await Promise.all([
    db.crmContact.findMany({
      where: { organizationId: orgId, NOT: { company: null } },
      select: { id: true, company: true, name: true, decisionRole: true },
    }),
    db.crmCompanyProfile.findMany({
      where: { organizationId: orgId },
      select: { company: true },
    }),
  ]);

  const byCompany = new Map<
    string,
    { contactIds: string[]; decisionMakers: string[] }
  >();
  for (const c of contacts) {
    const key = c.company?.trim();
    if (!key) continue;
    const g = byCompany.get(key) ?? { contactIds: [], decisionMakers: [] };
    g.contactIds.push(c.id);
    if (c.decisionRole === "決策者") g.decisionMakers.push(c.name);
    byCompany.set(key, g);
  }
  // 用「新增公司」手動建檔、還沒掛任何聯絡人的公司，也要出現在列表裡（不然剛建完
  // 馬上就找不到剛剛新增的那家公司）。
  for (const p of profileCompanies) {
    const key = p.company.trim();
    if (!key || byCompany.has(key)) continue;
    byCompany.set(key, { contactIds: [], decisionMakers: [] });
  }
  if (byCompany.size === 0) return [];

  const contactIdToCompany = new Map(
    contacts
      .filter((c) => c.company?.trim())
      .map((c) => [c.id, c.company!.trim()]),
  );
  const allContactIds = [...contactIdToCompany.keys()];

  const [deals, notes] = await Promise.all([
    db.crmDeal.findMany({
      where: { organizationId: orgId, contactId: { in: allContactIds } },
      select: { contactId: true, value: true, status: true },
    }),
    db.crmCompanyNote.findMany({
      where: { organizationId: orgId, company: { in: [...byCompany.keys()] } },
      orderBy: { createdAt: "desc" },
      select: { company: true, body: true },
    }),
  ]);
  const noteStatsByCompany = new Map<
    string,
    { count: number; latest: string | null }
  >();
  for (const n of notes) {
    const s = noteStatsByCompany.get(n.company) ?? { count: 0, latest: null };
    s.count += 1;
    if (s.latest === null) s.latest = n.body; // notes 已依 createdAt desc 排序，第一筆即最新
    noteStatsByCompany.set(n.company, s);
  }

  const dealAgg = new Map(
    [...byCompany.keys()].map((k) => [
      k,
      { openDealCount: 0, openValue: 0, wonDealCount: 0, wonValue: 0 },
    ]),
  );
  for (const d of deals) {
    const company = d.contactId ? contactIdToCompany.get(d.contactId) : undefined;
    if (!company) continue;
    const agg = dealAgg.get(company);
    if (!agg) continue;
    if (d.status === "OPEN") {
      agg.openDealCount += 1;
      agg.openValue += d.value;
    } else if (d.status === "WON") {
      agg.wonDealCount += 1;
      agg.wonValue += d.value;
    }
  }

  return [...byCompany.entries()]
    .map(([company, g]) => {
      const agg = dealAgg.get(company)!;
      const noteStats = noteStatsByCompany.get(company);
      return {
        company,
        contactCount: g.contactIds.length,
        decisionMakers: g.decisionMakers,
        openDealCount: agg.openDealCount,
        openValue: agg.openValue,
        wonDealCount: agg.wonDealCount,
        wonValue: agg.wonValue,
        noteCount: noteStats?.count ?? 0,
        latestNote: noteStats?.latest ?? null,
      };
    })
    .sort((a, b) => a.company.localeCompare(b.company, "ja"));
}

/** 「統計」分頁用：撈某組織下所有企業基本檔案的原始欄位，分組/分桶邏輯交給 crm-company-stats.ts。 */
export async function getCrmCompanyProfiles(orgId: string) {
  return db.crmCompanyProfile.findMany({
    where: { organizationId: orgId },
    select: {
      company: true,
      industry: true,
      headcount: true,
      capital: true,
      location: true,
      productCategory: true,
      hasEcommerce: true,
      ecommercePlatform: true,
      website: true,
      entryHook: true,
      grade: true,
      note: true,
    },
    orderBy: { company: "asc" },
  });
}
export type CrmCompanyProfileRow = Awaited<
  ReturnType<typeof getCrmCompanyProfiles>
>[number];
