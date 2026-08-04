"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { ImagePlus, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type NoteImage = {
  id: string;
  url: string;
  /** 全部是相對畫布的百分比（0-100）——畫布高度固定、寬度隨容器伸縮，編輯與唯讀畫面共用同一份座標，不會跑版。 */
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
};

const CANVAS_HEIGHT = 320; // px，編輯 / 唯讀畫面固定用這個高度換算百分比
const MAX_IMAGES = 12;
const DEFAULT_W = 30;
const DEFAULT_H = 38;

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
 * 會議筆記畫布：文字（一般打字）+ 可自由拖曳/縮放的浮動圖片。
 * editable=false 時純顯示（用於清單頁的唯讀卡片），沒有工具列與拖曳把手。
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
  const containerRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [notes, setNotes] = useState(defaultNotes ?? "");
  const [images, setImages] = useState<NoteImage[]>(defaultImages);
  const [busy, setBusy] = useState(false);

  function updateImage(id: string, patch: Partial<NoteImage>) {
    setImages((prev) => prev.map((im) => (im.id === id ? { ...im, ...patch } : im)));
  }
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
        setImages((prev) => {
          const offset = (prev.length % 5) * 6;
          return [
            ...prev,
            {
              id: crypto.randomUUID(),
              url,
              xPct: 4 + offset,
              yPct: 4 + offset,
              wPct: DEFAULT_W,
              hPct: DEFAULT_H,
            },
          ];
        });
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
    <div className="space-y-1.5">
      {editable && (
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-xs">
            拖曳圖片到下面框裡、或點「插入圖片」；圖片可直接拖曳移動、右下角拉可縮放。
          </span>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="border-input hover:bg-muted inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-xs disabled:opacity-60"
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ImagePlus className="h-3.5 w-3.5" />
            )}
            插入圖片
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={onPick}
          />
        </div>
      )}

      <div
        ref={containerRef}
        onDragOver={(e) => editable && e.preventDefault()}
        onDrop={onDrop}
        className="bg-muted/20 relative overflow-hidden rounded-md border"
        style={{ height: CANVAS_HEIGHT }}
      >
        {editable ? (
          <textarea
            name={notesName}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="討論重點、決議事項、待辦…"
            className="text-foreground absolute inset-0 h-full w-full resize-none border-0 bg-transparent p-3 text-sm outline-none"
          />
        ) : (
          <div className="h-full overflow-y-auto p-3 text-sm break-words whitespace-pre-wrap">
            {notes}
          </div>
        )}

        {images.map((im) => (
          <FloatingImage
            key={im.id}
            image={im}
            editable={editable}
            containerRef={containerRef}
            onChange={(patch) => updateImage(im.id, patch)}
            onRemove={() => removeImage(im.id)}
          />
        ))}
      </div>

      {editable && (
        <input type="hidden" name={imagesName} value={JSON.stringify(images)} readOnly />
      )}
    </div>
  );
}

function FloatingImage({
  image,
  editable,
  containerRef,
  onChange,
  onRemove,
}: {
  image: NoteImage;
  editable: boolean;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onChange: (patch: Partial<NoteImage>) => void;
  onRemove: () => void;
}) {
  const dragRef = useRef<{ x: number; y: number; xPct: number; yPct: number } | null>(
    null,
  );
  const resizeRef = useRef<{ x: number; y: number; wPct: number; hPct: number } | null>(
    null,
  );

  function box() {
    return containerRef.current?.getBoundingClientRect();
  }

  function onDragDown(e: React.PointerEvent) {
    if (!editable) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, xPct: image.xPct, yPct: image.yPct };
  }
  function onDragMove(e: React.PointerEvent) {
    const start = dragRef.current;
    const rect = box();
    if (!start || !rect) return;
    const dxPct = ((e.clientX - start.x) / rect.width) * 100;
    const dyPct = ((e.clientY - start.y) / rect.height) * 100;
    onChange({
      xPct: Math.min(Math.max(0, start.xPct + dxPct), Math.max(0, 100 - image.wPct)),
      yPct: Math.min(Math.max(0, start.yPct + dyPct), Math.max(0, 100 - image.hPct)),
    });
  }
  function onDragUp() {
    dragRef.current = null;
  }

  function onResizeDown(e: React.PointerEvent) {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    resizeRef.current = { x: e.clientX, y: e.clientY, wPct: image.wPct, hPct: image.hPct };
  }
  function onResizeMove(e: React.PointerEvent) {
    const start = resizeRef.current;
    const rect = box();
    if (!start || !rect) return;
    const dwPct = ((e.clientX - start.x) / rect.width) * 100;
    const dhPct = ((e.clientY - start.y) / rect.height) * 100;
    onChange({
      wPct: Math.min(Math.max(8, start.wPct + dwPct), 100 - image.xPct),
      hPct: Math.min(Math.max(8, start.hPct + dhPct), 100 - image.yPct),
    });
  }
  function onResizeUp() {
    resizeRef.current = null;
  }

  return (
    <div
      className="group absolute overflow-hidden rounded border bg-white shadow-sm"
      style={{
        left: `${image.xPct}%`,
        top: `${image.yPct}%`,
        width: `${image.wPct}%`,
        height: `${image.hPct}%`,
        touchAction: editable ? "none" : undefined,
      }}
      onPointerDown={onDragDown}
      onPointerMove={onDragMove}
      onPointerUp={onDragUp}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={image.url}
        alt=""
        draggable={false}
        className={cn(
          "pointer-events-none h-full w-full object-cover",
          editable && "cursor-move",
        )}
      />
      {editable && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            title="刪除圖片"
            className="absolute top-0.5 right-0.5 rounded bg-black/50 p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
          >
            <X className="h-3 w-3" />
          </button>
          <div
            onPointerDown={onResizeDown}
            onPointerMove={onResizeMove}
            onPointerUp={onResizeUp}
            title="拖曳縮放"
            className="bg-primary/70 absolute right-0 bottom-0 h-3.5 w-3.5 cursor-nwse-resize touch-none rounded-tl opacity-0 transition-opacity group-hover:opacity-100"
          />
        </>
      )}
    </div>
  );
}
