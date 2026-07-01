"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, ImageDown, Printer, RotateCcw } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ReportToolbar({
  prevWeek,
  nextWeek,
  thisWeek,
  isCurrent,
  pdfName,
}: {
  prevWeek: string;
  nextWeek: string;
  thisWeek: string;
  isCurrent: boolean;
  /** 存成 PDF 時的預設檔名（瀏覽器以 document.title 命名）。 */
  pdfName: string;
}) {
  const [exporting, setExporting] = useState(false);

  // 列印前把分頁標題暫時換成日期檔名，列印結束後還原
  function handlePrint() {
    const original = document.title;
    document.title = pdfName;
    const restore = () => {
      document.title = original;
      window.removeEventListener("afterprint", restore);
    };
    window.addEventListener("afterprint", restore);
    window.print();
  }

  // 把週報內容直接輸出成 JPG 下載
  async function handleExportJpg() {
    const node = document.getElementById("report-capture");
    if (!node) return;
    setExporting(true);
    try {
      const { toJpeg } = await import("html-to-image");
      const dataUrl = await toJpeg(node, {
        quality: 0.95,
        backgroundColor: "#ffffff",
        pixelRatio: 2, // 2 倍解析度，較清晰
        cacheBust: true,
      });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `${pdfName}.jpg`;
      a.click();
      toast.success("已輸出 JPG");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "輸出失敗");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-1.5">
        <Link
          href={`/report?week=${prevWeek}`}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          <ChevronLeft className="h-4 w-4" /> 上一週
        </Link>
        <Link
          href={`/report?week=${nextWeek}`}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          下一週 <ChevronRight className="h-4 w-4" />
        </Link>
        {!isCurrent && (
          <Link
            href={`/report?week=${thisWeek}`}
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
          >
            <RotateCcw className="h-4 w-4" /> 回到本週
          </Link>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          onClick={handleExportJpg}
          disabled={exporting}
        >
          <ImageDown className="h-4 w-4" /> {exporting ? "輸出中…" : "輸出 JPG"}
        </Button>
        <Button onClick={handlePrint}>
          <Printer className="h-4 w-4" /> 列印 / 存成 PDF
        </Button>
      </div>
    </div>
  );
}
