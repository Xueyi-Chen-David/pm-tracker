"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  Folder,
  FolderOpen,
  FolderPlus,
  FileText,
  FilePlus,
  ChevronRight,
  Search,
  MoreHorizontal,
  Pencil,
  Trash2,
  BookOpen,
  Lock,
  X,
  Bold,
  Italic,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Link2,
  Table,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Markdown } from "@/lib/markdown";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { PromptDialog, ConfirmDialog } from "./doc-dialogs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  createDocFolder,
  renameDocFolder,
  deleteDocFolder,
  createDocPage,
  updateDocPage,
  deleteDocPage,
  moveDocPage,
  moveDocFolder,
  setDocPageVisibility,
} from "@/server/actions/training-docs";

export type DocFolder = {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
};

export type DocPage = {
  id: string;
  title: string;
  content: string;
  folderId: string | null;
  sortOrder: number;
  updatedAt: Date | string;
  visibility: string; // "ALL" | "RESTRICTED"
  allowedUserIds: string[];
};

export type DocMember = {
  id: string;
  name: string | null;
  email: string | null;
};

type DropZone = "before" | "after" | "inside";

/** 依游標在列上的相對位置回傳放置區：上/下緣＝排序前後，中間＝放進（僅資料夾）。 */
function computeZone(e: React.DragEvent, allowInside: boolean): DropZone {
  const r = e.currentTarget.getBoundingClientRect();
  const y = e.clientY - r.top;
  if (allowInside) {
    if (y < r.height * 0.3) return "before";
    if (y > r.height * 0.7) return "after";
    return "inside";
  }
  return y < r.height / 2 ? "before" : "after";
}

type DialogState =
  | { kind: "newFolder"; parentId: string | null }
  | { kind: "renameFolder"; id: string; name: string }
  | { kind: "deleteFolder"; id: string; name: string }
  | { kind: "newPage"; folderId: string | null }
  | { kind: "renamePage"; id: string; name: string }
  | { kind: "deletePage"; id: string; name: string }
  | { kind: "permission"; page: DocPage }
  | null;

