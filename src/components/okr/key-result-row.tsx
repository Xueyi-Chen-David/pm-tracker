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
import { DatePicker } from "@/components/ui/date-picker";
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

function autoSizeNote(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

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
  // 狀態 / 健康度 / 類型 / 進度 / 連動專案 / 負責人：改本地樂觀狀態，不要直接綁
  // kr.xxx prop。原本用 <select value={kr.status}> 這種寫法，onChange 送出 patch()
  // 後、伺服器還沒回應完成 router.refresh() 之前，kr.status 這個 prop 完全沒變，
  // controlled select 下一次 render（例如 useTransition 的 pending 一變 true 就會
  // 觸發）就會被 React 打回原本的舊值——使用者剛選的東西「瞬間跳回去」，看起來像
  // 沒反應／卡住，其實幾秒後 router.refresh() 完成就會自己修正，只是使用者早就以為
  // 壞了。改成先在本地立刻反映使用者的選擇，prop 之後跟上時再同步回來（處理其他人
  // 同時改動、或這次 patch 失敗要復原的情況）。
  //
  // 同步方式刻意不用 useEffect：那樣「prop 換了 → effect 觸發 → 再 setState」
  // 會多繞一輪、多一次 render，而且這個 repo 的 lint（react-hooks/set-state-in-effect）
  // 本來就禁止這種寫法。改用 React 官方文件建議的「render 期間比對 prop 是否換了
  // 一顆新物件、換了就直接同步呼叫 setState」，同一個 render pass 內完成，不多一輪。
  const [prevKr, setPrevKr] = useState(kr);
  const [status, setStatus] = useState(kr.status);
  const [health, setHealth] = useState(kr.health);
  const [kind, setKind] = useState(kr.kind);
  const [progress, setProgress] = useState(kr.progress);
  const [projectId, setProjectId] = useState(kr.project?.id ?? "");
  const [ownerIds, setOwnerIds] = useState<Set<string>>(
    () => new Set(kr.owners.map((o) => o.id)),
  );
  if (kr !== prevKr) {
    setPrevKr(kr);
    setStatus(kr.status);
    setHealth(kr.health);
    setKind(kr.kind);
    setProgress(kr.progress);
    setProjectId(kr.project?.id ?? "");
    setOwnerIds(new Set(kr.owners.map((o) => o.id)));
  }

  const selectedProject = projects.find((p) => p.id === projectId) ?? null;
  const resolved = resolveKr({ ...kr, status, health, progress, project: selectedProject });

  function run(
    fn: () => Promise<{ ok: boolean; error?: string } | void>,
  ) {
    start(async () => {
      try {
        const res = await fn();
        if (res && !res.ok) {
          toast.error(res.error ?? "更新失敗");
          return;
        }
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

  const isTodo = kind === "todo";

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
            value={status}
            disabled={pending}
            onChange={(e) => {
              const v = e.currentTarget.value as KrStatus;
              setStatus(v);
              patch({ status: v });
            }}
            className={cn(
              "h-7 rounded-full border px-2 text-xs font-medium outline-none",
              KR_STATUS[status].badge,
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
              value={progress}
              disabled={pending}
              onChange={(e) =>
                setProgress(Math.max(0, Math.min(100, Number(e.currentTarget.value) || 0)))
              }
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
            onClick={() => {
              const v = HEALTH_CYCLE[health];
              setHealth(v);
              patch({ health: v });
            }}
          >
            <HealthDot health={health} />
          </button>
        )}
      </td>

      {/* 這週備註 */}
      <td className="px-2 py-1.5 align-top">
        <textarea
          ref={autoSizeNote}
          defaultValue={kr.note ?? ""}
          placeholder="—"
          rows={1}
          onInput={(e) => autoSizeNote(e.currentTarget)}
          onBlur={(e) => {
            const v = e.currentTarget.value;
            if (v !== (kr.note ?? "")) patch({ note: v });
          }}
          className="block w-48 max-w-full resize-none overflow-hidden rounded-md bg-transparent px-1 py-0.5 text-xs leading-snug break-words whitespace-pre-wrap outline-none hover:bg-muted/50 focus:bg-muted/50"
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
                value={projectId}
                disabled={pending}
                onChange={(e) => {
                  const v = e.currentTarget.value;
                  setProjectId(v);
                  patch({ projectId: v || null });
                }}
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
                  value={kind}
                  disabled={pending}
                  onChange={(e) => {
                    const v = e.currentTarget.value as "kr" | "todo";
                    setKind(v);
                    patch({ kind: v });
                  }}
                  className={inputCls}
                >
                  <option value="kr">Key Result</option>
                  <option value="todo">Todo</option>
                </select>
              </div>
              <div className="space-y-1">
                <div className="text-muted-foreground text-xs">到期日</div>
                <DatePicker
                  defaultValue={kr.dueDate ?? ""}
                  disabled={pending}
                  size="sm"
                  placeholder="未設定"
                  ariaLabel="到期日"
                  onChange={(v) => patch({ dueDate: v || null })}
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
