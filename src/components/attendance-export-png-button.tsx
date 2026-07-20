"use client";

import { useState } from "react";
import { ImageDown, Loader2 } from "lucide-react";
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
 * html-to-image 在「內嵌資源載入失敗」時是用 img.onerror 的 Event 來 reject，
 * 不是 Error 物件——直接 e.message 會拿到 undefined，只能落到籠統的「截圖失敗」。
 * 這裡把各種形狀的錯誤都翻成看得懂的訊息，之後真的壞掉才查得出原因。
 */
function describeError(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === "string" && e) return e;
  if (e && typeof e === "object" && "type" in e) {
    const ev = e as Event;
    const target = ev.target as (HTMLImageElement & { src?: string }) | null;
    const src = target?.src ? `：${target.src.slice(0, 60)}…` : "";
    return `內嵌資源載入失敗（${ev.type}）${src}`;
  }
  return "未知錯誤";
}

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
    let holder: HTMLDivElement | null = null;
    try {
      const { toPng } = await import("html-to-image");
      const [y, m] = month.split("-");

      // 重要：定位樣式只能放在「外層容器」，不能放在要被截圖的節點上。
      // html-to-image 會把被截節點的樣式一起複製進 SVG，若它帶著
      // position:fixed;left:-99999px，內容就會被推出畫布 → 拍出來整張全白。
      holder = document.createElement("div");
      holder.style.cssText =
        "position:fixed;left:-99999px;top:0;z-index:-1;pointer-events:none;";

      const sheet = document.createElement("div");
      // 被截的節點：只有外觀，沒有任何定位。白底與週報輸出 JPG 一致。
      sheet.style.cssText =
        "display:inline-block;background:#ffffff;padding:20px;";

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

      holder.appendChild(sheet);
      document.body.appendChild(holder);

      // skipFonts：不去抓 / 內嵌網頁字型。這是 html-to-image 最常見的失敗來源
      // （要逐一 fetch @font-face 的字型檔並轉 base64，任何一個失敗就整張拋錯）。
      // 關掉後改用系統字型堆疊繪製，中文照常顯示，可靠度高很多。
      const opts = {
        pixelRatio: 2, // 2 倍解析度，貼到文件 / 簡報不會糊
        backgroundColor: "#ffffff",
        cacheBust: true,
        skipFonts: true,
        imagePlaceholder: TRANSPARENT_PX,
      };
      let dataUrl: string;
      try {
        dataUrl = await toPng(sheet, opts);
      } catch (first) {
        // 還是失敗 → 最後一搏：連圖片（頭貼）都不放，只求把表格內容截出來。
        console.warn("[出席截圖] 第一次失敗，改用不含圖片重試：", first);
        dataUrl = await toPng(sheet, {
          ...opts,
          filter: (node) => (node as HTMLElement).tagName !== "IMG",
        });
      }

      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `出席狀況-${month}.png`;
      a.click();
      toast.success("已下載 PNG");
    } catch (e) {
      console.error("[出席截圖] 失敗：", e);
      toast.error(`截圖失敗：${describeError(e)}`);
    } finally {
      holder?.remove();
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
      title="下載 PNG"
    >
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <ImageDown className="h-4 w-4" />
      )}
      <span className="hidden sm:inline">{busy ? "產生中…" : "下載 PNG"}</span>
    </Button>
  );
}
