"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

/**
 * 「打卡 / 請假 / 出差」的分頁外殼。
 *
 * 個人差勤的所有自助動作集中在這一頁：今日打卡、我的出勤月曆 / 打卡紀錄、
 * 請假申請、出差 / 事件登記、補打卡申請——不必再跳到別頁。
 *
 * 刻意只收 ReactNode slot 而不收資料：各區塊都是既有元件，資料抓取留在 server page，
 * 這裡只負責分頁與未處理事項的紅點，避免把一整組型別再搬一份過來。
 */
export function CheckInWorkspace({
  today,
  attendance,
  leave,
  events,
  corrections,
  leaveBadge = 0,
  correctionBadge = 0,
}: {
  /** 今日打卡卡片（企業未啟用打卡時為提示文字）。一律置頂：這是每天最常按的動作。 */
  today: React.ReactNode;
  attendance: React.ReactNode;
  leave: React.ReactNode;
  events: React.ReactNode;
  corrections: React.ReactNode;
  /** 我送出、還在跑簽核的請假筆數。 */
  leaveBadge?: number;
  /** 待處理的補打卡（本人：審核中；管理者：待我審核）筆數。 */
  correctionBadge?: number;
}) {
  return (
    // 桌機：{today} 自然高度，Tabs 分掉剩餘空間；分頁內容各自在區塊內捲動，
    // 不必把整頁往下撐長（高度預算由 /checkin/page.tsx 的外層 calc 決定）。
    // 手機：外層沒有固定高度，這些 lg: 類別自然失效，維持一般文件捲動。
    <div className="flex flex-col gap-4 lg:h-full lg:min-h-0">
      {today}
      <Tabs defaultValue="attendance" className="gap-4 lg:min-h-0 lg:flex-1">
        <TabsList className="h-9 shrink-0">
          <TabsTrigger value="attendance" className="px-3">
            我的出勤
          </TabsTrigger>
          <TabsTrigger value="leave" className="px-3">
            請假
            <Badge n={leaveBadge} />
          </TabsTrigger>
          <TabsTrigger value="events" className="px-3">
            出差 / 事件
          </TabsTrigger>
          <TabsTrigger value="corrections" className="px-3">
            補打卡
            <Badge n={correctionBadge} />
          </TabsTrigger>
        </TabsList>

        <TabsContent
          value="attendance"
          className="space-y-3 lg:min-h-0 lg:overflow-y-auto"
        >
          {attendance}
        </TabsContent>
        <TabsContent
          value="leave"
          className="space-y-3 lg:min-h-0 lg:overflow-y-auto"
        >
          {leave}
        </TabsContent>
        <TabsContent
          value="events"
          className="space-y-3 lg:min-h-0 lg:overflow-y-auto"
        >
          {events}
        </TabsContent>
        <TabsContent
          value="corrections"
          className="space-y-3 lg:min-h-0 lg:overflow-y-auto"
        >
          {corrections}
        </TabsContent>
      </Tabs>
    </div>
  );
}

/** 分頁上的未處理筆數紅點（0 不顯示）。 */
function Badge({ n }: { n: number }) {
  if (n <= 0) return null;
  return (
    <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">
      {n}
    </span>
  );
}
