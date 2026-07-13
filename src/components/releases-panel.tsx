"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Tag, Rocket, Clock } from "lucide-react";
import { createRelease, updateRelease, deleteRelease } from "@/server/actions/releases";
import { Markdown } from "@/lib/markdown";
import { fmtDate, toDateInput } from "@/lib/date";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type ReleaseStatus = "PLANNED" | "RELEASED";

export type ReleaseItem = {
  id: string;
  version: string;
  title: string | null;
  notes: string | null;
  status: ReleaseStatus;
  releasedAt: Date | string | null;
};

const inputSm =
  "border-input bg-transparent dark:bg-input/30 h-8 rounded-md border px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]";

function StatusChip({ status }: { status: ReleaseStatus }) {
  return status === "RELEASED" ? (
    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700">
      <Rocket className="h-3 w-3" /> 已發布
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">
      <Clock className="h-3 w-3" /> 規劃中
    </span>
  );
}

export function ReleasesPanel({
  projectId,
  releases,
  canEdit,
}: {
  projectId: string;
  releases: ReleaseItem[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  function run(fn: () => Promise<unknown>, okMsg?: string, after?: () => void) {
    start(async () => {
      try {
        await fn();
        after?.();
        if (okMsg) toast.success(okMsg);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "操作失敗");
      }
    });
  }

  return (
    <div className="space-y-3">
      {canEdit && !adding && (
        <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4" /> 新增版本
        </Button>
      )}

      {canEdit && adding && (
        <ReleaseForm
          pending={pending}
          onCancel={() => setAdding(false)}
          onSubmit={(v) =>
            run(
              () => createRelease({ projectId, ...v }),
              "已新增版本",
              () => setAdding(false),
            )
          }
        />
      )}

      {releases.length === 0 && !adding ? (
        <p className="text-muted-foreground py-2 text-sm">
          尚無版本紀錄。{canEdit && "點「新增版本」建立第一筆 changelog。"}
        </p>
      ) : (
        <ol className="relative space-y-4 pl-1">
          {releases.map((r) =>
            editingId === r.id ? (
              <li key={r.id}>
                <ReleaseForm
                  initial={r}
                  pending={pending}
                  onCancel={() => setEditingId(null)}
                  onSubmit={(v) =>
                    run(
                      () => updateRelease({ id: r.id, projectId, ...v }),
                      "已更新版本",
                      () => setEditingId(null),
                    )
                  }
                />
              </li>
            ) : (
              <li key={r.id} className="group relative border-l-2 pl-4">
                <span
                  className={cn(
                    "absolute top-1 -left-[7px] h-3 w-3 rounded-full border-2 border-background",
                    r.status === "RELEASED" ? "bg-emerald-500" : "bg-amber-400",
                  )}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 font-mono text-sm font-semibold">
                    <Tag className="h-3.5 w-3.5" /> {r.version}
                  </span>
                  <StatusChip status={r.status} />
                  {r.releasedAt && (
                    <span className="text-muted-foreground text-xs">
                      {fmtDate(r.releasedAt)}
                    </span>
                  )}
                  {canEdit && (
                    <span className="ml-auto flex items-center gap-0.5 opacity-60 transition group-hover:opacity-100">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="編輯"
                        disabled={pending}
                        onClick={() => setEditingId(r.id)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="刪除"
                        disabled={pending}
                        onClick={() => {
                          if (!confirm(`確定刪除版本 ${r.version} 嗎？此動作無法復原。`))
                            return;
                          run(() => deleteRelease({ id: r.id, projectId }), "已刪除");
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </span>
                  )}
                </div>
                {r.title && (
                  <p className="mt-1 text-sm font-medium">{r.title}</p>
                )}
                {r.notes && (
                  <div className="text-muted-foreground mt-1 text-sm">
                    <Markdown content={r.notes} />
                  </div>
                )}
              </li>
            ),
          )}
        </ol>
      )}
    </div>
  );
}

function ReleaseForm({
  initial,
  pending,
  onSubmit,
  onCancel,
}: {
  initial?: ReleaseItem;
  pending: boolean;
  onSubmit: (v: {
    version: string;
    title?: string;
    notes?: string;
    status: ReleaseStatus;
    releasedAt?: string;
  }) => void;
  onCancel: () => void;
}) {
  const [version, setVersion] = useState(initial?.version ?? "");
  const [status, setStatus] = useState<ReleaseStatus>(initial?.status ?? "RELEASED");
  const [releasedAt, setReleasedAt] = useState(toDateInput(initial?.releasedAt ?? null));
  const [title, setTitle] = useState(initial?.title ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");

  function submit() {
    if (!version.trim()) {
      toast.error("請輸入版本號");
      return;
    }
    onSubmit({
      version: version.trim(),
      title: title.trim() || undefined,
      notes: notes.trim() || undefined,
      status,
      releasedAt: releasedAt || undefined,
    });
  }

  return (
    <div className="bg-muted/30 space-y-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={version}
          onChange={(e) => setVersion(e.target.value)}
          placeholder="版本號（v1.2.0）"
          className="h-8 w-36 font-mono"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as ReleaseStatus)}
          className={inputSm}
          title="狀態"
        >
          <option value="RELEASED">已發布</option>
          <option value="PLANNED">規劃中</option>
        </select>
        <input
          type="date"
          value={releasedAt}
          onChange={(e) => setReleasedAt(e.target.value)}
          className={inputSm}
          title="發布日期"
        />
      </div>
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="摘要標題（選填，例：結帳流程改版）"
        className="h-8"
      />
      <Textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder={"變更說明（支援 Markdown）\n\n### 新增\n- …\n\n### 修正\n- …"}
        className="min-h-[7rem] font-mono text-sm"
      />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
          取消
        </Button>
        <Button size="sm" onClick={submit} disabled={pending || !version.trim()}>
          {pending ? "儲存中…" : initial ? "儲存" : "新增"}
        </Button>
      </div>
    </div>
  );
}
