/**
 * 請假申請（LeaveRequest）與免簽核事件（MemberEvent，如出差 / 在家工作）本質上都是
 * 「這段時間某人不在辦公室、為什麼」的紀錄——只是請假多了簽核流程、假別與額度，
 * 事件是免簽核即時登記；兩者最終都靠 recomputeAttendance 落到同一份出席月曆。
 * 瀏覽時沒理由拆成兩個地方找，故合併成同一條時間軸顯示；底層資料表與登記 / 簽核流程
 * 仍分開（各自的權限與副作用差異太大，勉強合併資料表反而增加風險），見各自 schema 註解。
 */

type DatedRow = { startDate: Date | string; createdAt: Date | string };

/** 依開始日期新到舊排序；同一天再依建立時間新到舊排序，維持穩定順序。 */
export function compareTimelineDesc(a: DatedRow, b: DatedRow): number {
  const byStart = +new Date(b.startDate) - +new Date(a.startDate);
  if (byStart !== 0) return byStart;
  return +new Date(b.createdAt) - +new Date(a.createdAt);
}

export type TimelineEntry<L, E> =
  | { kind: "leave"; data: L }
  | { kind: "event"; data: E };

/** 合併請假申請與事件成單一時間軸（新到舊）。 */
export function mergeTimeline<L extends DatedRow, E extends DatedRow>(
  leaves: L[],
  events: E[],
): TimelineEntry<L, E>[] {
  const entries: TimelineEntry<L, E>[] = [
    ...leaves.map((data): TimelineEntry<L, E> => ({ kind: "leave", data })),
    ...events.map((data): TimelineEntry<L, E> => ({ kind: "event", data })),
  ];
  return entries.sort((a, b) => compareTimelineDesc(a.data, b.data));
}
