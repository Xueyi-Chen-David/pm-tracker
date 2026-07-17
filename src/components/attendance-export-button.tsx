"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import type { GridDay, GridMember } from "@/components/attendance-grid";
import { displayName } from "@/lib/display";
import { Button } from "@/components/ui/button";

const WEEKDAY_LABEL = ["日", "一", "二", "三", "四", "五", "六"];
const WEEKEND_BG = "#F1F5F9";

type Mark = GridMember["marks"][string];

/** 格子的簡寫（與月曆一致）：出／外／缺／休／假；未記錄為空白。 */
function shortMark(mark: Mark | undefined): string | undefined {
  if (!mark) return undefined;
  if (mark.holiday) return "休";
  if (mark.leave) return "假";
  if (mark.offsite) return "外";
  if (mark.present) return "出";
  return "缺";
}

/** 一位成員整月的統計（與頁面統計口徑一致：休假 / 請假不計缺席；出差算在外）。 */
function tally(m: GridMember, days: GridDay[]) {
  let present = 0;
  let offsite = 0;
  let absent = 0;
  let holiday = 0;
  let leave = 0;
  for (const d of days) {
    const mk = m.marks[d.dateStr];
    if (!mk) continue;
    if (mk.holiday) holiday += 1;
    else if (mk.leave) leave += 1;
    else if (mk.offsite) offsite += 1;
    else if (mk.present) present += 1;
    else absent += 1;
  }
  return { present, offsite, absent, holiday, leave };
}

/**
 * 把當月出席月曆下載成 Excel（.xlsx）。
 * 直接用頁面已算好的 members / days（含「未打卡」自動缺席），與畫面所見一致。
 * write-excel-file 以動態載入引入，只有真的按下載時才拉這包。
 */
export function AttendanceExportButton({
  members,
  days,
  month,
}: {
  members: GridMember[];
  days: GridDay[];
  /** yyyy-MM，用於檔名與標題。 */
  month: string;
}) {
  const [busy, setBusy] = useState(false);

  async function download() {
    if (members.length === 0) {
      toast.error("目前沒有可匯出的成員。");
      return;
    }
    setBusy(true);
    try {
      const { default: writeXlsxFile } = await import("write-excel-file/browser");

      const header = [
        { value: "成員", fontWeight: "bold" as const },
        ...days.map((d) => ({
          value: `${d.day}(${WEEKDAY_LABEL[d.weekday]})`,
          fontWeight: "bold" as const,
          align: "center" as const,
          backgroundColor: d.weekend ? WEEKEND_BG : undefined,
        })),
        ...["出席", "在外", "缺席", "休假", "請假"].map((t) => ({
          value: t,
          fontWeight: "bold" as const,
          align: "center" as const,
        })),
      ];

      const rows = members.map((m) => {
        const t = tally(m, days);
        return [
          { value: displayName(m), type: String },
          ...days.map((d) => ({
            value: shortMark(m.marks[d.dateStr]),
            type: String,
            align: "center" as const,
            backgroundColor: d.weekend ? WEEKEND_BG : undefined,
          })),
          { value: t.present, type: Number, align: "center" as const },
          { value: t.offsite, type: Number, align: "center" as const },
          { value: t.absent, type: Number, align: "center" as const },
          { value: t.holiday, type: Number, align: "center" as const },
          { value: t.leave, type: Number, align: "center" as const },
        ];
      });

      // 圖例列（空一行後說明簡寫），方便收到檔案的人看得懂。
      const legend = [
        [],
        [{ value: "圖例：出＝出席、外＝出差/在家工作、缺＝缺席、休＝休假/放假、假＝請假；空白＝未記錄", type: String }],
      ];

      const columns = [
        { width: 16 },
        ...days.map(() => ({ width: 5 })),
        ...Array.from({ length: 5 }, () => ({ width: 6 })),
      ];

      await writeXlsxFile([header, ...rows, ...legend], {
        sheet: `出席 ${month}`,
        columns,
        stickyRowsCount: 1,
        stickyColumnsCount: 1,
      }).toFile(`出席狀況-${month}.xlsx`);
      toast.success("已下載 Excel");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "匯出失敗");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={download}
      disabled={busy}
      className="gap-1.5"
    >
      <Download className="h-4 w-4" />
      {busy ? "匯出中…" : "下載 Excel"}
    </Button>
  );
}
