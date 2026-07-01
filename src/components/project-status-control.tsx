"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { SlidersHorizontal } from "lucide-react";
import type { Health, ProjectStatus } from "@prisma/client";
import {
  setProjectCountInProgress,
  setProjectStatusHealth,
} from "@/server/actions/projects";
import { HEALTH_OPTIONS, PROJECT_STATUS_OPTIONS } from "@/lib/constants";
import { Switch } from "@/components/ui/switch";

const selectClass =
  "border-input bg-card dark:bg-input/30 h-8 rounded-lg border px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:opacity-50";

export function ProjectStatusControl({
  projectId,
  status,
  health,
  countInProgress,
}: {
  projectId: string;
  status: ProjectStatus;
  health: Health;
  countInProgress: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function update(patch: { status?: ProjectStatus; health?: Health }) {
    start(async () => {
      try {
        await setProjectStatusHealth({ projectId, ...patch });
        toast.success("已更新並記錄");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "更新失敗");
      }
    });
  }

  function toggleCount(next: boolean) {
    start(async () => {
      try {
        await setProjectCountInProgress({ projectId, countInProgress: next });
        toast.success(next ? "已計入完成度" : "已排除於完成度");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "更新失敗");
      }
    });
  }

  return (
    <div className="bg-muted/40 mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border px-3 py-2">
      <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs font-medium">
        <SlidersHorizontal className="h-3.5 w-3.5" /> 快速調整
      </span>
      <label className="text-muted-foreground flex items-center gap-1.5 text-xs">
        狀態
        <select
          value={status}
          disabled={pending}
          onChange={(e) => update({ status: e.target.value as ProjectStatus })}
          className={selectClass}
        >
          {PROJECT_STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <label className="text-muted-foreground flex items-center gap-1.5 text-xs">
        健康度
        <select
          value={health}
          disabled={pending}
          onChange={(e) => update({ health: e.target.value as Health })}
          className={selectClass}
        >
          {HEALTH_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <label className="text-muted-foreground flex cursor-pointer items-center gap-1.5 text-xs">
        <Switch
          checked={countInProgress}
          disabled={pending}
          onCheckedChange={(checked) => toggleCount(checked)}
        />
        計入完成度
      </label>
    </div>
  );
}
