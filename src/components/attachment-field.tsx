"use client";

import { useRef, useState } from "react";
import { Paperclip, X, FileText } from "lucide-react";
import { toast } from "sonner";
import {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_MAX_BYTES,
} from "@/lib/attachment";
import { cn } from "@/lib/utils";

export type AttachmentValue = { dataUrl: string; name: string } | null;

/** 證明附件挑選器：選圖片 / PDF → 讀成 data URL（含容量檢查）。 */
export function AttachmentField({
  value,
  onChange,
  label = "證明附件（選填）",
}: {
  value: AttachmentValue;
  onChange: (v: AttachmentValue) => void;
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  function pick(file: File | undefined) {
    if (!file) return;
    if (file.size > ATTACHMENT_MAX_BYTES) {
      toast.error("附件太大，請壓縮到約 1MB 以內。");
      return;
    }
    setBusy(true);
    const reader = new FileReader();
    reader.onload = () => {
      setBusy(false);
      const dataUrl = String(reader.result ?? "");
      if (!dataUrl) {
        toast.error("讀取檔案失敗，請重試。");
        return;
      }
      onChange({ dataUrl, name: file.name });
    };
    reader.onerror = () => {
      setBusy(false);
      toast.error("讀取檔案失敗，請重試。");
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="space-y-1">
      <span className="text-sm font-medium">{label}</span>
      {value ? (
        <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
          <FileText className="text-muted-foreground h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{value.name}</span>
          <button
            type="button"
            onClick={() => {
              onChange(null);
              if (inputRef.current) inputRef.current.value = "";
            }}
            className="text-muted-foreground hover:text-foreground shrink-0"
            title="移除附件"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className={cn(
            "flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed px-3 py-2 text-sm",
            "text-muted-foreground hover:bg-muted/50 disabled:opacity-50",
          )}
        >
          <Paperclip className="h-4 w-4" />
          {busy ? "讀取中…" : "上傳證明（JPG / PNG / PDF，約 1MB 內）"}
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={ATTACHMENT_ACCEPT}
        className="hidden"
        onChange={(e) => pick(e.target.files?.[0])}
      />
    </div>
  );
}

/** 顯示端：開啟 / 下載證明附件。 */
export function AttachmentLink({
  attachment,
  name,
  className,
}: {
  attachment: string;
  name?: string | null;
  className?: string;
}) {
  return (
    <a
      href={attachment}
      target="_blank"
      rel="noopener noreferrer"
      download={name ?? "attachment"}
      className={cn(
        "text-primary inline-flex items-center gap-1 text-xs hover:underline",
        className,
      )}
    >
      <Paperclip className="h-3 w-3" /> 查看證明
    </a>
  );
}
