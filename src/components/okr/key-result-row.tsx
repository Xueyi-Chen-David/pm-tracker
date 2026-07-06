"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Link2, MoreHorizontal, Trash2 } from "lucide-react";
import {
  updateKeyResult,
  setKrOwners,
  deleteKeyResult,
} from "@/server/actions/okr";
import { KR_STATUS, resolveKr } from "@/lib/okr";
import { cn } from "@/lib/utils";
import { displayInitial } from "@/lib/display";
import { MemberName } from "@/components/member-name";
import { HealthDot } from "@/components/badges";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { Health, KrStatus, ProjectStatus } from "@prisma/client";

export type OwnerLite = {
  id: string;
  name: string | null;
  nickname: string | null;
  useNickname: boolean;
  email: string | null;
  image: string | null;
};
export type ProjectLite = {
  id: string;
  name: string;
  status: ProjectStatus;
  health: Health;
  progress: number;
};
export type KrView = {
  id: string;
  title: string;
  kind: string;
  note: string | null;
  dueDate: string | null;
  ownerLabel: string | null;
  status: KrStatus;
  health: Health;
  progress: number;
  project: ProjectLite | null;
  owners: OwnerLite[];
};

const HEALTH_CYCLE: Record<Health, Health> = {
  GREEN: "YELLOW",
  YELLOW: "RED",
  RED: "GREEN",
};

const inputCls =
  "border-input h-8 w-full rounded-md border bg-transparent px-2 text-sm outline-none focus:border-ring";

