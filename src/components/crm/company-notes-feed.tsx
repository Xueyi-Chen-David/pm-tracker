"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Reply, MessageSquare } from "lucide-react";
import {
  listCompanyNotes,
  addCompanyNote,
  updateCompanyNote,
  deleteCompanyNote,
} from "@/server/actions/crm";
import { primaryName } from "@/lib/display";
import { NoteBubble } from "@/components/crm/note-bubble";
import { Button } from "@/components/ui/button";
import type { OwnerLite } from "@/components/okr/key-result-row";

type NoteRow = {
  id: string;
  body: string;
  parentId: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  author: OwnerLite | null;
};

/**
 * 企業進度備註動態：整體關係追蹤，不綁定單一商機（跟商機裡的「活動/跟進」
 * 是分開的兩件事——那個只記跟這筆商機有關的紀錄）。每個人都可以留言記錄
 * 進度，可以在某則底下回覆（一層），也可以編輯內容。做成聊天串樣式，內容
 * 區獨立捲動＋固定高度，備註越留越多也不會把版面撐爆。
 * 自包含元件，掛載時自己抓資料，配合「展開才 mount」達到點開才查的效果。
 */
export function CompanyNotesFeed({ company }: { company: string }) {
  const [notes, setNotes] = useState<NoteRow[] | null>(null);
  const [pending, start] = useTransition();
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");

  function refresh() {
    listCompanyNotes(company)
      .then(setNotes)
      .catch(() => setNotes([]));
  }

  useEffect(() => {
    listCompanyNotes(company)
      .then(setNotes)
      .catch(() => setNotes([]));
  }, [company]);

  function submit(parentId: string | null, text: string, after: () => void) {
    const trimmed = text.trim();
    if (!trimmed) return;
    start(async () => {
      try {
        const res = await addCompanyNote({ company, body: trimmed, parentId });
        if (!res.ok) {
          toast.error(res.error ?? "新增失敗");
          return;
        }
        after();
        refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "新增失敗");
      }
    });
  }

  function saveEdit(id: string, text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    start(async () => {
      try {
        const res = await updateCompanyNote(id, trimmed);
        if (!res.ok) {
          toast.error(res.error ?? "更新失敗");
          return;
        }
        setEditingId(null);
        refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "更新失敗");
      }
    });
  }

  function remove(id: string) {
    start(async () => {
      try {
        await deleteCompanyNote(id);
        refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "刪除失敗");
      }
    });
  }

  const total = notes?.length ?? 0;
  const topLevel = notes?.filter((n) => !n.parentId) ?? [];
  const repliesOf = (id: string) => (notes ?? []).filter((n) => n.parentId === id);

  return (
    <div className="bg-card flex h-full min-h-0 flex-col rounded-md border">
      <div className="text-muted-foreground flex shrink-0 items-center gap-1.5 border-b px-3 py-2 text-xs font-medium">
        <MessageSquare className="h-3.5 w-3.5" />
        進度備註{total > 0 && ` (${total})`}
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {notes === null ? (
          <div className="text-muted-foreground text-xs">載入中…</div>
        ) : topLevel.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-xs">
            還沒有備註，留一則開始追蹤這間公司的整體進度。
          </p>
        ) : (
          topLevel.map((n) => (
            <div key={n.id} className="space-y-2">
              <NoteBubble
                author={n.author}
                createdAt={n.createdAt}
                updatedAt={n.updatedAt}
                body={n.body}
                pending={pending}
                editing={editingId === n.id}
                editBody={editBody}
                onEditBodyChange={setEditBody}
                onStartEdit={() => {
                  setEditingId(n.id);
                  setEditBody(n.body);
                }}
                onCancelEdit={() => setEditingId(null)}
                onSaveEdit={() => saveEdit(n.id, editBody)}
                onDelete={() => remove(n.id)}
                extraActions={
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => setReplyTo(replyTo === n.id ? null : n.id)}
                    title="回覆"
                    className="text-muted-foreground hover:text-foreground disabled:opacity-60"
                  >
                    <Reply className="h-3 w-3" />
                  </button>
                }
              />

              {repliesOf(n.id).map((r) => (
                <div key={r.id} className="pl-7">
                  <NoteBubble
                    author={r.author}
                    createdAt={r.createdAt}
                    updatedAt={r.updatedAt}
                    body={r.body}
                    pending={pending}
                    small
                    editing={editingId === r.id}
                    editBody={editBody}
                    onEditBodyChange={setEditBody}
                    onStartEdit={() => {
                      setEditingId(r.id);
                      setEditBody(r.body);
                    }}
                    onCancelEdit={() => setEditingId(null)}
                    onSaveEdit={() => saveEdit(r.id, editBody)}
                    onDelete={() => remove(r.id)}
                  />
                </div>
              ))}

              {replyTo === n.id && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    submit(n.id, replyBody, () => {
                      setReplyBody("");
                      setReplyTo(null);
                    });
                  }}
                  className="flex gap-2 pl-7"
                >
                  <input
                    autoFocus
                    value={replyBody}
                    onChange={(e) => setReplyBody(e.target.value)}
                    placeholder={`回覆 ${n.author ? primaryName(n.author) : "這則"}…`}
                    className="border-input h-8 flex-1 rounded-md border bg-transparent px-2 text-sm outline-none focus:border-ring"
                  />
                  <Button
                    type="submit"
                    size="sm"
                    disabled={pending || !replyBody.trim()}
                  >
                    回覆
                  </Button>
                </form>
              )}
            </div>
          ))
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(null, body, () => setBody(""));
        }}
        className="flex shrink-0 gap-2 border-t p-2"
      >
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="留一則進度備註…"
          className="border-input h-8 flex-1 rounded-md border bg-transparent px-2 text-sm outline-none focus:border-ring"
        />
        <Button type="submit" size="sm" disabled={pending || !body.trim()}>
          送出
        </Button>
      </form>
    </div>
  );
}
