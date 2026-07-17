"use client";

import { useState } from "react";
import { ImageDown } from "lucide-react";
import { toast } from "sonner";
import { ATTENDANCE_GRID_TABLE_ID } from "@/components/attendance-grid";
import { Button } from "@/components/ui/button";

/** 符號說明區塊的 DOM id：截圖時整段複製進 PNG，確保顏色 / 說明與網頁一致。 */
export const ATTENDANCE_LEGEND_ID = "attendance-legend";

// 透明 1px：抓不到的圖片（例如跨網域的 Google 頭貼被 CORS 擋掉）以此代替，
// 讓截圖仍能完成，而不是整張失敗。
const TRANSPARENT_PX =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

/**
 * 把出席月曆截成 PNG 下載：標題（年月）＋ 月曆表 ＋ 符號說明。
 * 不含頁首 / 我的打卡紀錄。
 *
 * 截圖時另外組一張「離畫面的截圖版面」再拍：
 *  - 月曆外層是 overflow-x-auto，直接拍容器只會拍到看得見的半個月，故改複製 <table> 本身。
 *  - 順便把年月標題與符號說明一起放進去，圖片本身就看得懂。
 *  - 版面用 inline-block + 白底，寬度自動撐成整張表的寬度。
 *
 * 用 html-to-image 而非 html2canvas：本專案 Tailwind v4 主題色是 oklch()，
 * html2canvas 無法解析會直接拋錯；html-to-image 走 SVG foreignObject 交由瀏覽器繪製。
 */
export function AttendanceExportPngButton({ month }: { month: string }) {
  const [busy, setBusy] = useState(false);

  async function download() {
    const table = document.getElementById(ATTENDANCE_GRID_TABLE_ID);
    if (!table) {
      toast.error("找不到出席表，請重新整理後再試。");
      return;
    }
    setBusy(true);
    let sheet: HTMLDivElement | null = null;
    try {
      const { toPng } = await import("html-to-image");
      const [y, m] = month.split("-");

      sheet = document.createElement("div");
      // 拍完就移除；放在畫面外避免閃一下。白底固定用 #ffffff（與週報輸出 JPG 一致）。
      sheet.style.cssText =
        "position:fixed;left:-99999px;top:0;z-index:-1;display:inline-block;background:#ffffff;padding:20px;";

      const title = document.createElement("div");
      title.textContent = `出席狀況 · ${Number(y)} 年 ${Number(m)} 月`;
      title.style.cssText =
        "font-size:16px;font-weight:700;color:#0f172a;margin-bottom:12px;";
      sheet.appendChild(title);

      sheet.appendChild(table.cloneNode(true));

      // 符號說明：直接複製網頁上那份，顏色 / 文字保證一致。
      const legend = document.getElementById(ATTENDANCE_LEGEND_ID);
      if (legend) {
        const legendClone = legend.cloneNode(true) as HTMLElement;
        legendClone.style.marginTop = "14px";
        sheet.appendChild(legendClone);
      }

      document.body.appendChild(sheet);

      const dataUrl = await toPng(sheet, {
        pixelRatio: 2, // 2 倍解析度，貼到文件 / 簡報不會糊
        backgroundColor: "#ffffff",
        cacheBust: true,
        imagePlaceholder: TRANSPARENT_PX,
      });

      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `出席狀況-${month}.png`;
      a.click();
      toast.success("已下載 PNG");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "截圖失敗");
    } finally {
      sheet?.remove();
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
      <ImageDown className="h-4 w-4" />
      {busy ? "產生中…" : "下載 PNG"}
    </Button>
  );
}