export function KeyResultRow({
  kr,
  members,
  projects,
}: {
  kr: KrView;
  members: OwnerLite[];
  projects: ProjectLite[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [ownerIds, setOwnerIds] = useState<Set<string>>(
    () => new Set(kr.owners.map((o) => o.id)),
  );

  const resolved = resolveKr(kr);

  function run(fn: () => Promise<void>) {
    start(async () => {
      try {
        await fn();
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "更新失敗");
      }
    });
  }

  function patch(data: Parameters<typeof updateKeyResult>[1]) {
    run(() => updateKeyResult(kr.id, data));
  }

  function toggleOwner(id: string, on: boolean) {
    const next = new Set(ownerIds);
    if (on) next.add(id);
    else next.delete(id);
    setOwnerIds(next);
    run(() => setKrOwners(kr.id, [...next]));
  }

  const isTodo = kr.kind === "todo";

  return (
    <tr className={cn("hover:bg-muted/30", pending && "opacity-60")}>
      {/* 名稱 */}
      <td className="py-1.5 pr-2 pl-3">
        <div className="flex items-center gap-2">
          {isTodo && (
            <span className="rounded bg-purple-100 px-1 text-[9px] font-bold text-purple-700">
              TODO
            </span>
          )}
          <input
            defaultValue={kr.title}
            onBlur={(e) => {
              const v = e.currentTarget.value.trim();
              if (v && v !== kr.title) patch({ title: v });
            }}
            className="min-w-0 flex-1 rounded-md bg-transparent px-1 py-0.5 text-sm font-medium outline-none hover:bg-muted/50 focus:bg-muted/50"
          />
          {resolved.linked && (
            <span
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700"
              title={`連動專案：${kr.project?.name}`}
            >
              <Link2 className="h-3 w-3" />
              {kr.project?.name}
            </span>
          )}
        </div>
      </td>

      {/* 負責人 */}
      <td className="px-2 py-1.5">
        <Popover>
          <PopoverTrigger className="hover:bg-muted flex items-center gap-1 rounded-md px-1 py-0.5">
            {kr.owners.length === 0 && !kr.ownerLabel ? (
              <span className="text-muted-foreground/60 text-xs">指派…</span>
            ) : (
              <span className="flex items-center">
                {kr.owners.slice(0, 3).map((o, i) => (
                  <Avatar
                    key={o.id}
                    className={cn("h-6 w-6 border-2 border-white", i > 0 && "-ml-2")}
                  >
                    {o.image && <AvatarImage src={o.image} alt="" />}
                    <AvatarFallback className="text-[9px]">
                      {displayInitial(o)}
                    </AvatarFallback>
                  </Avatar>
                ))}
                {kr.ownerLabel && (
                  <span className="text-muted-foreground ml-1.5 text-xs">
                    {kr.ownerLabel}
                  </span>
                )}
              </span>
            )}
          </PopoverTrigger>
          <PopoverContent align="start" className="w-60">
            <div className="text-sm font-medium">負責人</div>
            <div className="scroll-y max-h-56 space-y-0.5 overflow-y-auto">
              {members.map((m) => (
                <label
                  key={m.id}
                  className="hover:bg-muted flex items-center gap-2 rounded-md px-1.5 py-1 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={ownerIds.has(m.id)}
                    disabled={pending}
                    onChange={(e) => toggleOwner(m.id, e.currentTarget.checked)}
                    className="accent-primary h-4 w-4"
                  />
                  <MemberName u={m} className="min-w-0" />
                </label>
              ))}
            </div>
            <div className="space-y-1 border-t pt-2">
              <div className="text-muted-foreground text-xs">
                外部負責人（非成員，自由文字）
              </div>
              <input
                defaultValue={kr.ownerLabel ?? ""}
                placeholder="例：Also（律師）"
                onBlur={(e) => {
                  const v = e.currentTarget.value.trim();
                  if (v !== (kr.ownerLabel ?? "")) patch({ ownerLabel: v });
                }}
                className={inputCls}
              />
            </div>
          </PopoverContent>
        </Popover>
      </td>

      {/* 狀態 */}
      <td className="px-2 py-1.5">
        {resolved.linked ? (
          <span
            className={cn(
              "inline-block rounded-full border px-2 py-0.5 text-xs font-medium",
              KR_STATUS[resolved.status].badge,
            )}
          >
            {KR_STATUS[resolved.status].label}
          </span>
        ) : (
          <select
            value={kr.status}
            disabled={pending}
            onChange={(e) => patch({ status: e.currentTarget.value as KrStatus })}
            className={cn(
              "h-7 rounded-full border px-2 text-xs font-medium outline-none",
              KR_STATUS[kr.status].badge,
            )}
          >
            {(Object.keys(KR_STATUS) as KrStatus[]).map((s) => (
              <option key={s} value={s}>
                {KR_STATUS[s].label}
              </option>
            ))}
          </select>
        )}
      </td>

      {/* 進度 */}
      <td className="px-2 py-1.5">
        <div className="flex items-center gap-2">
          <div className="bg-muted h-1.5 w-16 overflow-hidden rounded-full">
            <div
              className="h-full rounded-full"
              style={{
                width: `${resolved.progress}%`,
                backgroundColor:
                  resolved.progress >= 100 ? "#10b981" : "#3b82f6",
              }}
            />
          </div>
          {resolved.linked ? (
            <span className="text-muted-foreground w-8 text-xs tabular-nums">
              {resolved.progress}%
            </span>
          ) : (
            <input
              type="number"
              min={0}
              max={100}
              defaultValue={kr.progress}
              disabled={pending}
              onBlur={(e) => {
                const v = Math.max(0, Math.min(100, Number(e.currentTarget.value) || 0));
                if (v !== kr.progress) patch({ progress: v });
              }}
              className="border-input h-7 w-12 rounded border bg-transparent px-1 text-xs outline-none"
            />
          )}
        </div>
      </td>

      {/* 健康度 RAG */}
      <td className="px-2 py-1.5 text-center">
        {resolved.linked ? (
          <HealthDot health={resolved.health} />
        ) : (
          <button
            type="button"
            disabled={pending}
            title="點擊切換 順利/注意/延宕"
            onClick={() => patch({ health: HEALTH_CYCLE[kr.health] })}
          >
            <HealthDot health={kr.health} />
          </button>
        )}
      </td>

      {/* 這週備註 */}
      <td className="px-2 py-1.5">
        <input
          defaultValue={kr.note ?? ""}
          placeholder="—"
          onBlur={(e) => {
            const v = e.currentTarget.value;
            if (v !== (kr.note ?? "")) patch({ note: v });
          }}
          className="w-full min-w-[8rem] rounded-md bg-transparent px-1 py-0.5 text-xs outline-none hover:bg-muted/50 focus:bg-muted/50"
        />
      </td>

      {/* ⋯ 選單 */}
      <td className="px-1 py-1.5 text-center">
        <Popover>
          <PopoverTrigger className="hover:bg-muted text-muted-foreground rounded-md p-1">
            <MoreHorizontal className="h-4 w-4" />
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64">
            <div className="space-y-1">
              <div className="text-muted-foreground text-xs">連動專案（即時抓狀態）</div>
              <select
                value={kr.project?.id ?? ""}
                disabled={pending}
                onChange={(e) =>
                  patch({ projectId: e.currentTarget.value || null })
                }
                className={inputCls}
              >
                <option value="">不連結（手動填）</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <div className="text-muted-foreground text-xs">類型</div>
                <select
                  value={kr.kind}
                  disabled={pending}
                  onChange={(e) =>
                    patch({ kind: e.currentTarget.value as "kr" | "todo" })
                  }
                  className={inputCls}
                >
                  <option value="kr">Key Result</option>
                  <option value="todo">Todo</option>
                </select>
              </div>
              <div className="space-y-1">
                <div className="text-muted-foreground text-xs">到期日</div>
                <input
                  type="date"
                  defaultValue={kr.dueDate ?? ""}
                  disabled={pending}
                  onChange={(e) => patch({ dueDate: e.currentTarget.value || null })}
                  className={inputCls}
                />
              </div>
            </div>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (confirm(`刪除 KR「${kr.title}」？`))
                  run(() => deleteKeyResult(kr.id));
              }}
              className="text-destructive hover:bg-destructive/10 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm"
            >
              <Trash2 className="h-4 w-4" /> 刪除 KR
            </button>
          </PopoverContent>
        </Popover>
      </td>
    </tr>
  );
}
