"use client";

import { useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Camera, Trash2 } from "lucide-react";
import { updateAvatar } from "@/server/actions/team";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

/** 讀檔 → 置中裁成正方形 → 縮到 256px → 輸出 JPEG data URL（約 10–25KB）。 */
async function fileToAvatarDataUrl(file: File): Promise<string> {
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
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("無法處理圖片");
  const min = Math.min(img.width, img.height);
  const sx = (img.width - min) / 2;
  const sy = (img.height - min) / 2;
  ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);
  return canvas.toDataURL("image/jpeg", 0.85);
}

/**
 * 頭貼上傳器：點頭貼可選圖上傳（前端壓縮），有頭貼時可移除。
 * 本人（自己的個人頁）或管理者（他人頁）都能用，權限由 updateAvatar 於伺服器端把關。
 */
export function AvatarUploader({
  userId,
  image,
  fallback,
  className,
}: {
  userId: string;
  image: string | null;
  fallback: string;
  className?: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // 允許連選同一檔案
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("請選擇圖片檔");
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      toast.error("圖片檔太大（上限 15MB）");
      return;
    }
    start(async () => {
      try {
        const dataUrl = await fileToAvatarDataUrl(file);
        const res = await updateAvatar({ userId, dataUrl });
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        toast.success("已更新頭貼");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "上傳失敗");
      }
    });
  }

  function remove() {
    start(async () => {
      try {
        const res = await updateAvatar({ userId, dataUrl: null });
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        toast.success("已移除頭貼");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "移除失敗");
      }
    });
  }

  return (
    <div className="flex flex-col items-center gap-1.5">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={pending}
        className="group relative rounded-full outline-none disabled:opacity-60"
        title="點擊上傳頭貼"
      >
        <Avatar className={cn("h-16 w-16", className)}>
          {image && <AvatarImage src={image} alt="" />}
          <AvatarFallback className="text-lg">{fallback}</AvatarFallback>
        </Avatar>
        <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 text-white opacity-0 transition-opacity group-hover:opacity-100">
          <Camera className="h-5 w-5" />
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onPick}
      />
      {image && (
        <button
          type="button"
          onClick={remove}
          disabled={pending}
          className="text-muted-foreground hover:text-destructive inline-flex items-center gap-1 text-[11px] disabled:opacity-60"
        >
          <Trash2 className="h-3 w-3" /> 移除
        </button>
      )}
    </div>
  );
}
