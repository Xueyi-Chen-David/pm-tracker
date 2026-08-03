/**
 * CRM 共用型別（純型別，無執行期程式）。
 * 獨立於 pipeline-board 以避免「型別定義檔又 import 子元件、子元件又 import 型別」的循環依賴
 * （循環會讓某個元件在執行期解析成 undefined → React「Element type is invalid」）。
 */
import type { CrmDealStatus } from "@prisma/client";
import type { OwnerLite } from "@/components/okr/key-result-row";

export type ContactLite = { id: string; name: string; company: string | null };

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
