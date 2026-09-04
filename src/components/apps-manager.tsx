"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Check, Download, Power, Trash2, ExternalLink } from "lucide-react";
import {
  installModule,
  setModuleEnabled,
  uninstallModule,
} from "@/server/actions/modules";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type ModuleStatus = "uninstalled" | "enabled" | "disabled";

export type AppsManagerModule = {
  key: string;
  label: string;
  href: string;
  description: string;
  dependsOn: string[];
  status: ModuleStatus;
  installedAt: string | null;
};

export type AppsManagerGroup = {
  category: string;
  modules: AppsManagerModule[];
};

/**
 * 應用程式安裝清單。每張卡片＝一個模組，狀態三選一：
 * 未安裝 / 已啟用 / 已停用（安裝著但關掉，資料保留）。
 * 只有 OWNER / ADMIN（canManage）才看得到操作按鈕，其他人是唯讀。
 */
export function AppsManager({
  groups,
  canManage,
}: {
  groups: AppsManagerGroup[];
  canManage: boolean;
}) {
  return (
    <div className="space-y-8">
      {groups.map((group) => (
        <section key={group.category}>
          <h2 className="text-muted-foreground mb-3 text-xs font-semibold tracking-wide uppercase">
            {group.category}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {group.modules.map((m) => (
              <ModuleCard key={m.key} module={m} canManage={canManage} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function ModuleCard({
  module: m,
  canManage,
}: {
  module: AppsManagerModule;
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<ModuleStatus>(m.status);

  function run(
    fn: () => Promise<{ ok: true } | { ok: false; error: string }>,
    next: ModuleStatus,
    okMessage: string,
  ) {
    start(async () => {
      try {
        const res = await fn();
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        setStatus(next);
        toast.success(okMessage);
        // 側欄在根版面算出來，安裝後要 refresh 才會立刻出現 / 消失。
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "操作失敗");
      }
    });
  }

  const installed = status !== "uninstalled";

  return (
    <div
      className={cn(
        "flex flex-col rounded-lg border p-4 transition-colors",
        status === "enabled" ? "bg-card" : "bg-muted/30",
      )}
    >
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <h3 className="font-semibold">{m.label}</h3>
        <StatusBadge status={status} />
      </div>
      <p className="text-muted-foreground flex-1 text-sm">{m.description}</p>

      {m.dependsOn.length > 0 && (
        <p className="text-muted-foreground mt-2 text-xs">
          需先安裝：{m.dependsOn.join("、")}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {!canManage ? (
          <span className="text-muted-foreground text-xs">
            僅組織擁有者 / 管理員可變更
          </span>
        ) : status === "uninstalled" ? (
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              run(() => installModule(m.key), "enabled", `已安裝「${m.label}」`)
            }
          >
            <Download className="h-4 w-4" /> 安裝
          </Button>
        ) : (
          <>
            <Button
              size="sm"
              variant={status === "enabled" ? "outline" : "default"}
              disabled={pending}
              onClick={() =>
                run(
                  () => setModuleEnabled(m.key, status !== "enabled"),
                  status === "enabled" ? "disabled" : "enabled",
                  status === "enabled"
                    ? `已停用「${m.label}」`
                    : `已啟用「${m.label}」`,
                )
              }
            >
              <Power className="h-4 w-4" />
              {status === "enabled" ? "停用" : "啟用"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              className="text-muted-foreground hover:text-destructive"
              onClick={() => {
                if (
                  !confirm(
                    `確定移除「${m.label}」的安裝嗎？\n\n模組已建立的資料會保留，重新安裝即可回復；成員在側欄將看不到這一頁。`,
                  )
                )
                  return;
                run(
                  () => uninstallModule(m.key),
                  "uninstalled",
                  `已移除「${m.label}」`,
                );
              }}
            >
              <Trash2 className="h-4 w-4" /> 移除
            </Button>
          </>
        )}

        {status === "enabled" && (
          <Link
            href={m.href}
            className="text-muted-foreground hover:text-foreground ml-auto inline-flex items-center gap-1 text-xs"
          >
            前往 <ExternalLink className="h-3 w-3" />
          </Link>
        )}
      </div>

      {installed && m.installedAt && (
        <p className="text-muted-foreground mt-2 text-[11px]">
          安裝於 {new Date(m.installedAt).toLocaleDateString("zh-TW")}
        </p>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: ModuleStatus }) {
  if (status === "enabled") {
    return (
      <Badge variant="secondary" className="shrink-0 gap-1">
        <Check className="h-3 w-3" /> 已啟用
      </Badge>
    );
  }
  if (status === "disabled") {
    return (
      <Badge variant="outline" className="shrink-0">
        已停用
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-muted-foreground shrink-0">
      未安裝
    </Badge>
  );
}
