"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Sparkles } from "lucide-react";
import { setOrgVision } from "@/server/actions/org-settings";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function VisionEditor({ vision }: { vision: string | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();

  function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const v = String(fd.get("vision") ?? "");
    start(async () => {
      try {
        await setOrgVision(v);
        setEditing(false);
        toast.success("已更新願景");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "儲存失敗");
      }
    });
  }

  return (
    <section className="from-primary/5 rounded-xl border bg-gradient-to-br to-transparent p-5">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-primary flex items-center gap-1.5 text-sm font-semibold">
          <Sparkles className="h-4 w-4" /> 公司願景 Vision
        </h2>
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-muted-foreground hover:bg-muted inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs"
          >
            <Pencil className="h-3 w-3" /> 編輯
          </button>
        )}
      </div>

      {editing ? (
        <form onSubmit={save} className="space-y-2">
          <Textarea
            name="vision"
            rows={3}
            autoFocus
            defaultValue={vision ?? ""}
            placeholder="用一兩句話寫下公司的長期願景，例如：成為日本中小企業導入 AI 的首選夥伴。"
          />
          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "儲存中…" : "儲存"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setEditing(false)}
              disabled={pending}
            >
              取消
            </Button>
          </div>
        </form>
      ) : vision ? (
        <p className="text-lg leading-relaxed font-medium whitespace-pre-wrap">
          {vision}
        </p>
      ) : (
        <p className="text-muted-foreground text-sm">
          尚未設定願景。點右上「編輯」寫下公司的長期方向，讓年度 / 季度 OKR 都朝它對齊。
        </p>
      )}
    </section>
  );
}
