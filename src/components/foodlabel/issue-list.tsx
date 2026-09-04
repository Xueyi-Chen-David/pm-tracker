"use client";

import { AlertCircle, AlertTriangle, Info } from "lucide-react";
import type { ComplianceIssue } from "@/lib/foodlabel/types";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const LEVEL = {
  error: { text: "不合規", icon: AlertCircle, box: "border-destructive/40 bg-destructive/5" },
  warning: { text: "需確認", icon: AlertTriangle, box: "border-amber-500/40 bg-amber-500/5" },
  info: { text: "提醒", icon: Info, box: "border-border bg-muted/40" },
} as const;

const ORDER = { error: 0, warning: 1, info: 2 } as const;

/** 合規檢查結果：不合規 → 需確認 → 提醒。 */
export function IssueList({ issues }: { issues: ComplianceIssue[] }) {
  const sorted = [...issues].sort((a, b) => ORDER[a.level] - ORDER[b.level]);
  const errors = issues.filter((i) => i.level === "error").length;
  const warnings = issues.filter((i) => i.level === "warning").length;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {errors === 0 ? (
          <Badge variant="secondary">強制項目齊備</Badge>
        ) : (
          <Badge variant="destructive">{errors} 項不合規</Badge>
        )}
        {warnings > 0 && <Badge variant="outline">{warnings} 項需人工確認</Badge>}
        <span className="text-muted-foreground text-xs">
          本檢查只涵蓋營養標示；品名、成分、食品添加物、過敏原、有效日期等中文標示不在範圍內。
        </span>
      </div>

      <div className="space-y-2">
        {sorted.map((issue, i) => {
          const cfg = LEVEL[issue.level];
          const Icon = cfg.icon;
          return (
            <div
              key={`${issue.code}-${i}`}
              className={cn("rounded-lg border p-3", cfg.box)}
            >
              <div className="flex items-start gap-2">
                <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">
                    <span className="text-muted-foreground mr-1.5 text-xs">
                      [{cfg.text}]
                    </span>
                    {issue.title}
                  </p>
                  <p className="text-muted-foreground mt-0.5 text-sm">
                    {issue.detail}
                  </p>
                  {issue.basis && (
                    <p className="text-muted-foreground mt-1 text-xs">
                      法規依據：{issue.basis}
                    </p>
                  )}
                  {issue.action && (
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      建議：{issue.action}
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
