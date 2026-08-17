import { CheckCircle2, XCircle, Clock } from "lucide-react";
import { displayName, type NameSource } from "@/lib/display";
import { fmtDate } from "@/lib/date";
import { cn } from "@/lib/utils";
import { approvalStatusMeta } from "@/lib/leave-approval";

export type ApprovalStepData = {
  id: string;
  sortOrder: number;
  status: string; // PENDING | APPROVED | REJECTED
  decidedAt: Date | string | null;
  approverMember: { id: string; user: NameSource };
};

/**
 * 逐關簽核流程的行內展示：請假申請與出差 / 事件登記共用（兩者結構一致，見
 * server/queries.ts 的 leaveRequestSelect / memberEventSelect）。
 *
 * 單一關卡＝打勾 / 叉叉圖示；多關卡則用編號圓點（已核准 / 已駁回）+ 時鐘圖示（待簽）區分順序。
 * 沒有任何關卡＝免簽核，直接生效（代他人登記 / 免簽核成員 / 組織未設定簽核流程）。
 */
export function ApprovalFlowInline({
  approvals,
  finalStatus,
}: {
  approvals: ApprovalStepData[];
  /** 整體狀態；CANCELLED 時不逐關細看，直接顯示「已取消」（事件目前沒有這個狀態）。 */
  finalStatus: string;
}) {
  if (finalStatus === "CANCELLED") {
    return <span className="text-muted-foreground text-xs">已取消</span>;
  }
  if (approvals.length === 0) {
    return (
      <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
        免簽核，直接生效
      </span>
    );
  }
  const multiStep = approvals.length > 1;
  return (
    <ol className="space-y-1">
      {approvals.map((a) => {
        const meta = approvalStatusMeta(a.status);
        return (
          <li key={a.id} className="flex flex-wrap items-center gap-1.5 text-xs">
            {a.status === "PENDING" ? (
              <Clock className="h-3.5 w-3.5 shrink-0 text-amber-500" />
            ) : a.status === "REJECTED" ? (
              multiStep ? (
                <StepDot n={a.sortOrder + 1} tone="rose" />
              ) : (
                <XCircle className="h-3.5 w-3.5 shrink-0 text-rose-500" />
              )
            ) : multiStep ? (
              <StepDot n={a.sortOrder + 1} tone="emerald" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
            )}
            <span className="font-medium">{displayName(a.approverMember.user)}</span>
            <span
              className={cn(
                "rounded-full border px-1.5 text-[10px] font-medium",
                meta.badge,
              )}
            >
              {meta.label}
            </span>
            {a.decidedAt && (
              <span className="text-muted-foreground">{fmtDate(a.decidedAt)}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function StepDot({ n, tone }: { n: number; tone: "emerald" | "rose" }) {
  return (
    <span
      className={cn(
        "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold text-white",
        tone === "emerald" ? "bg-emerald-500" : "bg-rose-500",
      )}
    >
      {n}
    </span>
  );
}
