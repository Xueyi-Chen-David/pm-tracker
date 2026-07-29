"use client";

import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { ArrowDown, ArrowUp } from "lucide-react";
import { CrmEventDialog } from "@/components/crm/event-dialog";
import { CRM_EVENT_ICON } from "@/lib/crm";
import type { EventView, ContactLite } from "@/components/crm/types";

const CARD_WIDTH = 160; // w-40
const MIN_GAP = 110; // 相鄰時間點最小像素間距（避免卡片互相太擠）
const MAX_GAP = 240; // 單一間隔最多顯示這麼寬，超過就壓縮＋插入省略標記
const PX_PER_DAY = 7; // 比例尺：每天對應的像素寬度
// 每個項目用 translateX(-50%) 置中在自己的時間點上，代表第一 / 最後一項
// 會有半張卡片（CARD_WIDTH/2）超出 [0, totalWidth] 範圍——這段寬度必須留
// 在容器裡，否則會被 overflow-x-auto 直接切掉（捲不到那段，不是重疊，是
// 整塊被裁掉），所以邊界留白至少要比半張卡片寬，不能只是隨意的裝飾留白。
const SIDE_MARGIN = CARD_WIDTH / 2 + 16;
// 卡片交錯顯示的那一側高度預算；卡片（最多三行內容）＋箭頭要能完整放進去，
// 不能跟主軸／對向卡片擠在一起，否則會出現內容互相蓋住的問題。
const HALF_HEIGHT = 144; // = h-72(288px) 的一半

type Placed = {
  entry: EventView;
  x: number; // 相對於時間軸起點的像素位置
  gapDays: number | null; // 跟前一筆相差幾天；第一筆為 null
  gapWidth: number | null; // 這段間隔實際顯示的寬度（已套用 min/max）
  compressed: boolean; // 真實時間差被壓縮了（顯示省略標記）
};

/** 依實際日期算出每個項目的水平位置；間隔太近夾到最小值、太遠夾到最大值。 */
function layoutPositions(sorted: EventView[]): Placed[] {
  let x = 0;
  let prevDate: Date | null = null;
  return sorted.map((entry) => {
    const date = parseISO(entry.date);
    if (!prevDate) {
      prevDate = date;
      return { entry, x: 0, gapDays: null, gapWidth: null, compressed: false };
    }
    const days = Math.max(0, differenceInCalendarDays(date, prevDate));
    const proportional = days * PX_PER_DAY;
    const compressed = proportional > MAX_GAP;
    const gapWidth = Math.min(Math.max(proportional, MIN_GAP), MAX_GAP);
    x += gapWidth;
    prevDate = date;
    return { entry, x, gapDays: days, gapWidth, compressed };
  });
}

/** 間隔太大時的說明文字：45 天 / 3 個月 / 1 年，讓被壓縮掉的空白仍有感。 */
function humanGap(days: number): string {
  if (days >= 365) return `${Math.round(days / 365)} 年`;
  if (days >= 30) return `${Math.round(days / 30)} 個月`;
  return `${days} 天`;
}

/**
 * 活動的視覺化時間軸：一條橫向主軸，紀錄依實際日期比例排開（間隔太近/太遠
 * 都會夾到合理範圍，太遠的間隔改顯示「⋯ 45 天」省略標記，避免軸線被拉到
 * 沒法看，也不會讓密集的活動疊在一起）。卡片交錯顯示在主軸上／下方，各接
 * 一段箭頭連到軸上的點；沒放卡片的那一側改顯示日期，讓軸線本身就看得出
 * 每個點是哪一天，不必打開卡片才看得到。點卡片＝開啟既有的編輯視窗。
 */
