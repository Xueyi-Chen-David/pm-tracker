import "dotenv/config";
import { PrismaClient, type Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL ?? "";
const needsSsl = /sslmode=require|neon\.tech|supabase\.|render\.com|amazonaws\.com/i.test(
  connectionString,
);
const adapter = new PrismaPg({
  connectionString,
  ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
});
const db = new PrismaClient({ adapter });

// 該週週一（UTC 午夜），對齊 app 的 weekStartOf()
const W = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const D = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

type Health = "GREEN" | "YELLOW" | "RED";

async function main() {
  const force = process.argv.includes("--force");
  const existing = await db.project.count();
  if (existing > 0 && !force) {
    console.log(
      `已有 ${existing} 個專案，略過種子。要重置請執行： bun run db:seed --force`,
    );
    return;
  }
  if (force) {
    await db.project.deleteMany({});
    console.log("已清除既有專案，重新植入。");
  }

  // ── 預設組織（所有 seed 資料歸屬於此） ──────────
  const org = await db.organization.upsert({
    where: { id: "org_default" },
    update: {},
    create: { id: "org_default", name: "我的組織" },
  });

  // ── 團隊成員（身分在 User，組織內欄位在 OrganizationMember） ──
  const david = await db.user.upsert({
    where: { email: "dev@korvva.com" },
    update: { name: "David" },
    create: { email: "dev@korvva.com", name: "David" },
  });
  const aki = await db.user.upsert({
    where: { email: "aki@korvva.com" },
    update: { name: "Aki" },
    create: { email: "aki@korvva.com", name: "Aki" },
  });
  const eng = await db.user.upsert({
    where: { email: "eng@korvva.com" },
    update: { name: "Kenji" },
    create: { email: "eng@korvva.com", name: "Kenji" },
  });

  const seedMembers = [
    { u: david, role: "OWNER" as const, jobTitle: "負責人 / 老闆", isBoss: true },
    { u: aki, role: "MEMBER" as const, jobTitle: "業務", isBoss: false },
    { u: eng, role: "MEMBER" as const, jobTitle: "工程", isBoss: false },
  ];
  for (const m of seedMembers) {
    await db.organizationMember.upsert({
      where: {
        organizationId_userId: { organizationId: org.id, userId: m.u.id },
      },
      update: { role: m.role, jobTitle: m.jobTitle, isBoss: m.isBoss },
      create: {
        organizationId: org.id,
        userId: m.u.id,
        email: m.u.email ?? "",
        role: m.role,
        jobTitle: m.jobTitle,
        isBoss: m.isBoss,
      },
    });
  }

  type Seed = {
    name: string;
    type: "ROUTINE" | "PROJECT" | "ONE_TIME";
    status?: "NOT_STARTED" | "ACTIVE" | "ON_HOLD" | "COMPLETED";
    priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
    color: string;
    desc?: string;
    start?: string;
    target?: string;
    owner: string; // userId
    members: { id: string; role: "OWNER" | "MEMBER" | "VIEWER"; label?: string }[];
    milestones?: {
      title: string;
      planned?: string;
      actual?: string;
      status?: "PLANNED" | "IN_PROGRESS" | "DONE" | "MISSED";
      isGoal?: boolean;
    }[];
    weeklies?: {
      week: string;
      progress: number;
      health: Health;
      goals?: string;
      done?: string;
      next?: string;
      risks?: string;
      decision?: string;
    }[];
  };

  const projects: Seed[] = [
    {
      name: "Level 1 開發、維護、測試",
      type: "ROUTINE",
      priority: "HIGH",
      color: "#2563eb",
      desc: "Level 1 產品的持續開發、維護與測試，常態進行。",
      start: "2026-01-05",
      owner: eng.id,
      members: [
        { id: eng.id, role: "OWNER", label: "工程" },
        { id: david.id, role: "MEMBER" },
      ],
      weeklies: [
        { week: "2026-06-08", progress: 70, health: "GREEN", done: "登入流程修正", next: "測試環境穩定化" },
        { week: "2026-06-15", progress: 78, health: "YELLOW", done: "Level 1 第二版開發", risks: "測試環境出現錯誤，影響顧問審查流程", next: "優先排除測試環境問題" },
        { week: "2026-06-22", progress: 82, health: "GREEN", goals: "產品上線後測試", done: "排除測試環境登入錯誤", next: "持續監控、每日追蹤" },
      ],
    },
    {
      name: "AI document validation module 開發、優化、測試",
      type: "PROJECT",
      priority: "HIGH",
      color: "#0891b2",
      desc: "文件驗證模組的開發、優化與測試。",
      start: "2026-03-01",
      target: "2026-08-31",
      owner: eng.id,
      members: [
        { id: eng.id, role: "OWNER", label: "工程" },
        { id: david.id, role: "MEMBER" },
      ],
      milestones: [
        { title: "POC 完成", planned: "2026-04-30", actual: "2026-05-06", status: "DONE" },
        { title: "準確率優化至 95%", planned: "2026-07-31", status: "IN_PROGRESS", isGoal: true },
      ],
      weeklies: [
        { week: "2026-06-15", progress: 55, health: "GREEN", done: "驗證流程串接", next: "優化準確率" },
        { week: "2026-06-22", progress: 60, health: "GREEN", goals: "優化辨識準確率", done: "資料集擴充", next: "準確率測試" },
      ],
    },
    {
      name: "補助金事業者申請",
      type: "PROJECT",
      priority: "URGENT",
      color: "#d97706",
      desc: "申請成為 IT 補助金事業者，啟動商業化。",
      start: "2026-05-01",
      target: "2026-06-30",
      owner: david.id,
      members: [
        { id: david.id, role: "OWNER", label: "PM" },
        { id: aki.id, role: "MEMBER" },
      ],
      milestones: [
        { title: "申請資料提交顧問", planned: "2026-06-19", actual: "2026-06-19", status: "DONE" },
        { title: "成為 IT 事業者", planned: "2026-06-30", status: "IN_PROGRESS", isGoal: true },
      ],
      weeklies: [
        { week: "2026-06-15", progress: 60, health: "YELLOW", done: "補助金申請資料已提交顧問", risks: "申請文件需補件（法人稅務證明書）", next: "本週完成補件" },
        {
          week: "2026-06-22",
          progress: 75,
          health: "YELLOW",
          goals: "提交補助金申請、完成補件",
          done: "已同步會計團隊準備文件",
          next: "完成 IT 事業者申請（6 月底前）",
          risks: "申請文件需補件，恐影響審查時程",
          decision: "是否追加預算加速顧問審查？需老闆拍板。",
        },
      ],
    },
    {
      name: "YMCA 第一階段合作與導入",
      type: "PROJECT",
      priority: "HIGH",
      color: "#7c3aed",
      desc: "與 YMCA 的第一階段合作、簽約與系統導入，預計 8 月開始收款。",
      start: "2026-05-14",
      target: "2026-08-31",
      owner: aki.id,
      members: [
        { id: aki.id, role: "OWNER", label: "業務" },
        { id: david.id, role: "MEMBER" },
        { id: eng.id, role: "MEMBER", label: "工程" },
      ],
      milestones: [
        { title: "YMCA 簽訂 MOU", planned: "2026-05-14", actual: "2026-05-14", status: "DONE" },
        { title: "Level 1 Version 1", planned: "2026-06-05", actual: "2026-06-05", status: "DONE" },
        { title: "Level 1 Version 2", planned: "2026-06-19", actual: "2026-06-19", status: "DONE" },
        { title: "簽約（收訂金開發）", planned: "2026-07-15", status: "PLANNED" },
        { title: "交付（收尾款、月費）", planned: "2026-08-31", status: "PLANNED", isGoal: true },
      ],
      weeklies: [
        { week: "2026-06-15", progress: 45, health: "GREEN", done: "Level 1 第二版完成", next: "與 YMCA 確認規格" },
        {
          week: "2026-06-22",
          progress: 50,
          health: "YELLOW",
          goals: "與 YMCA 社長約定線上會議時間",
          done: "YMCA 社長已同意安排線上會議",
          next: "確認會議時間、進行規格確認",
          risks: "會議時間仍在協調中，可能延遲規格確認",
        },
      ],
    },
    {
      name: "Level 1 與 POC 合約",
      type: "PROJECT",
      priority: "MEDIUM",
      color: "#059669",
      desc: "Level 1 與 POC 的合約洽談與簽訂。",
      start: "2026-06-01",
      target: "2026-07-31",
      owner: david.id,
      members: [{ id: david.id, role: "OWNER" }, { id: aki.id, role: "MEMBER" }],
      weeklies: [
        { week: "2026-06-22", progress: 30, health: "GREEN", done: "合約草稿擬定", next: "法務確認條款" },
      ],
    },
    {
      name: "井上導入",
      type: "PROJECT",
      priority: "MEDIUM",
      color: "#db2777",
      desc: "井上客戶的系統導入。",
      start: "2026-06-01",
      target: "2026-09-30",
      owner: aki.id,
      members: [{ id: aki.id, role: "OWNER", label: "業務" }, { id: eng.id, role: "MEMBER" }],
      weeklies: [
        { week: "2026-06-22", progress: 20, health: "GREEN", done: "需求訪談", next: "環境建置" },
      ],
    },
    {
      name: "潛在客戶獲取（久住、sonomono、oitamade）",
      type: "PROJECT",
      priority: "MEDIUM",
      color: "#475569",
      desc: "久住、sonomono、oitamade 等潛在客戶的洽談與名單蒐集。",
      start: "2026-06-01",
      target: "2026-11-30",
      owner: aki.id,
      members: [{ id: aki.id, role: "OWNER", label: "業務" }],
      milestones: [
        { title: "2026 目標 10 家 SME", planned: "2026-11-30", status: "PLANNED", isGoal: true },
      ],
      weeklies: [
        { week: "2026-06-22", progress: 15, health: "YELLOW", done: "初步接觸久住", next: "安排 sonomono 會議", risks: "名單蒐集進度偏慢" },
      ],
    },
    {
      name: "大稻埕 Level 1 計畫",
      type: "PROJECT",
      priority: "MEDIUM",
      color: "#ea580c",
      desc: "大稻埕場域的 Level 1 導入計畫。",
      start: "2026-06-15",
      target: "2026-10-31",
      owner: david.id,
      members: [{ id: david.id, role: "OWNER" }, { id: aki.id, role: "MEMBER" }],
      weeklies: [
        { week: "2026-06-22", progress: 10, health: "GREEN", done: "場域評估", next: "提案撰寫" },
      ],
    },
    {
      name: "影片腳本與生成設計",
      type: "ONE_TIME",
      priority: "LOW",
      color: "#0d9488",
      desc: "宣傳影片的腳本撰寫與 AI 生成設計。",
      start: "2026-06-10",
      target: "2026-07-15",
      owner: david.id,
      members: [{ id: david.id, role: "OWNER" }],
      weeklies: [
        { week: "2026-06-22", progress: 40, health: "GREEN", done: "腳本初稿", next: "生成樣片" },
      ],
    },
    {
      name: "做一個 專案管理個人應用",
      type: "PROJECT",
      priority: "MEDIUM",
      color: "#6366f1",
      desc: "就是這個 Project Pulse — 追蹤所有專案、常態與一次性任務的進度與週報。",
      start: "2026-06-20",
      target: "2026-07-10",
      owner: david.id,
      members: [{ id: david.id, role: "OWNER" }, { id: eng.id, role: "MEMBER" }],
      milestones: [
        { title: "MVP 上線", planned: "2026-07-10", status: "IN_PROGRESS", isGoal: true },
      ],
      weeklies: [
        { week: "2026-06-22", progress: 65, health: "GREEN", goals: "完成核心功能", done: "專案/週報/時程/週報匯出", next: "細節打磨與部署" },
      ],
    },
    {
      name: "讀書會",
      type: "ROUTINE",
      priority: "LOW",
      color: "#16a34a",
      desc: "團隊每週讀書會，持續進行。",
      start: "2026-01-01",
      owner: david.id,
      members: [
        { id: david.id, role: "OWNER" },
        { id: aki.id, role: "MEMBER" },
        { id: eng.id, role: "MEMBER" },
      ],
      weeklies: [
        { week: "2026-06-22", progress: 50, health: "GREEN", done: "本週主題：系統設計", next: "下週主題：資料庫索引" },
      ],
    },
  ];

  let order = 0;
  for (const s of projects) {
    const latest = s.weeklies?.[s.weeklies.length - 1];
    const data: Prisma.ProjectCreateInput = {
      organization: { connect: { id: org.id } },
      name: s.name,
      type: s.type,
      status: s.status ?? "ACTIVE",
      priority: s.priority ?? "MEDIUM",
      health: latest?.health ?? "GREEN",
      progress: latest?.progress ?? 0,
      description: s.desc,
      color: s.color,
      sortOrder: order++,
      startDate: s.start ? D(s.start) : null,
      targetDate: s.target ? D(s.target) : null,
      owner: { connect: { id: s.owner } },
      createdBy: { connect: { id: david.id } },
      milestones: s.milestones
        ? {
            create: s.milestones.map((m, i) => ({
              title: m.title,
              plannedDate: m.planned ? D(m.planned) : null,
              actualDate: m.actual ? D(m.actual) : null,
              status: m.status ?? "PLANNED",
              isGoal: m.isGoal ?? false,
              sortOrder: i,
            })),
          }
        : undefined,
      weeklyUpdates: s.weeklies
        ? {
            create: s.weeklies.map((w) => ({
              weekStart: W(w.week),
              progress: w.progress,
              health: w.health,
              thisWeekGoals: w.goals ?? null,
              thisWeekDone: w.done ?? null,
              nextWeekGoals: w.next ?? null,
              risks: w.risks ?? null,
              needsDecision: w.decision ?? null,
              author: { connect: { id: s.owner } },
            })),
          }
        : undefined,
    };
    await db.project.create({ data });
  }

  console.log(`✅ 已植入 ${projects.length} 個專案，使用者 ${[david, aki, eng].length} 位。`);
  console.log(`   用 dev 登入 dev@korvva.com 即可看到全部資料。`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
