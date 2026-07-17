/**
 * 「本週更新 / What's New」內容 —— 這是唯一需要手動維護的檔案。
 *
 * ┌──────────────────────────────────────────────────────────────┐
 * │  每週三發佈流程                                                │
 * │  1. 在 RELEASES 最前面(陣列第一個)新增一筆本週的 release。      │
 * │  2. date 用當週的週三、格式 "YYYY-MM-DD"(當作唯一鍵與排序)。   │
 * │  3. items 每項挑一個 tag：new(新功能) / improved(改善) /       │
 * │     fixed(修復)，title 一句話講「使用者能做什麼」，            │
 * │     detail 補一句細節(選填)，href 給功能的內部路徑(選填，      │
 * │     使用者點「前往」直接跳過去試)。                            │
 * │  4. 這週真的沒東西值得講就跳過 —— 不必硬湊一筆。               │
 * └──────────────────────────────────────────────────────────────┘
 *
 * 使用者「已看到哪些」存在瀏覽器 localStorage(見 WHATS_NEW_SEEN_KEY)，
 * 不進資料庫、沒有後台管理。使用者下次開網頁時，會自動彈出「距離上次
 * 以來新增的 release」。所以只要你把新的一筆加在最前面，隔天大家一登入
 * 就會看到。
 */

export type WhatsNewTag = "new" | "improved" | "fixed";

export type WhatsNewItem = {
  /** 分類標籤：new=新功能、improved=改善、fixed=修復。 */
  tag: WhatsNewTag;
  /** 一句話標題，寫「使用者能做什麼」而非「我們做了什麼」。 */
  title: string;
  /** 補充細節(選填)。 */
  detail?: string;
  /** 功能的內部路徑(選填)，例如 "/crm"；有填就顯示「前往 →」直接跳過去。 */
  href?: string;
};

export type WhatsNewRelease = {
  /** 發佈日(每週三)，格式 "YYYY-MM-DD"。同時是唯一鍵與排序依據。 */
  date: string;
  /** 這批更新的主題(選填)，例如「CRM 大改版」。 */
  title?: string;
  items: WhatsNewItem[];
};

/**
 * 更新紀錄 —— 最新的排最前面。
 *
 * 下面兩筆是範例(依最近實際做的功能填的)，之後每週三照樣往最前面加就好。
 */
