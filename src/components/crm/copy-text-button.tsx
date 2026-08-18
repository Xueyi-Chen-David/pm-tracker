"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 複製一段文字（Email、電話…）到剪貼簿的小按鈕，附短暫的「已複製」勾勾回饋。
 * 尺寸刻意比共用 Button 元件的 icon-xs 還小一號——給 contacts-list 這種 text-xs、
 * 圖示只有 h-3 w-3 的密集列表用，套用一般按鈕尺寸會顯得過大。
 */
export function CopyTextButton({
  text,
  label = "複製",
  className,
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("已複製");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("複製失敗，請手動選取複製");
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      title={label}
      className={cn(
        "text-muted-foreground hover:bg-muted hover:text-foreground shrink-0 rounded p-0.5",
        className,
      )}
    >
      {copied ? (
        <Check className="h-3 w-3 text-emerald-600" />
      ) : (
        <Copy className="h-3 w-3" />
      )}
    </button>
  );
}