export function EventsTimeline({
  events,
  contacts,
}: {
  events: EventView[];
  contacts: ContactLite[];
}) {
  const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date));

  if (sorted.length === 0) {
    return (
      <div className="text-muted-foreground rounded-xl border border-dashed py-16 text-center">
        還沒有任何活動紀錄。點右上「新增活動」開始記錄拜訪 / 電話 / 活動。
      </div>
    );
  }

  const placed = layoutPositions(sorted);
  const totalWidth = placed[placed.length - 1]!.x + SIDE_MARGIN * 2;

  return (
    <div className="bg-card overflow-x-auto rounded-xl border p-4">
      <div
        className="relative"
        style={{ width: totalWidth, height: HALF_HEIGHT * 2 + 12 }}
      >
        {/* 主軸：貫穿所有項目中點的橫線 */}
        <div
          className="bg-border pointer-events-none absolute top-1/2 h-px"
          style={{ left: SIDE_MARGIN, width: totalWidth - SIDE_MARGIN * 2 }}
        />
        {/* 間隔太大時蓋在軸線上的省略標記（底色蓋掉底下的線，視覺上「斷開」）。 */}
        {placed.map((p, i) =>
          p.compressed && p.gapWidth != null ? (
            <div
              key={`gap-${p.entry.id}`}
              className="bg-card text-muted-foreground pointer-events-none absolute top-1/2 -translate-x-1/2 -translate-y-1/2 px-1.5 text-[11px] whitespace-nowrap"
              style={{ left: SIDE_MARGIN + placed[i - 1]!.x + p.gapWidth / 2 }}
            >
              ⋯ {humanGap(p.gapDays!)}
            </div>
          ) : null,
        )}
        {placed.map((p, i) => {
          const above = i % 2 === 0;
          const e = p.entry;
          return (
            <div
              key={e.id}
              className="absolute top-0 h-full"
              style={{
                left: SIDE_MARGIN + p.x,
                width: CARD_WIDTH,
                transform: "translateX(-50%)",
              }}
            >
              <CrmEventDialog
                event={e}
                contacts={contacts}
                trigger={
                  <button
                    type="button"
                    className="group flex h-full w-full flex-col items-center text-left"
                  >
                    {/* 主軸上方：above 這一輪放卡片＋往下的箭頭，否則只放日期（貼著軸線）。 */}
                    <div
                      className="flex w-full flex-col items-center justify-end gap-1 pb-1.5"
                      style={{ height: HALF_HEIGHT }}
                    >
                      {above ? (
                        <>
                          <TimelineCard e={e} />
                          <ArrowDown className="text-muted-foreground/50 h-3 w-3 shrink-0" />
                        </>
                      ) : (
                        <DateLabel date={e.date} />
                      )}
                    </div>
                    {/* 軸上的點 */}
                    <span className="ring-background relative z-10 h-3 w-3 shrink-0 rounded-full bg-sky-500 ring-4" />
                    {/* 主軸下方：above 這一輪只放日期，否則放往上的箭頭＋卡片。 */}
                    <div
                      className="flex w-full flex-col items-center justify-start gap-1 pt-1.5"
                      style={{ height: HALF_HEIGHT }}
                    >
                      {above ? (
                        <DateLabel date={e.date} />
                      ) : (
                        <>
                          <ArrowUp className="text-muted-foreground/50 h-3 w-3 shrink-0" />
                          <TimelineCard e={e} />
                        </>
                      )}
                    </div>
                  </button>
                }
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** 貼著軸線顯示的日期（沒放卡片的那一側），讓軸線本身就看得出每個點是哪一天。 */
function DateLabel({ date }: { date: string }) {
  return (
    <span className="text-muted-foreground text-[11px] font-medium tabular-nums">
      {format(parseISO(date), "M/d")}
    </span>
  );
}

function TimelineCard({ e }: { e: EventView }) {
  return (
    <div className="bg-card group-hover:border-primary/50 w-40 rounded-lg border p-2 shadow-sm transition-colors">
      <div className="flex items-center gap-1">
        <span className="text-sm">{CRM_EVENT_ICON[e.type] ?? "📌"}</span>
        <span className="text-muted-foreground truncate text-[10px]">
          {e.type}
        </span>
      </div>
      <div className="mt-0.5 line-clamp-2 text-xs font-medium break-words">
        {e.title}
      </div>
      {e.contact && (
        <div className="text-muted-foreground mt-0.5 truncate text-[10px]">
          {e.contact.company || e.contact.name}
        </div>
      )}
    </div>
  );
}
