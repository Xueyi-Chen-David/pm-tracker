"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, X, Trash2 } from "lucide-react";
import {
  decideLeaveApproval,
  deleteLeaveRequest,
} from "@/server/actions/leave-requests";
import type { LeaveRequestRow, LeaveQuotaOverview } from "@/server/queries";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { LeaveApprovalFlowManager } from "@/components/leave/leave-approval-flow-manager";
import { LeaveQuotaPanel } from "@/components/leave/leave-quota-panel";
import { RequestCard, Empty } from "@/components/leave/request-card";

type MemberOption = { membershipId: string; label: string };
type FlowStep = {
  approverType: "MANAGER" | "MEMBER";
  approverMemberId: string | null;
};

/**
 * 請假簽核頁：只放「別人要我做的事」——待我簽核，以及 HR 的全體檢視 / 額度 / 流程設定。
 *
 * 送出自己的請假、登記出差 / 事件已搬到「打卡 / 請假 / 出差」頁（個人差勤一站式），
 * 所以這頁對純簽核者而言就只有一個「待我簽核」分頁。
 */
export function LeaveWorkspace({
  pending,
  isEligibleApprover,
  allRequests,
  canManageLeave,
  flowSteps,
  members,
  quota,
  quotaYear,
}: {
  pending: LeaveRequestRow[];
  isEligibleApprover: boolean;
  allRequests: LeaveRequestRow[] | null;
  canManageLeave: boolean;
  flowSteps: FlowStep[] | null;
  members: MemberOption[] | null;
  quota: LeaveQuotaOverview | null;
  quotaYear: number;
}) {
  // 只有「簽核流程有設定到他」的人才會看到「待我簽核」——一般成員不該看到這個分頁。
  // pending.length > 0 額外保底：即使流程設定已異動，手上還卡著舊分派的簽核仍要能處理。
  const showPendingTab = isEligibleApprover || pending.length > 0;
  return (
    <Tabs defaultValue={showPendingTab ? "pending" : "all"} className="gap-4">
      <TabsList className="h-9">
        {showPendingTab && (
          <TabsTrigger value="pending" className="px-3">
            待我簽核
            {pending.length > 0 && (
              <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">
                {pending.length}
              </span>
            )}
          </TabsTrigger>
        )}
        {canManageLeave && (
          <>
            <TabsTrigger value="all" className="px-3">
              全體請假
            </TabsTrigger>
            <TabsTrigger value="quota" className="px-3">
              特休 / 額度
            </TabsTrigger>
            <TabsTrigger value="flow" className="px-3">
              簽核流程
            </TabsTrigger>
          </>
        )}
      </TabsList>

      {/* 待我簽核 */}
      {showPendingTab && (
        <TabsContent value="pending" className="space-y-3">
          {pending.length === 0 ? (
            <Empty text="目前沒有輪到你簽核的請假申請。" />
          ) : (
            pending.map((r) => (
              <RequestCard
                key={r.id}
                req={r}
                showRequester
                footer={<ApprovalActions requestId={r.id} />}
              />
            ))
          )}
        </TabsContent>
      )}

      {/* 全體請假（HR） */}
      {canManageLeave && (
        <TabsContent value="all" className="space-y-3">
          {!allRequests || allRequests.length === 0 ? (
            <Empty text="尚無任何請假申請。" />
          ) : (
            allRequests.map((r) => (
              <RequestCard
                key={r.id}
                req={r}
                showRequester
                footer={<DeleteRequestButton id={r.id} status={r.status} />}
              />
            ))
          )}
        </TabsContent>
      )}

      {/* 特休 / 額度總覽（HR） */}
      {canManageLeave && quota && (
        <TabsContent value="quota">
          <LeaveQuotaPanel quota={quota} year={quotaYear} />
        </TabsContent>
      )}

      {/* 簽核流程設定（HR） */}
      {canManageLeave && (
        <TabsContent value="flow">
          <LeaveApprovalFlowManager
            initialSteps={flowSteps ?? []}
            members={members ?? []}
            canManage={canManageLeave}
          />
        </TabsContent>
      )}
    </Tabs>
  );
}

/** 「待我簽核」的核准 / 駁回動作（附意見輸入）。 */
function ApprovalActions({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [decision, setDecision] = useState<null | "APPROVE" | "REJECT">(null);
  const [comment, setComment] = useState("");
  const [pending, start] = useTransition();

  function run() {
    if (!decision) return;
    start(async () => {
      try {
        await decideLeaveApproval({
          requestId,
          decision,
          comment: comment.trim() || undefined,
        });
        toast.success(decision === "APPROVE" ? "已核准" : "已駁回");
        setDecision(null);
        setComment("");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "操作失敗");
      }
    });
  }

  return (
    <>
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={() => {
            setComment("");
            setDecision("APPROVE");
          }}
          className="gap-1"
        >
          <Check className="h-4 w-4" /> 核准
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setComment("");
            setDecision("REJECT");
          }}
          className="gap-1 text-rose-600"
        >
          <X className="h-4 w-4" /> 駁回
        </Button>
      </div>
      <Dialog open={!!decision} onOpenChange={(o) => !o && setDecision(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {decision === "APPROVE" ? "核准這筆請假" : "駁回這筆請假"}
            </DialogTitle>
            <DialogDescription>
              {decision === "APPROVE"
                ? "核准後將交給下一關簽核；若這是最後一關，會直接登記到出席月曆。"
                : "駁回後流程結束，申請人會收到通知。"}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="附上意見（選填）"
            rows={3}
            maxLength={1000}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDecision(null)}
              disabled={pending}
            >
              取消
            </Button>
            <Button
              onClick={run}
              disabled={pending}
              variant={decision === "REJECT" ? "destructive" : "default"}
            >
              {decision === "APPROVE" ? "確認核准" : "確認駁回"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** 管理員（leave.manage）刪除一筆請假簽核紀錄；已核准者提醒出席月曆需另行調整。 */
function DeleteRequestButton({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="ghost"
      className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
      disabled={pending}
      onClick={() => {
        const warn =
          status === "APPROVED"
            ? "確定刪除這筆「已核准」的請假簽核紀錄？\n\n注意：已登記到出席月曆的請假日不會一併移除，如需撤銷請另於「出席狀況」調整該員月曆。此動作無法復原。"
            : "確定刪除這筆請假簽核紀錄？此動作無法復原。";
        if (!confirm(warn)) return;
        start(async () => {
          try {
            await deleteLeaveRequest(id);
            toast.success("已刪除簽核紀錄");
            router.refresh();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "刪除失敗");
          }
        });
      }}
    >
      <Trash2 className="h-4 w-4" /> 刪除
    </Button>
  );
}
