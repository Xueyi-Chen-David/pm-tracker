"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, Loader2, Sparkles, Trash2 } from "lucide-react";
import { extractFoodLabelFields } from "@/server/actions/foodlabel";
import type { FoodLabelOcrFields } from "@/server/gemini";
import { cn } from "@/lib/utils";

/** 讀檔 → 等比縮到最長邊 <= maxDim → 輸出 JPEG data URL。 */
async function fileToDataUrl(file: File, maxDim = 1600): Promise<string> {
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
 * 日本食品包裝照片上傳 + OCR。
 *
 * 照片只在瀏覽器端暫存（不存資料庫），OCR 結果回填給表單：商品名 / 供應商 /
 * 内容量 / 型態，以及「栄養成分表示」原文。原文接著就交給規則引擎解析——
 * 換算與合規判定不經過 AI。
 * 未設定 GOOGLE_API_KEY 時整塊 UI 不出現。
 */
export function PackageUploader({
  aiEnabled,
  onExtracted,
}: {
  aiEnabled: boolean;
  onExtracted: (fields: FoodLabelOcrFields) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [image, setImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!aiEnabled) return null;

  async function runOcr(dataUrl: string) {
    setBusy(true);
    try {
      const res = await extractFoodLabelFields(dataUrl);
      if (!res.ok) {
        toast.warning(`辨識失敗：${res.error}`);
        return;
      }
      const { nutritionText, productName } = res.fields;
      if (!nutritionText && !productName) {
        toast.info("沒辨識到可用內容，請確認照片有拍到「栄養成分表示」，或手動輸入");
        return;
      }
      onExtracted(res.fields);
      toast.success(
        nutritionText
          ? "已填入辨識結果，請核對數值後再存檔"
          : "已填入商品資訊，但沒讀到栄養成分表示，請手動貼上",
      );
    } catch (err) {
      toast.warning(
        `辨識失敗：${err instanceof Error ? err.message : "未知錯誤"}`,
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
      const dataUrl = await fileToDataUrl(file);
      setImage(dataUrl);
      await runOcr(dataUrl);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "上傳失敗");
    }
  }

  return (
    <div className="space-y-1.5">
      <div
        className={cn(
          "group bg-muted/30 relative flex h-32 w-full items-center justify-center overflow-hidden rounded-md border",
          !image && "border-dashed",
        )}
      >
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="absolute inset-0 flex items-center justify-center outline-none disabled:opacity-60"
          title="點擊上傳 / 更換包裝照片"
        >
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image}
              alt="包裝照片"
              className="h-full w-full object-contain"
            />
          ) : (
            <span className="text-muted-foreground flex flex-col items-center gap-1 text-xs">
              <Camera className="h-5 w-5" />
              上傳包裝照片自動辨識
              <span className="text-[11px]">拍到「栄養成分表示」那一面</span>
            </span>
          )}
          {image && !busy && (
            <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-white opacity-0 transition-opacity group-hover:opacity-100">
              <Camera className="h-5 w-5" />
            </span>
          )}
        </button>
        {busy && (
          <span className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/50 text-xs text-white">
            <Loader2 className="h-5 w-5 animate-spin" />
            辨識中…
          </span>
        )}
      </div>
      {image && (
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => void runOcr(image)}
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-[11px] disabled:opacity-60"
          >
            <Sparkles className="h-3 w-3" /> 重新辨識
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setImage(null)}
            className="text-muted-foreground hover:text-destructive inline-flex items-center gap-1 text-[11px] disabled:opacity-60"
          >
            <Trash2 className="h-3 w-3" /> 移除照片
          </button>
          <span className="text-muted-foreground ml-auto text-[11px]">
            照片不會存檔
          </span>
        </div>
      )}
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
