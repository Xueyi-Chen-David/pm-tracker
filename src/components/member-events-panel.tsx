import {
  MemberEventRow,
  type MemberEventRowData,
} from "@/components/leave/member-event-row";
import { DeleteEventButton } from "@/components/leave/delete-event-button";
import { QuickEventForm } from "@/components/leave/quick-event-form";
import { MEMBER_EVENT_TYPES } from "@/lib/constants";
import { fmtDate } from "@/lib/date";

/**
 * 「代他人登記出差 / 事件」用：某成員的事件清單 + 新增表單。
 * 自己的事件已併入「請假 / 出差」主時間軸（見 checkin/page.tsx），不會再用到本元件；
 * 這裡只服務「幫別人登記」的情境（見 leave/leave-events-section.tsx）。
 * 清單列與刪除鈕都與主時間軸共用同一套元件，兩邊視覺 / 行為一致。
 */
export function MemberEventsPanel({
  userId,
  events,
  types = MEMBER_EVENT_TYPES,
}: {
  userId: string;
  events: MemberEventRowData[];
  /** 可登記的事件類型建議清單（預設全部；「出差 / 事件」情境會排除請假）。 */
  types?: readonly string[];
}) {
  return (
    <div className="space-y-3">
      {events.length === 0 ? (
        <p className="text-muted-foreground py-2 text-sm">尚無事件紀錄</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {events.map((ev) => (
            <li key={ev.id}>
              <MemberEventRow
                ev={ev}
                footer={
                  <DeleteEventButton
                    id={ev.id}
                    userId={userId}
                    label={`${ev.type} ${fmtDate(ev.startDate)}`}
                  />
                }
              />
            </li>
          ))}
        </ul>
      )}
      <QuickEventForm userId={userId} types={types} />
    </div>
  );
}