export const RELEASES: WhatsNewRelease[] = [
  {
    date: "2026-07-17",
    title: "差勤集中成一頁、薪資科目、加班費分級、二代健保、特休年資",
    items: [
      {
        tag: "improved",
        title: "打卡、請假、出差集中到「打卡 / 請假 / 出差」頁",
        detail:
          "個人差勤不必再跳來跳去：上 / 下班打卡（原在「每日報告」）、我的出勤月曆與打卡紀錄、請假申請、出差 / 事件登記、忘記打卡的補打卡申請，全部集中在同一頁，可切換月份回看歷史。",
        href: "/checkin",
      },
      {
        tag: "improved",
        title: "「請假簽核」只留給要簽核的人",
        detail:
          "送出自己的請假已搬到「打卡 / 請假 / 出差」，所以「請假簽核」現在只會出現在簽核流程有排到你、或具請假管理權限的人的側欄，內容就是「待我簽核」。",
        href: "/leave",
      },
      {
        tag: "new",
        title: "出席狀況可查看每個人的打卡時間",
        detail:
          "具「查看他人打卡時間」權限者（如人資），可在出席狀況挑成員查看他每天實際的上 / 下班時間與在勤時數。",
        href: "/attendance",
      },
      {
        tag: "new",
        title: "薪資科目目錄",
        detail:
          "可自訂薪資科目（伙食津貼、全勤獎金、年終獎金…）並標記應稅 / 計入投保 / 經常性、免稅上限；各成員挑科目填金額，計算自動套用旗標。",
        href: "/payroll",
      },
      {
        tag: "improved",
        title: "加班費依勞基法§24 分級",
        detail:
          "平日前2小時×1.34、第3小時起×1.67；休息日、例假分級計價，倍率可在「勞健保設定」調整。",
        href: "/payroll",
      },
      {
        tag: "new",
        title: "二代健保與薪資所得扣繳",
        detail:
          "高額獎金（年度累計超過投保金額4倍）自動扣二代健保補充保費；可設每位員工的薪資所得扣繳率。",
        href: "/payroll",
      },
      {
        tag: "new",
        title: "特休年資自動計算與額度追蹤",
        detail:
          "依到職日自動算特休天數（勞基法§38），在「請假簽核 → 特休 / 額度」看每人應有 / 已休 / 剩餘與未休折算金額。",
        href: "/leave",
      },
    ],
  },
  {
    date: "2026-07-16",
    title: "請假簽核流程、勞健保薪資合規",
    items: [
      {
        tag: "new",
        title: "全新「請假簽核」頁面",
        detail:
          "員工線上申請請假，依公司設定的關卡逐關簽核；輪到你簽核時會收到通知，全部核准後自動登記到出席月曆。",
        href: "/leave",
      },
      {
        tag: "new",
        title: "可自訂簽核流程與順序",
        detail:
          "人資 / 管理者可在「請假簽核 → 簽核流程」設定由誰簽核、依什麼順序（直屬主管、指定成員），一關一關往下送。",
        href: "/leave",
      },
      {
        tag: "new",
        title: "薪資自動算勞健保、勞退",
        detail:
          "薪資頁新增「勞健保設定」，一鍵帶入 2026 法定費率與投保級距；產生薪資單就自動計算勞保 / 健保 / 勞退自付與公司負擔，薪資單分應發 / 應扣 / 實發 / 公司負擔四區。",
        href: "/payroll",
      },
      {
        tag: "new",
        title: "當月薪資總表 + 匯出清冊",
        detail:
          "薪資單頁列出每人代扣與公司負擔，並統計「當月公司總薪資成本」，可一鍵匯出 CSV 薪資清冊。",
        href: "/payroll",
      },
    ],
  },
  {
    date: "2026-07-15",
    title: "個人生產力、CRM、文件庫、每日報告",
    items: [
      {
        tag: "new",
        title: "全新「待辦 / 番茄鐘」頁面",
        detail:
          "每個人有自己的待辦清單，可關聯到專案任務、設定起訖日，還內建番茄鐘計時與紀錄。",
        href: "/todo",
      },
      {
        tag: "improved",
        title: "CRM 管線階段可自訂",
        detail:
          "每個組織可以自訂銷售管線的階段，拖放換階段時會記錄原因，並保留客戶的階段歷程。",
        href: "/crm",
      },
      {
        tag: "new",
        title: "公司文件庫",
        detail: "巢狀資料夾 + Markdown 文件，把公司內部知識集中管理。",
        href: "/training",
      },
      {
        tag: "new",
        title: "每日報告與打卡",
        detail: "填寫每日進度(附完成度)，主管可看下屬日報，支援 IP / GPS 打卡。",
        href: "/daily",
      },
      {
        tag: "improved",
        title: "每日報告可以按表情回應",
        detail:
          "主管可以對下屬的日報按 👍❤️🎉 等表情，對方也看得到並收到通知，回饋更快更輕鬆。",
        href: "/daily",
      },
      {
        tag: "improved",
        title: "專案就地管理",
        detail: "在專案清單直接展開卡片管理所有設定，不必再進獨立詳情頁。",
        href: "/projects",
      },
    ],
  }
];

// ── 標籤外觀 ──────────────────────────────────────────────────
export const TAG_META: Record<
  WhatsNewTag,
  { label: string; className: string }
> = {
  new: {
    label: "新功能",
    className:
      "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
  },
  improved: {
    label: "改善",
    className:
      "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-300",
  },
  fixed: {
    label: "修復",
    className:
      "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300",
  },
};

// ── 已讀狀態(localStorage) ───────────────────────────────────
/** localStorage 鍵：存使用者最後看過的 release date。 */
export const WHATS_NEW_SEEN_KEY = "pp:whats-new:last-seen";

/** 元件間溝通用的 window 事件名稱。 */
export const WHATS_NEW_OPEN_EVENT = "pp:whats-new:open"; // 要求打開視窗(側欄按鈕→視窗)
export const WHATS_NEW_SEEN_EVENT = "pp:whats-new:seen"; // 已讀狀態改變(視窗→側欄按鈕清紅點)

// ── 純函式 ───────────────────────────────────────────────────
/** 最新一筆 release 的日期(沒有 release 時為 null)。 */
export function latestReleaseDate(): string | null {
  return RELEASES.length > 0 ? RELEASES[0].date : null;
}

/**
 * 回傳「比 since 更新」的 release(newest first)。
 * since 為 null(從沒看過)時回傳空陣列 —— 首次造訪不倒整份歷史給對方，
 * 只把 lastSeen 初始化到最新，之後每週三的新 release 才會彈出。
 */
export function releasesSince(since: string | null): WhatsNewRelease[] {
  if (since === null) return [];
  return RELEASES.filter((r) => r.date > since);
}
