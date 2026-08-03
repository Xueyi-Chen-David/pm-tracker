"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, Trash2, Sparkles, Loader2, Maximize2 } from "lucide-react";
import { extractContactCardFields } from "@/server/actions/crm";
import type { BusinessCardFields } from "@/server/gemini";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";

/** 讀檔 → 等比縮到最長邊 <= maxDim → 輸出 JPEG data URL（不裁切，保留名片原始比例）。 */
async function fileToCardDataUrl(file: File, maxDim = 1400): Promise<string> {
  const src = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error("讀取檔案失敗"));
    r.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("圖片載入失敗"));
    i.src = src;
  });
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("無法處理圖片");
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", 0.85);
}

/**
 * 名片上傳器：拍照 / 選圖 → 前端壓縮成 data URL（不會立刻存檔，交給父層表單
 * 一起送出，跟其他欄位同一次儲存）。有設定 GOOGLE_API_KEY 時，上傳後自動打
 * Gemini 辨識，把姓名 / 公司 / 職稱 / Email / 電話回填給父層（只填空欄位，
 * 不覆蓋使用者已輸入的內容）。未設定 API key 時這塊 UI 直接不出現。
 */
export function BusinessCardUploader({
  image,
  onImageChange,
  aiEnabled,
  onExtracted,
}: {
  image: string | null;
  onImageChange: (dataUrl: string | null) => void;
  aiEnabled: boolean;
  onExtracted?: (fields: BusinessCardFields) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [zoomOpen, setZoomOpen] = useState(false);

  async function runOcr(dataUrl: string) {
    if (!aiEnabled) return;
    setBusy(true);
    try {
      const res = await extractContactCardFields(dataUrl);
      if (!res.ok) {
        toast.warning(`名片已上傳，但自動辨識失敗：${res.error}`);
        return;
      }
      const hasAny = Object.values(res.fields).some(Boolean);
      if (hasAny) {
        onExtracted?.(res.fields);
        toast.success("已自動填入名片辨識到的欄位，請確認後再送出");
      } else {
        toast.info("名片已上傳，但沒辨識到可用欄位，請手動輸入");
      }
    } catch (err) {
      toast.warning(
        `名片已上傳，但自動辨識失敗：${err instanceof Error ? err.message : "未知錯誤"}`,
      );
    } finally {
      setBusy(false);
    }
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("請選擇圖片檔");
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      toast.error("圖片檔太大（上限 15MB）");
      return;
    }
    try {
      const dataUrl = await fileToCardDataUrl(file);
      onImageChange(dataUrl);
      await runOcr(dataUrl);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "上傳失敗");
    }
  }

  return (
    <div className="space-y-1.5">
      <div
        className={cn(
          "group bg-muted/30 relative flex h-72 w-full items-center justify-center overflow-hidden rounded-md border",
          !image && "border-dashed",
        )}
      >
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="absolute inset-0 flex items-center justify-center outline-none disabled:opacity-60"
          title="點擊上傳 / 更換名片照片"
        >
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt="名片" className="h-full w-full object-contain" />
          ) : (
            <span className="text-muted-foreground flex flex-col items-center gap-1.5 text-sm">
              <Camera className="h-6 w-6" />
              點擊上傳名片照片
            </span>
          )}
          {image && !busy && (
            <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-white opacity-0 transition-opacity group-hover:opacity-100">
              <Camera className="h-6 w-6" />
            </span>
          )}
        </button>
        {busy && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/50 text-white">
            <Loader2 className="h-6 w-6 animate-spin" />
          </span>
        )}
        {image && !busy && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setZoomOpen(true);
            }}
            title="放大檢視"
            className="absolute right-1.5 bottom-1.5 rounded-md bg-black/50 p-1.5 text-white opacity-0 transition-opacity hover:bg-black/70 group-hover:opacity-100"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {image && (
        <Dialog open={zoomOpen} onOpenChange={setZoomOpen}>
          <DialogContent className="max-w-[85vw] p-2 sm:max-w-[min(85vw,56rem)]">
            <DialogTitle className="sr-only">名片放大檢視</DialogTitle>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={image}
              alt="名片放大檢視"
              className="max-h-[70vh] w-full rounded-md object-contain"
            />
          </DialogContent>
        </Dialog>
      )}
      <div className="flex items-center gap-3">
        {aiEnabled && image && (
          <button
            type="button"
            disabled={busy}
            onClick={() => runOcr(image)}
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs disabled:opacity-60"
          >
            <Sparkles className="h-3.5 w-3.5" /> 重新辨識
          </button>
        )}
        {image && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onImageChange(null)}
            className="text-muted-foreground hover:text-destructive inline-flex items-center gap-1 text-xs disabled:opacity-60"
          >
            <Trash2 className="h-3.5 w-3.5" /> 移除名片
          </button>
        )}
        {!aiEnabled && (
          <span className="text-muted-foreground text-xs">
            僅記錄照片(未設定 AI，不會自動辨識)
          </span>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onPick}
      />
    </div>
  );
}
