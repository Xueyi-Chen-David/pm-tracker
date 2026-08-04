"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Link2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * 複製分享連結（相對路徑，組成完整網址用目前瀏覽器的 origin）。連結本身沒有額外的
 * 分享權杖——能不能看，由目標頁面照登入身分 + 是否為該組織成員判斷（見 meetings/[id]）。
 */
export function CopyLinkButton({ path, label = "分享連結" }: { path: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      const url = `${window.location.origin}${path}`;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("已複製連結（需登入且為同組織成員才能開啟）");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("複製失敗，請手動複製網址列");
    }
  }

  return (
    <Button variant="ghost" size="icon-sm" title={label} onClick={copy}>
      {copied ? (
        <Check className="h-4 w-4 text-emerald-600" />
      ) : (
        <Link2 className="h-4 w-4" />
      )}
    </Button>
  );
}