export function DocsWorkspace({
  folders,
  pages,
  members,
  canManage,
}: {
  folders: DocFolder[];
  pages: DocPage[];
  members: DocMember[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  // 本地資料夾 / 文件狀態：儲存 / 拖放時樂觀更新，畫面即時反映、不用等 router.refresh 往返。
  // 伺服器資料更新（props 換新陣列）時，於 render 期間同步回本地（React 建議寫法）。
  const [pagesState, setPagesState] = useState(pages);
  const [serverPages, setServerPages] = useState(pages);
  if (serverPages !== pages) {
    setServerPages(pages);
    setPagesState(pages);
  }
  const [foldersState, setFoldersState] = useState(folders);
  const [serverFolders, setServerFolders] = useState(folders);
  if (serverFolders !== folders) {
    setServerFolders(folders);
    setFoldersState(folders);
  }

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(folders.map((f) => f.id)),
  );
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState<DialogState>(null);

  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftContent, setDraftContent] = useState("");
  // 小螢幕用的「編輯 / 預覽」切換（大螢幕一律並排顯示）。
  const [mobilePreview, setMobilePreview] = useState(false);

  // 拖放（像 VSCode）：可把文件 / 資料夾拖進資料夾或彼此調整順序。
  // dragItem＝正在拖的項目；dragOver＝目前放置目標的標記（`${id}:${zone}` 或 "root"）。
  const [dragItem, setDragItem] = useState<{
    type: "page" | "folder";
    id: string;
  } | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  /**
   * 移動 / 排序文件：把 pageId 放進 folderId（null＝根層）；beforeId 有值＝插到該文件之前，
   * 否則放到末端。樂觀更新（依 pagesState 陣列順序渲染）+ 背景儲存。
   */
  function movePage(
    pageId: string,
    folderId: string | null,
    beforeId?: string | null,
  ) {
    if (pageId === beforeId) return;
    const page = pagesState.find((p) => p.id === pageId);
    if (!page) return;
    // 沒有實際變化（同資料夾、又沒指定插入位置）就不動。
    if (page.folderId === folderId && !beforeId) return;
    setPagesState((prev) => {
      const moving = prev.find((p) => p.id === pageId);
      if (!moving) return prev;
      const without = prev.filter((p) => p.id !== pageId);
      const updated = { ...moving, folderId };
      const idx = beforeId ? without.findIndex((p) => p.id === beforeId) : -1;
      if (idx < 0) return [...without, updated];
      return [...without.slice(0, idx), updated, ...without.slice(idx)];
    });
    if (folderId) expandFolder(folderId);
    run(() => moveDocPage({ id: pageId, folderId, beforeId: beforeId ?? null }), {
      ok: "已移動文件",
    });
  }

  /** 移動 / 排序資料夾：放進 parentId（null＝根層）；beforeId 有值＝插到該資料夾之前。 */
  function moveFolder(
    folderId: string,
    parentId: string | null,
    beforeId?: string | null,
  ) {
    if (folderId === beforeId || folderId === parentId) return;
    const folder = foldersState.find((f) => f.id === folderId);
    if (!folder) return;
    // 不能移進自己的子孫（前端先擋，伺服器也會擋）。
    let cur = parentId;
    while (cur) {
      if (cur === folderId) return;
      cur = foldersState.find((f) => f.id === cur)?.parentId ?? null;
    }
    if (folder.parentId === parentId && !beforeId) return;
    setFoldersState((prev) => {
      const moving = prev.find((f) => f.id === folderId);
      if (!moving) return prev;
      const without = prev.filter((f) => f.id !== folderId);
      const updated = { ...moving, parentId };
      const idx = beforeId ? without.findIndex((f) => f.id === beforeId) : -1;
      if (idx < 0) return [...without, updated];
      return [...without.slice(0, idx), updated, ...without.slice(idx)];
    });
    if (parentId) expandFolder(parentId);
    run(
      () => moveDocFolder({ id: folderId, parentId, beforeId: beforeId ?? null }),
      { ok: "已移動資料夾" },
    );
  }

  // ── 索引：父層 → 子資料夾、資料夾 → 文件、id → 資料夾 ──
  const { foldersByParent, pagesByFolder, folderMap } = useMemo(() => {
    const fbp = new Map<string | null, DocFolder[]>();
    const pbf = new Map<string | null, DocPage[]>();
    const fm = new Map<string, DocFolder>();
    for (const f of foldersState) {
      fm.set(f.id, f);
      const arr = fbp.get(f.parentId) ?? [];
      arr.push(f);
      fbp.set(f.parentId, arr);
    }
    for (const p of pagesState) {
      const arr = pbf.get(p.folderId) ?? [];
      arr.push(p);
      pbf.set(p.folderId, arr);
    }
    return { foldersByParent: fbp, pagesByFolder: pbf, folderMap: fm };
  }, [foldersState, pagesState]);

  const selectedPage = selectedId
    ? (pagesState.find((p) => p.id === selectedId) ?? null)
    : null;

  // 從文件往上推得資料夾路徑（根 → 所在資料夾）。
  function folderPath(folderId: string | null): DocFolder[] {
    const path: DocFolder[] = [];
    const seen = new Set<string>();
    let cur = folderId;
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      const f = folderMap.get(cur);
      if (!f) break;
      path.unshift(f);
      cur = f.parentId;
    }
    return path;
  }

  function run<T>(
    fn: () => Promise<T>,
    opts?: { ok?: string; onDone?: (v: T) => void },
  ) {
    start(async () => {
      try {
        const v = await fn();
        opts?.onDone?.(v);
        if (opts?.ok) toast.success(opts.ok);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "操作失敗");
      }
    });
  }

  function toggleFolder(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function expandFolder(id: string | null) {
    if (!id) return;
    setExpanded((prev) => new Set(prev).add(id));
  }

  function selectPage(id: string) {
    setEditing(false);
    setSelectedId(id);
  }

  function startEdit(p: DocPage) {
    setDraftTitle(p.title);
    setDraftContent(p.content);
    setEditing(true);
  }

  // ── Markdown 工具列：對編輯區的 textarea 直接插入語法 ──
  const contentRef = useRef<HTMLTextAreaElement | null>(null);

  function restoreSelection(start: number, end: number) {
    requestAnimationFrame(() => {
      const ta = contentRef.current;
      if (!ta) return;
      ta.focus();
      ta.selectionStart = start;
      ta.selectionEnd = end;
    });
  }

  /** 用 before/after 包住選取文字（粗體 / 斜體 / 連結…）；無選取則插入 placeholder。 */
  function wrapSelection(before: string, after: string, placeholder: string) {
    const ta = contentRef.current;
    if (!ta) return;
    const s = ta.selectionStart;
    const e = ta.selectionEnd;
    const sel = draftContent.slice(s, e) || placeholder;
    setDraftContent(
      draftContent.slice(0, s) + before + sel + after + draftContent.slice(e),
    );
    restoreSelection(s + before.length, s + before.length + sel.length);
  }

  /** 在選取涵蓋的每一行行首加上前綴（標題 / 清單 / 引言）。 */
  function prefixLines(prefix: string) {
    const ta = contentRef.current;
    if (!ta) return;
    const s = ta.selectionStart;
    const e = ta.selectionEnd;
    const lineStart = draftContent.lastIndexOf("\n", s - 1) + 1;
    const seg = draftContent.slice(lineStart, e);
    const replaced = seg
      .split("\n")
      .map((l) => prefix + l)
      .join("\n");
    setDraftContent(
      draftContent.slice(0, lineStart) + replaced + draftContent.slice(e),
    );
    restoreSelection(lineStart, lineStart + replaced.length);
  }

  /** 在游標處插入一段區塊（表格範本），前後確保有換行。 */
  function insertBlock(text: string) {
    const ta = contentRef.current;
    if (!ta) return;
    const s = ta.selectionStart;
    const before = s > 0 && draftContent[s - 1] !== "\n" ? "\n" : "";
    const block = before + text;
    setDraftContent(draftContent.slice(0, s) + block + draftContent.slice(s));
    const pos = s + block.length;
    restoreSelection(pos, pos);
  }

  function saveEdit() {
    if (!selectedId) return;
    const id = selectedId;
    const title = draftTitle.trim();
    if (!title) {
      toast.error("請輸入文件名稱");
      return;
    }
    const content = draftContent;
    // 樂觀更新：立刻把新內容套進畫面並退出編輯，伺服器儲存 + refresh 在背景進行。
    setPagesState((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, title, content, updatedAt: new Date() } : p,
      ),
    );
    setEditing(false);
    run(() => updateDocPage({ id, title, content }), { ok: "已儲存" });
  }

  // ── 對話框送出 ──
  function submitDialog(value: string) {
    const d = dialog;
    if (!d) return;
    if (d.kind === "newFolder") {
      run(() => createDocFolder({ name: value, parentId: d.parentId }), {
        ok: "已新增資料夾",
        onDone: () => {
          expandFolder(d.parentId);
          setDialog(null);
        },
      });
    } else if (d.kind === "renameFolder") {
      run(() => renameDocFolder({ id: d.id, name: value }), {
        ok: "已重新命名",
        onDone: () => setDialog(null),
      });
    } else if (d.kind === "newPage") {
      run(() => createDocPage({ title: value, folderId: d.folderId }), {
        ok: "已新增文件",
        onDone: (r) => {
          expandFolder(d.folderId);
          setDialog(null);
          // 新文件多半是空白 → 直接進入編輯模式。
          setSelectedId(r.id);
          setDraftTitle(value);
          setDraftContent("");
          setEditing(true);
        },
      });
    } else if (d.kind === "renamePage") {
      run(() => updateDocPage({ id: d.id, title: value }), {
        ok: "已重新命名",
        onDone: () => setDialog(null),
      });
    }
  }

  function confirmDelete() {
    const d = dialog;
    if (!d) return;
    if (d.kind === "deleteFolder") {
      run(() => deleteDocFolder(d.id), {
        ok: "已刪除資料夾",
        onDone: () => setDialog(null),
      });
    } else if (d.kind === "deletePage") {
      run(() => deleteDocPage(d.id), {
        ok: "已刪除文件",
        onDone: () => {
          if (selectedId === d.id) setSelectedId(null);
          setDialog(null);
        },
      });
    }
  }

  function savePermission(
    visibility: "ALL" | "RESTRICTED",
    allowedUserIds: string[],
  ) {
    const d = dialog;
    if (d?.kind !== "permission") return;
    run(() => setDocPageVisibility({ id: d.page.id, visibility, allowedUserIds }), {
      ok: "已更新權限",
      onDone: () => setDialog(null),
    });
  }

  // ── 樹狀渲染 ──
  const INDENT = 14;

  function renderLevel(parentId: string | null, depth: number): React.ReactNode {
    const subFolders = foldersByParent.get(parentId) ?? [];
    const subPages = pagesByFolder.get(parentId) ?? [];
    return (
      <>
        {subFolders.map((f, fi) => {
          const isOpen = expanded.has(f.id);
          return (
            <div key={f.id}>
              <div
                draggable={canManage}
                onDragStart={
                  canManage
                    ? (e) => {
                        e.dataTransfer.setData("text/plain", f.id);
                        e.dataTransfer.effectAllowed = "move";
                        setDragItem({ type: "folder", id: f.id });
                      }
                    : undefined
                }
                onDragEnd={
                  canManage
                    ? () => {
                        setDragItem(null);
                        setDragOver(null);
                      }
                    : undefined
                }
                className={cn(
                  "group hover:bg-muted/60 flex items-center rounded-md border-y-2 border-transparent pr-1",
                  canManage && "cursor-grab active:cursor-grabbing",
                  dragItem?.type === "folder" && dragItem.id === f.id && "opacity-50",
                  dragOver === `${f.id}:inside` &&
                    "ring-primary bg-primary/10 ring-2 ring-inset",
                  dragOver === `${f.id}:before` && "!border-t-primary",
                  dragOver === `${f.id}:after` && "!border-b-primary",
                )}
                style={{ paddingLeft: 6 + depth * INDENT }}
                onDragOver={
                  dragItem
                    ? (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        e.dataTransfer.dropEffect = "move";
                        const zone =
                          dragItem.type === "folder"
                            ? computeZone(e, true)
                            : "inside";
                        setDragOver(`${f.id}:${zone}`);
                      }
                    : undefined
                }
                onDragLeave={
                  dragItem
                    ? (e) => {
                        if (!e.currentTarget.contains(e.relatedTarget as Node))
                          setDragOver((v) =>
                            v?.startsWith(`${f.id}:`) ? null : v,
                          );
                      }
                    : undefined
                }
                onDrop={
                  dragItem
                    ? (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const item = dragItem;
                        if (item.type === "page") {
                          movePage(item.id, f.id, null);
                        } else {
                          const zone = computeZone(e, true);
                          if (zone === "inside") moveFolder(item.id, f.id, null);
                          else
                            moveFolder(
                              item.id,
                              f.parentId,
                              zone === "before"
                                ? f.id
                                : (subFolders[fi + 1]?.id ?? null),
                            );
                        }
                        setDragItem(null);
                        setDragOver(null);
                      }
                    : undefined
                }
              >
                <button
                  type="button"
                  onClick={() => toggleFolder(f.id)}
                  className="flex min-w-0 flex-1 items-center gap-1.5 py-1.5 text-left text-sm"
                >
                  <ChevronRight
                    className={cn(
                      "text-muted-foreground h-3.5 w-3.5 shrink-0 transition-transform",
                      isOpen && "rotate-90",
                    )}
                  />
                  {isOpen ? (
                    <FolderOpen className="h-4 w-4 shrink-0 text-amber-500" />
                  ) : (
                    <Folder className="h-4 w-4 shrink-0 text-amber-500" />
                  )}
                  <span className="truncate">{f.name}</span>
                </button>
                {canManage && (
                  <RowMenu
                    items={[
                      {
                        icon: <FolderPlus className="h-4 w-4" />,
                        label: "新增子資料夾",
                        onSelect: () =>
                          setDialog({ kind: "newFolder", parentId: f.id }),
                      },
                      {
                        icon: <FilePlus className="h-4 w-4" />,
                        label: "新增文件",
                        onSelect: () =>
                          setDialog({ kind: "newPage", folderId: f.id }),
                      },
                      {
                        icon: <Pencil className="h-4 w-4" />,
                        label: "重新命名",
                        onSelect: () =>
                          setDialog({
                            kind: "renameFolder",
                            id: f.id,
                            name: f.name,
                          }),
                      },
                      {
                        icon: <Trash2 className="h-4 w-4" />,
                        label: "刪除",
                        destructive: true,
                        onSelect: () =>
                          setDialog({
                            kind: "deleteFolder",
                            id: f.id,
                            name: f.name,
                          }),
                      },
                    ]}
                  />
                )}
              </div>
              {isOpen && renderLevel(f.id, depth + 1)}
            </div>
          );
        })}
        {subPages.map((p, pi) => {
          const active = p.id === selectedId;
          return (
            <div
              key={p.id}
              draggable={canManage}
              onDragStart={
                canManage
                  ? (e) => {
                      e.dataTransfer.setData("text/plain", p.id);
                      e.dataTransfer.effectAllowed = "move";
                      setDragItem({ type: "page", id: p.id });
                    }
                  : undefined
              }
              onDragEnd={
                canManage
                  ? () => {
                      setDragItem(null);
                      setDragOver(null);
                    }
                  : undefined
              }
              onDragOver={
                dragItem
                  ? (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      e.dataTransfer.dropEffect = "move";
                      // 拖文件到文件上＝排序（前/後）；拖資料夾到文件上＝移進該文件所在資料夾。
                      setDragOver(
                        dragItem.type === "folder"
                          ? `${p.id}:into`
                          : `${p.id}:${computeZone(e, false)}`,
                      );
                    }
                  : undefined
              }
              onDragLeave={
                dragItem
                  ? (e) => {
                      if (!e.currentTarget.contains(e.relatedTarget as Node))
                        setDragOver((v) =>
                          v?.startsWith(`${p.id}:`) ? null : v,
                        );
                    }
                  : undefined
              }
              onDrop={
                dragItem
                  ? (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const item = dragItem;
                      if (item.type === "folder") {
                        moveFolder(item.id, p.folderId, null);
                      } else {
                        const zone = computeZone(e, false);
                        movePage(
                          item.id,
                          p.folderId,
                          zone === "before"
                            ? p.id
                            : (subPages[pi + 1]?.id ?? null),
                        );
                      }
                      setDragItem(null);
                      setDragOver(null);
                    }
                  : undefined
              }
              className={cn(
                "group hover:bg-muted/60 flex items-center rounded-md border-y-2 border-transparent pr-1",
                active && "bg-muted",
                canManage && "cursor-grab active:cursor-grabbing",
                dragItem?.type === "page" && dragItem.id === p.id && "opacity-50",
                dragOver === `${p.id}:into` &&
                  "ring-primary bg-primary/10 ring-2 ring-inset",
                dragOver === `${p.id}:before` && "!border-t-primary",
                dragOver === `${p.id}:after` && "!border-b-primary",
              )}
              style={{ paddingLeft: 6 + depth * INDENT + 18 }}
            >
              <button
                type="button"
                onClick={() => selectPage(p.id)}
                className={cn(
                  "flex min-w-0 flex-1 items-center gap-1.5 py-1.5 text-left text-sm",
                  active && "font-medium",
                )}
              >
                <FileText className="text-muted-foreground h-4 w-4 shrink-0" />
                <span className="truncate">{p.title}</span>
              </button>
              {canManage && (
                <RowMenu
                  items={[
                    {
                      icon: <Pencil className="h-4 w-4" />,
                      label: "重新命名",
                      onSelect: () =>
                        setDialog({
                          kind: "renamePage",
                          id: p.id,
                          name: p.title,
                        }),
                    },
                    {
                      icon: <Trash2 className="h-4 w-4" />,
                      label: "刪除",
                      destructive: true,
                      onSelect: () =>
                        setDialog({
                          kind: "deletePage",
                          id: p.id,
                          name: p.title,
                        }),
                    },
                  ]}
                />
              )}
            </div>
          );
        })}
      </>
    );
  }

  const isEmpty = foldersState.length === 0 && pagesState.length === 0;
  const q = search.trim().toLowerCase();
  const results = q
    ? pagesState.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.content.toLowerCase().includes(q),
      )
    : [];

  return (
    <div className="flex flex-col gap-4 lg:min-h-0 lg:flex-1 lg:flex-row">
      {/* 左：資料夾 / 文件樹 + 搜尋 */}
      <aside className="bg-card flex min-h-0 flex-col gap-2 rounded-xl border p-2.5 lg:w-[300px] lg:shrink-0">
        <div className="relative">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜尋文件名稱或內容…"
            className="pl-8"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2"
              aria-label="清除搜尋"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {canManage && !q && (
          <div className="flex gap-1.5">
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              onClick={() => setDialog({ kind: "newFolder", parentId: null })}
            >
              <FolderPlus className="h-4 w-4" /> 資料夾
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              onClick={() => setDialog({ kind: "newPage", folderId: null })}
            >
              <FilePlus className="h-4 w-4" /> 文件
            </Button>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto max-lg:max-h-[55vh]">
          {q ? (
            // 搜尋結果
            <div className="flex flex-col gap-0.5 py-1">
              <p className="text-muted-foreground px-2 pb-1 text-[11px]">
                找到 {results.length} 筆結果
              </p>
              {results.length === 0 ? (
                <p className="text-muted-foreground px-2 py-4 text-center text-sm">
                  查無符合「{search.trim()}」的文件。
                </p>
              ) : (
                results.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => selectPage(p.id)}
                    className={cn(
                      "hover:bg-muted/60 flex flex-col gap-0.5 rounded-md px-2 py-1.5 text-left",
                      p.id === selectedId && "bg-muted",
                    )}
                  >
                    <span className="flex items-center gap-1.5 text-sm font-medium">
                      <FileText className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{p.title}</span>
                    </span>
                    <span className="text-muted-foreground truncate pl-5 text-[11px]">
                      {folderPath(p.folderId)
                        .map((f) => f.name)
                        .join(" / ") || "根目錄"}
                    </span>
                    <span className="text-muted-foreground line-clamp-1 pl-5 text-[11px]">
                      {snippet(p.content, q)}
                    </span>
                  </button>
                ))
              )}
            </div>
          ) : isEmpty ? (
            <div className="text-muted-foreground px-2 py-8 text-center text-sm">
              <BookOpen className="mx-auto mb-2 h-6 w-6 opacity-50" />
              {canManage ? (
                <p>
                  還沒有任何文件。
                  <br />
                  用上方按鈕建立第一個資料夾或文件。
                </p>
              ) : (
                <p>目前尚無教育訓練文件。</p>
              )}
            </div>
          ) : (
            <div
              className={cn(
                "min-h-full rounded-md py-1",
                dragOver === "root" && "ring-primary bg-primary/5 ring-2 ring-inset",
              )}
              onDragOver={
                dragItem
                  ? (e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      setDragOver("root");
                    }
                  : undefined
              }
              onDrop={
                dragItem
                  ? (e) => {
                      e.preventDefault();
                      const item = dragItem;
                      if (item.type === "folder") moveFolder(item.id, null, null);
                      else movePage(item.id, null, null);
                      setDragItem(null);
                      setDragOver(null);
                    }
                  : undefined
              }
            >
              {renderLevel(null, 0)}
            </div>
          )}
        </div>
      </aside>

      {/* 右：文件檢視 / 編輯 */}
      <section className="bg-card flex min-h-0 flex-col rounded-xl border p-4 sm:p-6 max-lg:min-h-[62vh] lg:flex-1 lg:overflow-hidden">
        {editing && selectedId ? (
          <div className="flex flex-col gap-3 lg:min-h-0 lg:flex-1">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className="text-muted-foreground hidden text-xs font-medium sm:inline">
                  編輯中 · Markdown
                </span>
                {/* 小螢幕：編輯 / 預覽切換（大螢幕一律並排，不需要） */}
                <div className="flex rounded-md border p-0.5 lg:hidden">
                  <button
                    type="button"
                    onClick={() => setMobilePreview(false)}
                    className={cn(
                      "rounded px-2 py-0.5 text-xs",
                      !mobilePreview
                        ? "bg-muted font-medium"
                        : "text-muted-foreground",
                    )}
                  >
                    編輯
                  </button>
                  <button
                    type="button"
                    onClick={() => setMobilePreview(true)}
                    className={cn(
                      "rounded px-2 py-0.5 text-xs",
                      mobilePreview
                        ? "bg-muted font-medium"
                        : "text-muted-foreground",
                    )}
                  >
                    預覽
                  </button>
                </div>
              </div>
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditing(false)}
                  disabled={pending}
                >
                  取消
                </Button>
                <Button size="sm" onClick={saveEdit} disabled={pending}>
                  {pending ? "儲存中…" : "儲存"}
                </Button>
              </div>
            </div>
            <Input
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              placeholder="文件名稱"
              className="text-lg font-semibold"
            />
            {/* Markdown 工具列 */}
            <div className="flex flex-wrap items-center gap-0.5 rounded-md border p-1">
              <TbBtn title="粗體" onClick={() => wrapSelection("**", "**", "粗體")}>
                <Bold className="h-4 w-4" />
              </TbBtn>
              <TbBtn title="斜體" onClick={() => wrapSelection("*", "*", "斜體")}>
                <Italic className="h-4 w-4" />
              </TbBtn>
              <TbBtn title="行內程式碼" onClick={() => wrapSelection("`", "`", "程式碼")}>
                <span className="font-mono text-xs">{"</>"}</span>
              </TbBtn>
              <TbSep />
              <TbBtn title="大標題" onClick={() => prefixLines("# ")}>
                <Heading1 className="h-4 w-4" />
              </TbBtn>
              <TbBtn title="中標題" onClick={() => prefixLines("## ")}>
                <Heading2 className="h-4 w-4" />
              </TbBtn>
              <TbBtn title="小標題" onClick={() => prefixLines("### ")}>
                <Heading3 className="h-4 w-4" />
              </TbBtn>
              <TbSep />
              <TbBtn title="項目清單" onClick={() => prefixLines("- ")}>
                <List className="h-4 w-4" />
              </TbBtn>
              <TbBtn title="編號清單" onClick={() => prefixLines("1. ")}>
                <ListOrdered className="h-4 w-4" />
              </TbBtn>
              <TbBtn title="引言" onClick={() => prefixLines("> ")}>
                <Quote className="h-4 w-4" />
              </TbBtn>
              <TbSep />
              <TbBtn
                title="連結"
                onClick={() =>
                  wrapSelection("[", "](https://example.com)", "連結文字")
                }
              >
                <Link2 className="h-4 w-4" />
              </TbBtn>
              <TbBtn
                title="表格"
                onClick={() =>
                  insertBlock(
                    "| 欄位1 | 欄位2 | 欄位3 |\n| --- | --- | --- |\n| 內容 | 內容 | 內容 |\n",
                  )
                }
              >
                <Table className="h-4 w-4" />
              </TbBtn>
            </div>
            <div className="flex flex-col gap-3 lg:min-h-0 lg:flex-1 lg:flex-row">
              <Textarea
                ref={contentRef}
                value={draftContent}
                onChange={(e) => setDraftContent(e.target.value)}
                placeholder={"# 標題\n\n用 Markdown 撰寫內容…\n\n- 清單項目\n- **粗體** 與 *斜體*\n\n> 引言"}
                className={cn(
                  "min-h-[52vh] font-mono text-sm leading-relaxed lg:h-full lg:min-h-0 lg:flex-1 lg:resize-none",
                  mobilePreview && "max-lg:hidden",
                )}
              />
              <div
                className={cn(
                  "min-h-[52vh] overflow-y-auto rounded-md border p-4 lg:block lg:h-full lg:min-h-0 lg:flex-1",
                  mobilePreview ? "block" : "hidden",
                )}
              >
                {draftContent.trim() ? (
                  <div className="text-sm">
                    <Markdown content={draftContent} />
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">即時預覽…</p>
                )}
              </div>
            </div>
          </div>
        ) : selectedPage ? (
          <article className="flex flex-col lg:min-h-0 lg:flex-1">
            <div className="mb-3 flex shrink-0 items-start justify-between gap-3 border-b pb-3">
              <div className="min-w-0">
                {folderPath(selectedPage.folderId).length > 0 && (
                  <div className="text-muted-foreground mb-1 truncate text-xs">
                    {folderPath(selectedPage.folderId)
                      .map((f) => f.name)
                      .join(" / ")}
                  </div>
                )}
                <h1 className="text-2xl font-bold tracking-tight">
                  {selectedPage.title}
                </h1>
                <p className="text-muted-foreground mt-1 text-xs">
                  最後更新 {format(new Date(selectedPage.updatedAt), "yyyy/MM/dd HH:mm")}
                </p>
              </div>
              {canManage && (
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setDialog({ kind: "permission", page: selectedPage })
                    }
                    title="設定誰可以看這份文件"
                  >
                    <Lock className="h-4 w-4" />
                    {selectedPage.visibility === "RESTRICTED"
                      ? "權限（限定）"
                      : "權限"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => startEdit(selectedPage)}
                  >
                    <Pencil className="h-4 w-4" /> 編輯
                  </Button>
                </div>
              )}
            </div>
            <div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
              {selectedPage.content.trim() ? (
                <div className="text-sm">
                  <Markdown content={selectedPage.content} />
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">
                  這份文件還沒有內容。
                  {canManage && "點右上「編輯」開始撰寫。"}
                </p>
              )}
            </div>
          </article>
        ) : (
          <div className="text-muted-foreground flex min-h-[50vh] flex-1 flex-col items-center justify-center gap-2 text-center text-sm">
            <BookOpen className="h-8 w-8 opacity-40" />
            <p>從左側選擇一份文件開始閱讀。</p>
          </div>
        )}
      </section>

      {/* 對話框 */}
      <PromptDialog
        open={dialog?.kind === "newFolder"}
        title="新增資料夾"
        label="資料夾名稱"
        placeholder="例：新人報到"
        submitLabel="建立"
        pending={pending}
        onSubmit={submitDialog}
        onOpenChange={(o) => !o && setDialog(null)}
      />
      <PromptDialog
        open={dialog?.kind === "newPage"}
        title="新增文件"
        label="文件名稱"
        placeholder="例：公司簡介"
        submitLabel="建立"
        pending={pending}
        onSubmit={submitDialog}
        onOpenChange={(o) => !o && setDialog(null)}
      />
      <PromptDialog
        open={dialog?.kind === "renameFolder"}
        title="重新命名資料夾"
        label="資料夾名稱"
        defaultValue={dialog?.kind === "renameFolder" ? dialog.name : ""}
        submitLabel="儲存"
        pending={pending}
        onSubmit={submitDialog}
        onOpenChange={(o) => !o && setDialog(null)}
      />
      <PromptDialog
        open={dialog?.kind === "renamePage"}
        title="重新命名文件"
        label="文件名稱"
        defaultValue={dialog?.kind === "renamePage" ? dialog.name : ""}
        submitLabel="儲存"
        pending={pending}
        onSubmit={submitDialog}
        onOpenChange={(o) => !o && setDialog(null)}
      />
      <ConfirmDialog
        open={dialog?.kind === "deleteFolder"}
        title="刪除資料夾"
        description={
          dialog?.kind === "deleteFolder"
            ? `確定要刪除「${dialog.name}」？其中的子資料夾與所有文件都會一併永久刪除。`
            : undefined
        }
        pending={pending}
        onConfirm={confirmDelete}
        onOpenChange={(o) => !o && setDialog(null)}
      />
      <ConfirmDialog
        open={dialog?.kind === "deletePage"}
        title="刪除文件"
        description={
          dialog?.kind === "deletePage"
            ? `確定要刪除「${dialog.name}」？此動作無法復原。`
            : undefined
        }
        pending={pending}
        onConfirm={confirmDelete}
        onOpenChange={(o) => !o && setDialog(null)}
      />
      <PermissionDialog
        key={dialog?.kind === "permission" ? dialog.page.id : "none"}
        open={dialog?.kind === "permission"}
        page={dialog?.kind === "permission" ? dialog.page : null}
        members={members}
        pending={pending}
        onSave={savePermission}
        onOpenChange={(o) => !o && setDialog(null)}
      />
    </div>
  );
}

