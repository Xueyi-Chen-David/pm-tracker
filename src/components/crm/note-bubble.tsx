"use client";

import { Pencil, Trash2 } from "lucide-react";
import { primaryName, displayInitial } from "@/lib/display";
import { fmtDateTime } from "@/lib/date";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { RelativeTime } from "@/components/relative-time";
import type { OwnerLite } from "@/components/okr/key-result-row";

/**
 * 頭像 + 留言泡泡的共用元件——企業進度備註、商機活動/跟進共用同一份視覺，
 * 兩個地方都是「誰、何時、留了什麼」的同一種資料形狀，沒必要各刻一份 UI。
 * headerBadge／extraActions／leading 是各自場景才需要的額外資訊（活動類型
 * 徽章、待辦勾選、回覆按鈕⋯）留的擴充點。
 */
export function NoteBubble({
  author,
  createdAt,
  updatedAt,
  body,
  pending,
  small = false,
  strikethrough = false,
  editing,
  editBody,
  onEditBodyChange,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  headerBadge,
  extraActions,
  leading,
}: {
  author: OwnerLite | null;
  createdAt: Date | string;
  /** 沒有編輯概念（如舊資料）就不傳，不會顯示「已編輯」。 */
  updatedAt?: Date | string;
  body: string;
  pending: boolean;
  small?: boolean;
  /** 已完成的待辦：內容加刪除線。 */
  strikethrough?: boolean;
  editing: boolean;
  editBody: string;
  onEditBodyChange: (v: string) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onDelete: () => void;
  /** 例如活動類型徽章（📞 電話）。顯示在姓名旁邊。 */
  headerBadge?: React.ReactNode;
  /** 例如「回覆」按鈕。顯示在編輯／刪除左邊，同一排。 */
  extraActions?: React.ReactNode;
  /** 例如待辦勾選框。顯示在頭像最左邊。 */
  leading?: React.ReactNode;
}) {
  const edited =
    updatedAt !== undefined &&
    new Date(updatedAt).getTime() !== new Date(createdAt).getTime();

  return (
    <div className="group flex items-start gap-2">
      {leading}
      <Avatar className={small ? "h-5 w-5 shrink-0" : "h-6 w-6 shrink-0"}>
        {author?.image && <AvatarImage src={author.image} alt="" />}
        <AvatarFallback className={small ? "text-[8px]" : "text-[9px]"}>
          {displayInitial(author)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-1.5">
          <span className="text-xs font-medium">
            {author ? primaryName(author) : "—"}
          </span>
          {headerBadge}
          <span
            className="text-muted-foreground text-[11px]"
            title={fmtDateTime(createdAt)}
          >
            <RelativeTime iso={new Date(createdAt).toISOString()} />
            {edited && " · 已編輯"}
          </span>
          <span className="ml-auto flex items-center gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
            {extraActions}
            <button
              type="button"
              disabled={pending}
              onClick={onStartEdit}
              title="編輯"
              className="text-muted-foreground hover:text-foreground disabled:opacity-60"
            >
              <Pencil className="h-3 w-3" />
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={onDelete}
              title="刪除"
              className="text-muted-foreground hover:text-destructive disabled:opacity-60"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </span>
        </div>

        {editing ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onSaveEdit();
            }}
            className="mt-1 flex gap-1.5"
          >
            <input
              autoFocus
              value={editBody}
              onChange={(e) => onEditBodyChange(e.target.value)}
              className="border-input h-7 flex-1 rounded-md border bg-transparent px-2 text-xs outline-none focus:border-ring"
            />
            <Button
              type="submit"
              size="sm"
              className="h-7 px-2 text-xs"
              disabled={pending || !editBody.trim()}
            >
              儲存
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              disabled={pending}
              onClick={onCancelEdit}
            >
              取消
            </Button>
          </form>
        ) : (
          <div
            className={cn(
              "bg-muted/60 mt-0.5 inline-block rounded-lg rounded-tl-none px-2.5 py-1.5 text-sm break-words whitespace-pre-wrap",
              small && "text-xs",
              strikethrough && "text-muted-foreground line-through",
            )}
          >
            {body}
          </div>
        )}
      </div>
    </div>
  );
}
