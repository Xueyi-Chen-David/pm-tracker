import type { ProjectStatus } from "@prisma/client";
import { db } from "./db";
import { thisWeekStart, weekStartOf } from "@/lib/date";

/**
 * 確保「全體」系統視窗 + 各狀態預設分頁存在。
 * 「全體」設為「排除未開始 / 暫停」——這兩種狀態的專案只在各自分頁顯示，不混進全體；
 *「完成」維持原樣（有專屬分頁，但仍會出現在全體）。
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

export async function ensureProjectViews() {
  const count = await db.projectView.count();
  if (count === 0) {
    await db.projectView.createMany({
      data: [
        // 全體＝排除未開始 / 暫停
        { name: "全體", isSystem: true, sortOrder: 0, statuses: EXCLUDED_FROM_ALL, exclude: true },
        { name: "未開始", statuses: ["NOT_STARTED"], sortOrder: 1 },
        { name: "暫停", statuses: ["ON_HOLD"], sortOrder: 2 },
        { name: "完成", statuses: ["COMPLETED"], sortOrder: 3 },
      ],
    });
    return;
  }

  // 1) 確保系統「全體」存在，且維持「排除未開始 / 暫停」（自動修正既有資料）
  const sys = await db.projectView.findFirst({ where: { isSystem: true } });
  if (!sys) {
    await db.projectView.create({
      data: { name: "全體", isSystem: true, sortOrder: -1, statuses: EXCLUDED_FROM_ALL, exclude: true },
    });
  } else if (!isAllConfigured(sys)) {
    await db.projectView.update({
      where: { id: sys.id },
      data: { statuses: EXCLUDED_FROM_ALL, types: [], exclude: true },
    });
  }

  // 2) 既有資料庫補建「未開始」分頁（用單一狀態比對避免重複建立）
  const nonSystem = await db.projectView.findMany({ where: { isSystem: false } });
  const hasNotStarted = nonSystem.some(
    (v) =>
      !v.exclude &&
      v.types.length === 0 &&
      v.statuses.length === 1 &&
      v.statuses[0] === "NOT_STARTED",
  );
  if (!hasNotStarted) {
    // 排在其他分頁之前（取最小 sortOrder 再 -1），不必動到既有列
    const minOrder = Math.min(1, ...nonSystem.map((v) => v.sortOrder));
    await db.projectView.create({
      data: { name: "未開始", statuses: ["NOT_STARTED"], sortOrder: minOrder - 1 },
    });
  }
}

export async function getProjectViews() {
  await ensureProjectViews();
  return db.projectView.findMany({
    orderBy: [{ isSystem: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
  });
}

export async function getAllUsers() {
  return db.user.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, nickname: true, useNickname: true, email: true, image: true, isBoss: true },
  });
}

/** 團隊頁：所有成員 + 負責/參與專案數、週報數。 */
export async function getWorkspaceMembers() {
  return db.user.findMany({
    orderBy: [{ isBoss: "desc" }, { active: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      nickname: true,
      useNickname: true,
      email: true,
      image: true,
      jobTitle: true,
      isBoss: true,
      active: true,
      attendance: true,
      _count: {
        select: { ownedProjects: true, memberships: true, weeklyUpdates: true },
      },
    },
  });
}

export type WorkspaceMember = Awaited<
  ReturnType<typeof getWorkspaceMembers>
>[number];

/**
 * 出席月曆：被追蹤（trackAttendance）的在職成員 + 指定月份 [start, end) 的每日出席紀錄。
 */
export async function getAttendanceMonth(start: Date, end: Date) {
  return db.user.findMany({
    where: { active: true, trackAttendance: true },
    orderBy: [{ isBoss: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      nickname: true,
      useNickname: true,
      email: true,
      image: true,
      isBoss: true,
      attendanceRecords: {
        where: { date: { gte: start, lt: end } },
        select: { date: true, present: true, reason: true },
      },
    },
  });
}

export type AttendanceMonthMember = Awaited<
  ReturnType<typeof getAttendanceMonth>
>[number];

/** 出席追蹤成員管理：所有在職成員 + 是否已納入追蹤。 */
export async function getTrackableMembers() {
  return db.user.findMany({
    where: { active: true },
    orderBy: [{ isBoss: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      nickname: true,
      useNickname: true,
      email: true,
      image: true,
      isBoss: true,
      trackAttendance: true,
    },
  });
}

/** 成員個人頁：profile + 負責/參與專案 + 近期週報活動。 */
export async function getMemberProfile(id: string) {
  return db.user.findUnique({
    where: { id },
    include: {
      ownedProjects: {
        where: { archived: false },
        orderBy: { updatedAt: "desc" },
        include: { weeklyUpdates: { orderBy: { weekStart: "desc" }, take: 1 } },
      },
      memberships: {
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
        orderBy: { weekStart: "desc" },
        take: 8,
        include: { project: { select: { id: true, name: true } } },
      },
      memberEvents: {
        orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
        take: 50,
      },
      weeklyTasks: {
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
}

export type MemberProfile = NonNullable<
  Awaited<ReturnType<typeof getMemberProfile>>
>;

const memberInclude = {
  include: { user: { select: { id: true, name: true, nickname: true, useNickname: true, email: true, image: true } } },
  orderBy: { role: "asc" as const },
};

/** 總覽 / 專案清單用：含負責人、成員、最新一筆週報、里程碑數。 */
export async function getProjectsOverview() {
  return db.project.findMany({
    where: { archived: false },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: {
      owner: { select: { id: true, name: true, nickname: true, useNickname: true, email: true, image: true } },
      members: memberInclude,
      milestones: { orderBy: [{ sortOrder: "asc" }, { plannedDate: "asc" }] },
      weeklyUpdates: { orderBy: { weekStart: "desc" }, take: 1 },
    },
  });
}

export type ProjectOverview = Awaited<
  ReturnType<typeof getProjectsOverview>
>[number];

/** 單一專案完整資料（含全部週報歷史、里程碑、成員）。 */
export async function getProject(id: string) {
  return db.project.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, name: true, nickname: true, useNickname: true, email: true, image: true } },
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

/** 某週所有專案的週報（用於總覽當週欄、週報頁）。 */
export async function getWeeklyUpdatesForWeek(weekStart: Date) {
  return db.weeklyUpdate.findMany({
    where: { weekStart },
    include: {
      author: { select: { id: true, name: true, nickname: true, useNickname: true } },
    },
  });
}

/** 總覽頁資料：所有專案 + 本週/上週週報對照。 */
export async function getDashboardData() {
  const week = thisWeekStart();
  const prevWeek = weekStartOf(new Date(week.getTime() - 3 * 24 * 3600 * 1000));
  const projects = await getProjectsOverview();
  return { week, prevWeek, projects };
}

/** 時程藍圖：所有未封存專案 + 里程碑。 */
export async function getTimelineData() {
  return db.project.findMany({
    where: { archived: false },
    orderBy: [{ sortOrder: "asc" }, { startDate: "asc" }],
    include: {
      owner: { select: { id: true, name: true, nickname: true, useNickname: true } },
      milestones: { orderBy: [{ plannedDate: "asc" }, { sortOrder: "asc" }] },
    },
  });
}

/** 週報頁：指定週的所有專案 + 該週週報。 */
export async function getReportData(weekStart: Date) {
  const projects = await db.project.findMany({
    where: { archived: false },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: {
      owner: { select: { id: true, name: true, nickname: true, useNickname: true, email: true } },
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

/** 某週的「整體說明」自由文字（可能不存在）。 */
export async function getWeeklyReport(weekStart: Date) {
  return db.weeklyReport.findUnique({ where: { weekStart } });
}

/** 所有會議（會議記錄頁用），最新在前。 */
export async function getMeetings(category?: string) {
  return db.meeting.findMany({
    where: category ? { category } : undefined,
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });
}

export type MeetingRow = Awaited<ReturnType<typeof getMeetings>>[number];

/** 落在指定週（週一起算 7 天）內的會議，依日期排序。 */
export async function getMeetingsForWeek(weekStart: Date) {
  const weekEnd = new Date(weekStart.getTime() + 6 * 24 * 3600 * 1000);
  return db.meeting.findMany({
    where: { date: { gte: weekStart, lte: weekEnd } },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
  });
}
