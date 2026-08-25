/**
 * CRM 共用型別（純型別，無執行期程式）。
 * 獨立於 pipeline-board 以避免「型別定義檔又 import 子元件、子元件又 import 型別」的循環依賴
 * （循環會讓某個元件在執行期解析成 undefined → React「Element type is invalid」）。
 */
import type { CrmDealStatus, CrmViewColumnType } from "@prisma/client";
import type { OwnerLite } from "@/components/okr/key-result-row";

export type ContactLite = {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
};

export type StageView = {
  id: string;
  key: string;
  label: string;
  note: string | null;
  color: string;
  defaultProbability: number | null;
};

export type DealView = {
  id: string;
  title: string;
  value: number;
  stage: string; // DealStage.key
  status: CrmDealStatus;
  contact: ContactLite | null;
  owner: OwnerLite | null;
  expectedCloseDate: string | null;
  probability: number | null; // 未填則沿用該階段的 defaultProbability
  closedReason: string | null;
  note: string | null;
  activityCount: number;
};

export type EventView = {
  id: string;
  date: string; // yyyy-mm-dd
  type: string;
  title: string;
  notes: string | null;
  link: string | null;
  contact: ContactLite | null;
};

export type FollowUpView = {
  id: string;
  body: string;
  dueDate: string | null; // yyyy-mm-dd
  deal: { id: string; title: string; contact: ContactLite | null };
};

/** 跟 FollowUpView 的差異：不限類型／不限完成狀態，是完整歷史（見 getCrmActivityLog）。 */
export type ActivityLogView = {
  id: string;
  type: string;
  body: string;
  dueDate: string | null; // yyyy-mm-dd
  done: boolean;
  createdAt: string; // ISO
  author: OwnerLite | null;
  deal: { id: string; title: string; contact: ContactLite | null };
};

// ── 自訂試算表分頁（CrmView）───────────────────
// 見 pipeline-board 頂部說明：跟 Pipeline／漏斗一樣，讀同一份組織商機清單，只是換一種
// 欄位配置去看；type=STAGE 的欄位沒有 valueByDealId 資料，直接讀寫 DealView.stage。

export type ViewColumn = {
  id: string;
  label: string;
  type: CrmViewColumnType;
  selectOptions: string[];
  // 以下三個都僅 type=MAIL 使用，每個 MAIL 欄位（每一輪信）各自一套、不共用，
  // 都可含 {{企業名}}：
  header: string | null; // 這一輪的開頭
  template: string | null; // 這一輪的預設中間範本——新格子第一次編輯時的起始內容
  footer: string | null; // 這一輪的結尾
  valueByDealId: Record<string, string | null>;
};

/** MAIL 欄位的格子值（JSON 存進 CrmViewCellValue.value）：寄送／已讀各自的狀態與
 *  日期，加上這家企業「這一輪」信件的件名／中間內容個人化版本（沒編輯過的話 body
 *  用欄位的 template 當預設稿顯示，不會寫進這裡；subject 沒有欄位層級的預設，
 *  每家企業各自存）。 */
export type MailCellValue = {
  sent: boolean;
  sentDate: string | null; // yyyy-mm-dd
  read: boolean;
  readDate: string | null; // yyyy-mm-dd
  subject: string;
  body: string;
};

export type CrmViewLite = {
  id: string;
  name: string;
  columns: ViewColumn[];
};
