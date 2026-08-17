"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, X, Trash2, RotateCcw, ChevronDown } from "lucide-react";
import {
  decideLeaveApproval,
  deleteLeaveRequest,
  restoreLeaveRequest,
} from "@/server/actions/leave-requests";
import {
  decideMemberEventApproval,
  deleteMemberEvent,
} from "@/server/actions/member-events";
import type {
  LeaveRequestRow,
  LeaveQuotaOverview,
  AllMemberEventRow,
} from "@/server/queries";
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
import { Empty } from "@/components/leave/request-card";
import { ApprovalTable } from "@/components/leave/approval-table";
import { LeaveRequestTableRow } from "@/components/leave/leave-request-table-row";
import { MemberEventTableRow } from "@/components/leave/member-event-table-row";
import { RowActionsMenu } from "@/components/leave/row-actions-menu";
import { mergeTimeline } from "@/lib/leave-timeline";

type MemberOption = {
  membershipId: string;
  label: string;
  leaveApprovalExempt: boolean;
};
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
  pendingEvents,
  isEligibleApprover,
  allRequests,
  deletedRequests,
  allEvents,
  canManageLeave,
  flowSteps,
  members,
  quota,
  quotaYear,
}: {
  pending: LeaveRequestRow[];
  pendingEvents: AllMemberEventRow[];
  isEligibleApprover: boolean;
  allRequests: LeaveRequestRow[] | null;
  deletedRequests: LeaveRequestRow[] | null;
  allEvents: AllMemberEventRow[] | null;
  canManageLeave: boolean;
  flowSteps: FlowStep[] | null;
  members: MemberOption[] | null;
  quota: LeaveQuotaOverview | null;
  quotaYear: number;
}) {
  // 只有「簽核流程有設定到他」的人才會看到「待我簽核」——一般成員不該看到這個分頁。
  // pendingCount > 0 額外保底：即使流程設定已異動，手上還卡著舊分派的簽核仍要能處理。
  const pendingCount = pending.length + pendingEvents.length;
  const showPendingTab = isEligibleApprover || pendingCount > 0;
  const pendingTimeline = mergeTimeline(pending, pendingEvents);
  const allTimeline = mergeTimeline(allRequests ?? [], allEvents ?? []);

  return (
    <Tabs defaultValue={showPendingTab ? "pending" : "all"} className="gap-4">
      <TabsList className="h-9">
        {showPendingTab && (
          <TabsTrigger value="pending" className="px-3">
            待我簽核
            {pendingCount > 0 && (
              <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">
                {pendingCount}
              </span>
            )}
          </TabsTrigger>
        )}
        {canManageLeave && (
          <>
            <TabsTrigger value="all" className="px-3">
              全體請假 / 出差
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

      {/* 待我簽核：請假申請與出差 / 事件登記合併（兩者共用同一組簽核流程）。 */}
      {showPendingTab && (
        <TabsContent value="pending">
          {pendingTimeline.length === 0 ? (
            <Empty text="目前沒有輪到你簽核的請假 / 出差申請。" />
          ) : (
            <ApprovalTable showRequester requesterLabel="申請人">
              {pendingTimeline.map((entry) =>
                entry.kind === "leave" ? (
                  <LeaveRequestTableRow
                    key={`leave-${entry.data.id}`}
                    req={entry.data}
                    showRequester
                    actions={<ApprovalActions requestId={entry.data.id} />}
                  />
                ) : (
                  <MemberEventTableRow
                    key={`event-${entry.data.id}`}
                    ev={entry.data}
                    showRequester
                    actions={<EventApprovalActions eventId={entry.data.id} />}
                  />
                ),
              )}
            </ApprovalTable>
          )}
        </TabsContent>
      )}

      {/* 全體請假 / 出差（HR）——請假申請與出差 / 事件登記合併成同一條時間軸，
          不用分頭到兩個分頁查「誰現在不在辦公室」。新增登記仍在「打卡 / 請假 / 出差」
          頁做；這裡的 ⋮ 只有「刪除」——核准 / 駁回是「待我簽核」的事，且只有簽核鏈上
          真正輪到的那個人才能按（deleteMemberEvent 已放寬到 leave.manage 也能刪）。 */}
      {canManageLeave && (
        <TabsContent value="all" className="space-y-3">
          {allTimeline.length === 0 ? (
            <Empty text="尚無任何請假申請或出差 / 事件登記。" />
          ) : (
            <ApprovalTable showRequester>
              {allTimeline.map((entry) =>
                entry.kind === "leave" ? (
                  <LeaveRequestTableRow
                    key={`leave-${entry.data.id}`}
                    req={entry.data}
                    showRequester
                    actions={
                      <DeleteRequestMenuAction
                        id={entry.data.id}
                        status={entry.data.status}
                      />
                    }
                  />
                ) : (
                  <MemberEventTableRow
                    key={`event-${entry.data.id}`}
                    ev={entry.data}
                    showRequester
                    actions={
                      <DeleteEventMenuAction
                        id={entry.data.id}
                        userId={entry.data.user.id}
                        label={entry.data.type}
                      />
                    }
                  />
                ),
              )}
            </ApprovalTable>
          )}
          <DeletedRequestsSection deletedRequests={deletedRequests ?? []} />
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

type Decision = "APPROVE" | "REJECT";
type DecideResult = { ok: true } | { ok: false; error: string };

/**
 * 「待我簽核」的核准 / 駁回動作（附意見輸入）——請假申請與出差 / 事件登記共用同一顆元件，
 * 差別只在打哪個 server action（decide）與 dialog 文字（noun），避免兩份幾乎一樣的表單邏輯。
 */
function ApprovalDecisionActions({
  noun,
  decide,
}: {
  /** dialog 文案用的名詞，如「請假」「登記」。 */
  noun: string;
  decide: (input: { decision: Decision; comment?: string }) => Promise<DecideResult>;
}) {
  const router = useRouter();
  const [decision, setDecision] = useState<Decision | null>(null);
  const [comment, setComment] = useState("");
  const [pending, start] = useTransition();

  function run() {
    if (!decision) return;
    start(async () => {
      try {
        const res = await decide({ decision, comment: comment.trim() || undefined });
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
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
      <div className="flex justify-end gap-2">
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
              {decision === "APPROVE" ? `核准這筆${noun}` : `駁回這筆${noun}`}
            </DialogTitle>
            <DialogDescription>
              {decision === "APPROVE"
                ? "核准後將交給下一關簽核；若這是最後一關，會直接登記到出席月曆。"
                : "駁回後流程結束，登記人會收到通知。"}
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

/** 請假申請版：打 decideLeaveApproval。 */
function ApprovalActions({ requestId }: { requestId: string }) {
  return (
    <ApprovalDecisionActions
      noun="請假"
      decide={(input) => decideLeaveApproval({ requestId, ...input })}
    />
  );
}

/** 出差 / 事件版：打 decideMemberEventApproval。 */
function EventApprovalActions({ eventId }: { eventId: string }) {
  return (
    <ApprovalDecisionActions
      noun="登記"
      decide={(input) => decideMemberEventApproval({ eventId, ...input })}
    />
  );
}

/**
 * 管理員（leave.manage）刪除一筆請假簽核紀錄的 ⋮ 選單動作；已核准者提醒出席月曆需另行調整。
 * 軟刪除，可在下方「已刪除的申請」復原，不是真的永久移除。
 */
function DeleteRequestMenuAction({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [, start] = useTransition();
  return (
    <RowActionsMenu
      actions={[
        {
          label: "刪除",
          icon: <Trash2 className="h-4 w-4" />,
          destructive: true,
          onSelect: () => {
            const warn =
              status === "APPROVED"
                ? "確定刪除這筆「已核准」的請假簽核紀錄？\n\n注意：已登記到出席月曆的請假日不會一併移除，如需撤銷請另於「出席狀況」調整該員月曆。刪除後可在下方「已刪除的申請」復原。"
                : "確定刪除這筆請假簽核紀錄？刪除後可在下方「已刪除的申請」復原。";
            if (!confirm(warn)) return;
            start(async () => {
              try {
                const res = await deleteLeaveRequest(id);
                if (!res.ok) {
                  toast.error(res.error);
                  return;
                }
                toast.success("已刪除簽核紀錄（可於「已刪除的申請」復原）");
                router.refresh();
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "刪除失敗");
              }
            });
          },
        },
      ]}
    />
  );
}

/**
 * 管理員（leave.manage 或 attendance.manage）刪除一筆出差 / 事件登記的 ⋮ 選單動作。
 * 與請假不同，事件沒有軟刪除 / 復原機制——刪了就是真的刪了（見 deleteMemberEvent 註解），
 * 待簽核時等同撤回，已核准時會一併從出席月曆撤銷效果，故警語不提「可復原」。
 */
function DeleteEventMenuAction({
  id,
  userId,
  label,
}: {
  id: string;
  userId: string;
  label: string;
}) {
  const router = useRouter();
  const [, start] = useTransition();
  return (
    <RowActionsMenu
      actions={[
        {
          label: "刪除",
          icon: <Trash2 className="h-4 w-4" />,
          destructive: true,
          onSelect: () => {
            if (
              !confirm(
                `確定刪除「${label}」這筆事件登記？\n\n此動作無法復原；若已核准且影響出席月曆，會一併撤銷該效果。`,
              )
            )
              return;
            start(async () => {
              try {
                const res = await deleteMemberEvent({ id, userId });
                if (!res.ok) {
                  toast.error(res.error);
                  return;
                }
                toast.success("已刪除");
                router.refresh();
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "刪除失敗");
              }
            });
          },
        },
      ]}
    />
  );
}

/** 「已刪除的申請」：預設收合，展開後可逐筆復原（清空 deletedAt）。 */
function DeletedRequestsSection({
  deletedRequests,
}: {
  deletedRequests: LeaveRequestRow[];
}) {
  const [open, setOpen] = useState(false);
  if (deletedRequests.length === 0) return null;
  return (
    <div className="border-t pt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-muted-foreground flex items-center gap-1 text-sm hover:text-foreground"
      >
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? "" : "-rotate-90"}`} />
        已刪除的申請（{deletedRequests.length}）
      </button>
      {open && (
        <ApprovalTable showRequester>
          {deletedRequests.map((r) => (
            <LeaveRequestTableRow
              key={r.id}
              req={r}
              showRequester
              actions={<RestoreRequestButton id={r.id} />}
            />
          ))}
        </ApprovalTable>
      )}
    </div>
  );
}

/** 管理員（leave.manage）復原一筆先前刪除的請假申請。 */
function RestoreRequestButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() => {
        start(async () => {
          try {
            const res = await restoreLeaveRequest(id);
            if (!res.ok) {
              toast.error(res.error);
              return;
            }
            toast.success("已復原這筆請假申請");
            router.refresh();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "復原失敗");
          }
        });
      }}
    >
      <RotateCcw className="h-4 w-4" /> 復原
    </Button>
  );
}