/** 設定某文件由誰可見（所有人 / 只有指定的人；管理者一律可見）。 */
function PermissionDialog({
  open,
  page,
  members,
  pending,
  onSave,
  onOpenChange,
}: {
  open: boolean;
  page: DocPage | null;
  members: DocMember[];
  pending: boolean;
  onSave: (visibility: "ALL" | "RESTRICTED", allowedUserIds: string[]) => void;
  onOpenChange: (o: boolean) => void;
}) {
  const [mode, setMode] = useState<"ALL" | "RESTRICTED">(
    page?.visibility === "RESTRICTED" ? "RESTRICTED" : "ALL",
  );
  const [ids, setIds] = useState<Set<string>>(
    () => new Set(page?.allowedUserIds ?? []),
  );
  function toggle(id: string) {
    setIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>誰可以看「{page?.title}」</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <label className="hover:bg-muted/40 flex cursor-pointer items-start gap-2 rounded-md p-2 text-sm">
            <input
              type="radio"
              name="doc-vis"
              checked={mode === "ALL"}
              onChange={() => setMode("ALL")}
              className="accent-primary mt-0.5 h-4 w-4"
            />
            <span>
              <span className="font-medium">所有人可見</span>
              <span className="text-muted-foreground block text-xs">
                預設；組織內每個人都看得到。
              </span>
            </span>
          </label>
          <label className="hover:bg-muted/40 flex cursor-pointer items-start gap-2 rounded-md p-2 text-sm">
            <input
              type="radio"
              name="doc-vis"
              checked={mode === "RESTRICTED"}
              onChange={() => setMode("RESTRICTED")}
              className="accent-primary mt-0.5 h-4 w-4"
            />
            <span>
              <span className="font-medium">只有指定的人可見</span>
              <span className="text-muted-foreground block text-xs">
                不勾任何人＝只有管理者看得到；勾選則額外開放給那些人。
              </span>
            </span>
          </label>

          {mode === "RESTRICTED" && (
            <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border p-2">
              {members.length === 0 ? (
                <p className="text-muted-foreground p-1 text-xs">沒有其他成員。</p>
              ) : (
                members.map((m) => (
                  <label
                    key={m.id}
                    className="hover:bg-muted/40 flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={ids.has(m.id)}
                      onChange={() => toggle(m.id)}
                      className="accent-primary h-4 w-4"
                    />
                    <span className="min-w-0 truncate">
                      {m.name || m.email}
                    </span>
                  </label>
                ))
              )}
            </div>
          )}

          <p className="text-muted-foreground text-xs">
            ※ 管理者一律看得到，不受此設定影響。
          </p>
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            取消
          </Button>
          <Button onClick={() => onSave(mode, [...ids])} disabled={pending}>
            {pending ? "儲存中…" : "儲存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Markdown 工具列按鈕 / 分隔線。
function TbBtn({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      // 用 onMouseDown + preventDefault 保住 textarea 的選取（不讓按鈕搶走焦點）。
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      className="text-muted-foreground hover:bg-muted hover:text-foreground flex h-8 w-8 items-center justify-center rounded"
    >
      {children}
    </button>
  );
}

function TbSep() {
  return <span className="bg-border mx-1 h-5 w-px shrink-0" />;
}

// 樹狀列右側的操作選單（新增 / 重新命名 / 刪除）。
function RowMenu({
  items,
}: {
  items: {
    icon: React.ReactNode;
    label: string;
    onSelect: () => void;
    destructive?: boolean;
  }[];
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="操作"
        className="text-muted-foreground hover:bg-muted hover:text-foreground flex h-6 w-6 shrink-0 items-center justify-center rounded opacity-60 transition group-hover:opacity-100 aria-expanded:opacity-100"
      >
        <MoreHorizontal className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {items.map((it, idx) => (
          <div key={it.label}>
            {it.destructive && idx > 0 && <DropdownMenuSeparator />}
            <DropdownMenuItem
              onClick={it.onSelect}
              className={cn(
                "gap-2",
                it.destructive && "text-destructive focus:text-destructive",
              )}
            >
              {it.icon}
              {it.label}
            </DropdownMenuItem>
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** 依搜尋字取內容片段（前後留一點上下文）。 */
function snippet(content: string, q: string): string {
  const text = content.replace(/\s+/g, " ").trim();
  if (!text) return "";
  const idx = text.toLowerCase().indexOf(q);
  if (idx < 0) return text.slice(0, 80);
  const start = Math.max(0, idx - 24);
  return (start > 0 ? "…" : "") + text.slice(start, start + 80);
}
