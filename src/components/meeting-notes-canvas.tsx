"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { ImagePlus, Loader2, X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

export type NoteImage = {
  id: string;
  url: string;
};

const MAX_IMAGES = 12;

/** 讀檔 → 等比縮小 → 重新編碼成 JPEG data URL（沿用 report-summary-editor 的壓縮邏輯）。 */
function compress(file: File, maxW = 900, quality = 0.8): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("讀取失敗"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("圖片無法解析"));
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(reader.result as string);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * 會議筆記：文字（一般打字）+ 圖片縮圖排在文字下方（跟文字一起排列，不會疊在文字上面蓋住）。
 * editable=false 時純顯示（用於清單頁的唯讀卡片），沒有工具列與刪除按鈕。
 * 圖片一律在「插入」當下就壓縮＋上傳到 /api/report-image 換成短網址（不是等表單送出才傳），
 * 所以送出表單時 noteImages 已經是純資料，不用再處理非同步上傳。
 */
export function MeetingNotesCanvas({
  notesName = "notes",
  imagesName = "noteImages",
  defaultNotes = "",
  defaultImages = [],
  editable = true,
}: {
  notesName?: string;
  imagesName?: string;
  defaultNotes?: string | null;
  defaultImages?: NoteImage[];
  editable?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [notes, setNotes] = useState(defaultNotes ?? "");
  const [images, setImages] = useState<NoteImage[]>(defaultImages);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  function removeImage(id: string) {
    setImages((prev) => prev.filter((im) => im.id !== id));
  }

  async function addFiles(files: File[]) {
    const imgs = files.filter((f) => f.type.startsWith("image/"));
    if (!imgs.length) return;
    if (images.length >= MAX_IMAGES) {
      toast.message(`最多 ${MAX_IMAGES} 張圖`);
      return;
    }
    setBusy(true);
    try {
      const room = Math.max(0, MAX_IMAGES - images.length);
      for (const file of imgs.slice(0, room)) {
        const dataUrl = await compress(file);
        const res = await fetch("/api/report-image", {
          method: "POST",
          body: dataUrl,
        });
        if (!res.ok) throw new Error("圖片上傳失敗");
        const { url } = (await res.json()) as { url: string };
        setImages((prev) => [...prev, { id: crypto.randomUUID(), url }]);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "圖片上傳失敗");
    } finally {
      setBusy(false);
    }
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    void addFiles(files);
  }

  function onDrop(e: React.DragEvent) {
    if (!editable) return;
    const files = Array.from(e.dataTransfer.files);
    if (!files.length) return;
    e.preventDefault();
    void addFiles(files);
  }

  return (
    <div
      className="space-y-2"
      onDragOver={(e) => editable && e.preventDefault()}
      onDrop={onDrop}
    >
      {editable ? (
        <textarea
          name={notesName}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="討論重點、決議事項、待辦…（也可把圖片拖曳到這裡插入）"
          rows={6}
          className="border-input bg-muted/20 text-foreground w-full resize-none rounded-md border p-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
        />
      ) : (
        notes && (
          <div className="text-sm break-words whitespace-pre-wrap">{notes}</div>
        )
      )}

      {(images.length > 0 || editable) && (
        <div className="flex flex-wrap items-center gap-2">
          {images.map((im) => (
            <div key={im.id} className="group relative h-20 w-20 shrink-0">
              <button
                type="button"
                onClick={() => setPreview(im.url)}
                className="h-full w-full overflow-hidden rounded-md border"
                title="放大檢視"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={im.url}
                  alt=""
                  className="h-full w-full object-cover"
                />
              </button>
              {editable && (
                <button
                  type="button"
                  onClick={() => removeImage(im.id)}
                  title="刪除圖片"
                  className="absolute top-0.5 right-0.5 rounded bg-black/50 p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
          {editable && (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="border-input hover:bg-muted text-muted-foreground flex h-20 w-20 shrink-0 flex-col items-center justify-center gap-1 rounded-md border border-dashed text-xs disabled:opacity-60"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ImagePlus className="h-4 w-4" />
              )}
              插入圖片
            </button>
          )}
        </div>
      )}

      {editable && (
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={onPick}
        />
      )}
      {editable && (
        <input type="hidden" name={imagesName} value={JSON.stringify(images)} readOnly />
      )}

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-[85vw] p-2 sm:max-w-[min(85vw,56rem)]">
          <DialogTitle className="sr-only">圖片放大檢視</DialogTitle>
          {preview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt=""
              className="max-h-[70vh] w-full rounded-md object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
