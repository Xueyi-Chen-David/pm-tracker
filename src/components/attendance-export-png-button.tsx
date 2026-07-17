"use client";

import { useState } from "react";
import { ImageDown } from "lucide-react";
import { toast } from "sonner";
import { ATTENDANCE_GRID_TABLE_ID } from "@/components/attendance-grid";
import { Button } from "@/components/ui/button";

// 透明 1px：抓不到的圖片（例如跨網域的 Google 頭貼、CORS 擋掉）以此代替，
// 讓截圖仍能完成，而不是整張失敗。
const TRANSPARENT_PX =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

/**
 * 把出席月曆「那張表」截成 PNG 下載（外觀與網頁一致）。
 * 只抓 <table> 本身：不含頁首 / 圖例 / 我的打卡紀錄；且抓表格而非外層捲動容器，
 * 才不會被水平捲動裁掉右半個月。
 *
 * 用 html-to-image 而非 html2canvas：本專案 Tailwind v4 的主題色是 oklch()，
 * html2canvas 無法解析會直接拋錯；html-to-image 走 SVG foreignObject 交由瀏覽器繪製，
 * 現代 CSS（含 oklch）都能正確呈現。
 */
export function AttendanceExportPngButton({ month }: { month: string }) {
  const [busy, setBusy] = useState(false);

  async function download() {
    const node = document.getElementById(ATTENDANCE_GRID_TABLE_ID);
    if (!node) {
      toast.error("找不到出席表，請重新整理後再試。");
      return;
    }
    setBusy(true);
    try {
      const { toPng } = await import("html-to-image");
      // 表格本身沒有背景色，直接截會是透明底。用目前頁面的實際背景色補底，
      // 深色模式也能得到「跟網頁一樣」的結果（而不是深色文字配白底）。
      // 若解析不到 / 是透明色（背景設在 :root 之類），退回白底避免透明 PNG。
      const bodyBg = getComputedStyle(document.body).backgroundColor;
      const transparent =
        !bodyBg || bodyBg === "transparent" || /,\s*0\s*\)$/.test(bodyBg);
      const pageBg = transparent ? "#ffffff" : bodyBg;
      const dataUrl = await toPng(node, {
        // 2 倍解析度，貼到文件 / 簡報不會糊。
        pixelRatio: 2,
        backgroundColor: pageBg,
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
