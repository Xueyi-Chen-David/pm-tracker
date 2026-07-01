"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Bold,
  FileText,
  ImagePlus,
  Italic,
  List,
  ListOrdered,
  Pencil,
} from "lucide-react";
import { saveWeeklyReportDoc } from "@/server/actions/report";
import { htmlHasContent } from "@/lib/report-content";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MAX_IMAGES = 20;

/** 讀檔→等比縮小→重新編碼成 JPEG data URL，避免存進 DB 的圖片過大。 */
function compress(file: File, maxW = 1280, quality = 0.8): Promise<string> {
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
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export function ReportSummaryEditor({
  weekStart,
  html,
}: {
  weekStart: string; // ISO
  html: string;
}) {
  const router = useRouter();
  const editorRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState(false);
  const selImgRef = useRef<HTMLImageElement | null>(null);
  const [hasSel, setHasSel] = useState(false);
  const [imgWidth, setImgWidth] = useState(100);

  const hasContent = htmlHasContent(html);

  // 進入編輯時把目前內容塞進 contentEditable（之後不再受 React 控制，避免游標亂跳）
  useEffect(() => {
    if (editing && editorRef.current) {
      editorRef.current.innerHTML = html || "<p><br></p>";
      editorRef.current.focus();
      selImgRef.current = null;
      setHasSel(false);
    }
  }, [editing, html]);

  function clearImgSelection() {
    editorRef.current
      ?.querySelectorAll("img.is-selected")
      .forEach((el) => el.classList.remove("is-selected"));
  }
  function selectImg(img: HTMLImageElement | null) {
    clearImgSelection();
    selImgRef.current = img;
    if (img) {
      img.classList.add("is-selected");
      const s = img.style.width;
      setImgWidth(s.endsWith("%") ? Math.round(parseFloat(s)) || 100 : 100);
    }
    setHasSel(!!img);
  }
  function onEditorClick(e: React.MouseEvent) {
    const t = e.target as HTMLElement;
    if (t.tagName === "IMG") selectImg(t as HTMLImageElement);
    else if (selImgRef.current) selectImg(null);
  }
  function setImgWidthPct(pct: number) {
    setImgWidth(pct);
    const img = selImgRef.current;
    if (img) img.style.width = `${pct}%`;
  }

  function exec(command: string, value?: string) {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
  }

  function insertImage(src: string) {
    editorRef.current?.focus();
    document.execCommand("insertHTML", false, `<img src="${src}" />`);
  }

  async function addImages(files: File[]) {
    const imgs = files.filter((f) => f.type.startsWith("image/"));
    if (!imgs.length) return;
    const current = editorRef.current?.querySelectorAll("img").length ?? 0;
    setBusy(true);
    try {
      const room = Math.max(0, MAX_IMAGES - current);
      const picked = imgs.slice(0, room);
      for (const f of picked) insertImage(await compress(f));
      if (imgs.length > room) toast.message(`最多 ${MAX_IMAGES} 張圖`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "圖片處理失敗");
    } finally {
      setBusy(false);
    }
  }

  function onPaste(e: React.ClipboardEvent) {
    const items = Array.from(e.clipboardData.items);
    const imgFiles = items
      .filter((i) => i.kind === "file" && i.type.startsWith("image/"))
      .map((i) => i.getAsFile())
      .filter((f): f is File => !!f);
    if (imgFiles.length) {
      e.preventDefault();
      void addImages(imgFiles);
      return;
    }
    // 一般內容一律以「純文字」貼上，避免帶入外部樣式 / 不安全 HTML
    e.preventDefault();
    document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
  }

  function onDrop(e: React.DragEvent) {
    const files = Array.from(e.dataTransfer.files).filter((f) =>
      f.type.startsWith("image/"),
    );
    if (!files.length) return;
    e.preventDefault();
    const range =
      typeof document.caretRangeFromPoint === "function"
        ? document.caretRangeFromPoint(e.clientX, e.clientY)
        : null;
    if (range) {
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    } else {
      editorRef.current?.focus();
    }
    void addImages(files);
  }

  function deleteSelImg() {
    const img = selImgRef.current;
    if (!img) return;
    img.remove();
    selImgRef.current = null;
    setHasSel(false);
    editorRef.current?.focus();
  }

  async function save() {
    const el = editorRef.current;
    if (!el) return;
    clearImgSelection(); // 移除選取外框，存乾淨的 HTML
    selImgRef.current = null;
    setHasSel(false);

    // 先把所有 data: 圖片上傳成短網址，內文只留 URL（base64 不進 action / log）
    setBusy(true);
    try {
      const dataImgs = Array.from(el.querySelectorAll("img")).filter((im) =>
        (im.getAttribute("src") ?? "").startsWith("data:"),
      );
      for (const im of dataImgs) {
        const res = await fetch("/api/report-image", {
          method: "POST",
          body: im.getAttribute("src") ?? "",
        });
        if (!res.ok) throw new Error("圖片上傳失敗");
        const { url } = (await res.json()) as { url: string };
        im.setAttribute("src", url);
      }
    } catch (e) {
      setBusy(false);
      toast.error(e instanceof Error ? e.message : "圖片上傳失敗");
      return;
    }
    setBusy(false);

    const nextHtml = el.innerHTML;
    const text = el.innerText;
    start(async () => {
      try {
        await saveWeeklyReportDoc({ weekStart, html: nextHtml, text });
        setEditing(false);
        toast.success("已儲存整體說明");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "儲存失敗");
      }
    });
  }

  return (
    <div className={cn("rounded-xl border bg-white p-4", !hasContent && "no-print")}>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <FileText className="h-4 w-4 text-slate-600" /> 整體說明
        </h2>
        {!editing && (
          <Button
            variant="ghost"
            size="sm"
            className="no-print"
            onClick={() => setEditing(true)}
          >
            <Pencil className="h-3.5 w-3.5" /> {hasContent ? "編輯" : "新增"}
          </Button>
        )}
      </div>

      {editing ? (
        <div className="no-print space-y-2">
          {/* 工具列 */}
          <div className="flex flex-wrap items-center gap-1 border-b pb-2">
            <ToolBtn title="粗體" onClick={() => exec("bold")}>
              <Bold className="h-4 w-4" />
            </ToolBtn>
            <ToolBtn title="斜體" onClick={() => exec("italic")}>
              <Italic className="h-4 w-4" />
            </ToolBtn>
            <ToolBtn title="項目符號" onClick={() => exec("insertUnorderedList")}>
              <List className="h-4 w-4" />
            </ToolBtn>
            <ToolBtn title="編號清單" onClick={() => exec("insertOrderedList")}>
              <ListOrdered className="h-4 w-4" />
            </ToolBtn>
            <span className="bg-border mx-1 h-5 w-px" />
            <ToolBtn
              title="插入圖片"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
            >
              <ImagePlus className="h-4 w-4" />
            </ToolBtn>
            {busy && (
              <span className="text-muted-foreground text-[11px]">處理中…</span>
            )}
            <span className="text-muted-foreground ml-auto hidden text-[11px] sm:inline">
              點圖片可調大小；可直接打字、貼上或拖拉圖片進來
            </span>
          </div>

          {/* 選到圖片時：調整寬度 */}
          {hasSel && (
            <div className="bg-muted/40 flex items-center gap-2 rounded-md border px-2 py-1.5">
              <span className="text-muted-foreground shrink-0 text-xs">
                圖片寬度
              </span>
              <input
                type="range"
                min={20}
                max={100}
                step={5}
                value={imgWidth}
                onChange={(e) => setImgWidthPct(Number(e.target.value))}
                className="accent-primary flex-1 cursor-pointer"
              />
              <span className="w-9 shrink-0 text-right text-xs tabular-nums">
                {imgWidth}%
              </span>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setImgWidthPct(100)}
                className="text-muted-foreground hover:text-foreground shrink-0 text-xs"
              >
                滿版
              </button>
              <span className="bg-border h-4 w-px shrink-0" />
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={deleteSelImg}
                className="text-destructive shrink-0 text-xs hover:underline"
              >
                刪除圖片
              </button>
            </div>
          )}

          {/* 編輯區（像 doc / email：文字與圖片同一條流）*/}
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            onClick={onEditorClick}
            onPaste={onPaste}
            onDrop={onDrop}
            onDragOver={(e) => {
              if (Array.from(e.dataTransfer.items).some((i) => i.kind === "file"))
                e.preventDefault();
            }}
            className="rich-content border-input focus-visible:border-ring focus-visible:ring-ring/50 min-h-40 rounded-md border px-3 py-2 outline-none focus-visible:ring-[3px]"
          />

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = "";
              void addImages(files);
            }}
          />

          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => setEditing(false)}
            >
              取消
            </Button>
            <Button
              size="sm"
              disabled={pending || busy}
              onClick={() => void save()}
            >
              {pending ? "儲存中…" : "儲存"}
            </Button>
          </div>
        </div>
      ) : hasContent ? (
        <div
          className="rich-content"
          // 內容來自本編輯器並於存檔時消毒；貼上一律轉純文字，不會有可執行 HTML
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <p className="no-print text-sm text-slate-400">
          尚無整體說明，點「新增」像寫文件一樣補充本週狀況（可內嵌圖片）。
        </p>
      )}
    </div>
  );
}

function ToolBtn({
  title,
  onClick,
  disabled,
  children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      // 用 mousedown 防止點工具列時編輯區失焦、丟失選取範圍
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="text-muted-foreground hover:bg-muted hover:text-foreground inline-flex h-7 w-7 items-center justify-center rounded transition-colors disabled:opacity-50"
    >
      {children}
    </button>
  );
}
