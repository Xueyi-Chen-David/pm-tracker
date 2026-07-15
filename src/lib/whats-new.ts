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
