"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ImagePlus, Loader2 } from "lucide-react";
import { NOTE_IMG_CLASS } from "@/lib/meeting-notes";

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
 * 會議筆記：圖片直接「插入」在文字裡面、文字像 Word 一樣環繞圖片排版——不是分開上下 / 左右
 * 兩塊，是同一段內容。用 contentEditable 而非 textarea，因為瀏覽器原生 textarea 沒辦法讓
 * 文字繞著圖片排版。存檔時是一段 HTML（<img> 用固定 class 浮動 + 純文字/<br>/<div>換行），
 * 送出前後端都會用 sanitize-html 過白名單（見 server/actions/meetings.ts），只放行圖片
 * 來自 /api/report-image，不接受貼上外部 HTML / 任意來源圖片。
 *
 * 舊資料相容：改版前的紀錄，notes 是純文字、圖片存在獨立的 noteImages 陣列（不在文字裡）。
 * 這裡不特別區分新舊格式——舊 notes 只可能是「透過 textarea 打的純文字」，不可能含有真正
 * 的標籤，直接當 HTML 顯示是安全的；舊 noteImages 若沒有任何一張的網址出現在 notes 內容裡
 * （新格式一定會出現，因為是內嵌的），代表是舊資料，額外在下方顯示一個小圖庫作為 fallback，
 * 不會讓舊紀錄的圖片憑空消失。
 *
 * editable=false 時純顯示（用於清單頁的唯讀卡片），沒有工具列。
 */
export function MeetingNotesCanvas({
  notesName = "notes",
  defaultNotes = "",
  /** 舊資料的圖片（改版前存在獨立陣列裡的）；新資料圖片已內嵌在 notes 裡，這裡通常是空陣列。 */
  legacyImages = [],
  editable = true,
}: {
  notesName?: string;
  defaultNotes?: string | null;
  legacyImages?: NoteImage[];
  editable?: boolean;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const hiddenInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [imageCount, setImageCount] = useState(0);

  function syncHiddenInput() {
    if (hiddenInputRef.current && editorRef.current) {
      hiddenInputRef.current.value = editorRef.current.innerHTML;
    }
  }

  // contentEditable 的初始內容只在掛載時塞一次（非受控），避免每次 render 重設游標位置。
  useEffect(() => {
    if (!editable || !editorRef.current) return;
    editorRef.current.innerHTML = defaultNotes ?? "";
    setImageCount(editorRef.current.querySelectorAll("img").length);
    syncHiddenInput();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editable]);

  function onInput() {
    if (!editorRef.current) return;
    setImageCount(editorRef.current.querySelectorAll("img").length);
    syncHiddenInput();
  }

  /** 貼上一律降成純文字，不接受從外部貼進來的格式化 HTML。 */
  function onPaste(e: React.ClipboardEvent<HTMLDivElement>) {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, text);
  }

  /** 按鈕 mousedown 先於 click/檔案選取視窗搶走 focus，這裡先記住目前游標位置。 */
  function onInsertMouseDown() {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && editorRef.current?.contains(sel.anchorNode)) {
      savedRangeRef.current = sel.getRangeAt(0).cloneRange();
    } else {
      savedRangeRef.current = null;
    }
  }

  function insertImageHtml(url: string) {
    const editor = editorRef.current;
    if (!editor) return;
    const html = `<img class="${NOTE_IMG_CLASS}" src="${url}" alt="" />`;
    editor.focus();
    const sel = window.getSelection();
    if (savedRangeRef.current && sel) {
      sel.removeAllRanges();
      sel.addRange(savedRangeRef.current);
    }
    const ok = document.execCommand("insertHTML", false, html);
    if (!ok) {
      // 保底：極少數不支援 execCommand 的環境，直接插到最後面。
      editor.insertAdjacentHTML("beforeend", html);
    }
    onInput();
  }

  async function addFiles(files: File[]) {
    const imgs = files.filter((f) => f.type.startsWith("image/"));
    if (!imgs.length) return;
    if (imageCount >= MAX_IMAGES) {
      toast.message(`最多 ${MAX_IMAGES} 張圖`);
      return;
    }
    setBusy(true);
    try {
      const room = Math.max(0, MAX_IMAGES - imageCount);
      for (const file of imgs.slice(0, room)) {
        const dataUrl = await compress(file);
        const res = await fetch("/api/report-image", {
          method: "POST",
          body: dataUrl,
        });
        if (!res.ok) throw new Error("圖片上傳失敗");
        const { url } = (await res.json()) as { url: string };
        insertImageHtml(url);
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

  if (!editable) {
    const notes = defaultNotes ?? "";
    // 舊資料 fallback：noteImages 裡有、但網址沒出現在 notes HTML 裡的（代表沒內嵌），額外補顯示。
    const orphaned = legacyImages.filter((im) => !notes.includes(im.url));
    return (
      <div className="space-y-2">
        {notes && (
          <div
            className="overflow-hidden text-sm break-words whitespace-pre-wrap [&_img]:align-top"
            dangerouslySetInnerHTML={{ __html: notes }}
          />
        )}
        {orphaned.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {orphaned.map((im) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={im.id}
                src={im.url}
                alt=""
                className="h-20 w-20 rounded-md border object-cover"
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground text-xs">
          圖片會插在游標位置，文字自動環繞排版；貼上內容一律當純文字。
        </span>
        <button
          type="button"
          onMouseDown={onInsertMouseDown}
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

      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={onInput}
        onPaste={onPaste}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        data-placeholder="討論重點、決議事項、待辦…（可插入圖片，文字會自動環繞）"
        className="border-input bg-muted/20 text-foreground min-h-40 w-full overflow-hidden rounded-md border p-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)]"
      />
      <input ref={hiddenInputRef} type="hidden" name={notesName} />
    </div>
  );
}
