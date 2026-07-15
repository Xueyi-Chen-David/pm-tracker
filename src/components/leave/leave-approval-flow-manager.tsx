"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowUp, ArrowDown, Trash2, Plus, Save, GitBranch } from "lucide-react";
import { setLeaveApprovalFlow } from "@/server/actions/leave";
import { APPROVER_TYPE_LABEL } from "@/lib/leave-approval";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type MemberOption = { membershipId: string; label: string };
type Step = { approverType: "MANAGER" | "MEMBER"; approverMemberId: string | null };

const inputCls =
  "border-input bg-transparent dark:bg-input/30 h-9 rounded-md border px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]";

/**
 * 請假簽核流程設定（HR / 管理者）：一組有序關卡，決定送出後依序由誰簽核。
 * 每關可選「直屬主管」(送出時動態解析) 或「指定成員」。唯讀模式僅顯示。
 */
export function LeaveApprovalFlowManager({
  initialSteps,
  members,
  canManage,
}: {
  initialSteps: Step[];
  members: MemberOption[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [steps, setSteps] = useState<Step[]>(initialSteps);
  const [pending, start] = useTransition();

  const dirty = JSON.stringify(steps) !== JSON.stringify(initialSteps);

  function update(i: number, patch: Partial<Step>) {
    setSteps((s) => s.map((st, idx) => (idx === i ? { ...st, ...patch } : st)));
  }
  function move(i: number, dir: -1 | 1) {
    setSteps((s) => {
      const j = i + dir;
      if (j < 0 || j >= s.length) return s;
      const next = [...s];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }
  function remove(i: number) {
    setSteps((s) => s.filter((_, idx) => idx !== i));
  }
  function add() {
    setSteps((s) => [...s, { approverType: "MANAGER", approverMemberId: null }]);
  }

  function save() {
    // 指定成員的關卡必須選人。
    for (const st of steps) {
      if (st.approverType === "MEMBER" && !st.approverMemberId) {
        toast.error("「指定成員」的關卡請選擇一位簽核人");
        return;
      }
    }
    start(async () => {
      try {
        await setLeaveApprovalFlow({
          steps: steps.map((s) => ({
            approverType: s.approverType,
            approverMemberId:
              s.approverType === "MEMBER" ? s.approverMemberId : null,
          })),
        });
        toast.success("已更新簽核流程");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "儲存失敗");
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          請假送出後，會依下列關卡「由上而下」逐關簽核；輪到哪一關，該關的簽核人就會收到通知，
          全部核准後才會登記到出席月曆。未設定任何關卡＝請假送出即自動核准。
        </p>
      </div>

      {steps.length === 0 ? (
        <div className="text-muted-foreground rounded-xl border border-dashed py-10 text-center text-sm">
          尚未設定簽核關卡。
          {canManage && "點下方「新增關卡」建立第一關（例如：直屬主管 → 人資）。"}
        </div>
      ) : (
        <ol className="space-y-2">
          {steps.map((st, i) => (
            <Card key={i} className="flex flex-wrap items-center gap-2 p-3">
              <span className="bg-primary/10 text-primary flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
                {i + 1}
              </span>
              {canManage ? (
                <>
                  <select
                    value={st.approverType}
                    onChange={(e) =>
                      update(i, {
                        approverType: e.target.value as Step["approverType"],
                        approverMemberId:
                          e.target.value === "MEMBER" ? st.approverMemberId : null,
                      })
                    }
                    className={inputCls}
                  >
                    <option value="MANAGER">直屬主管</option>
                    <option value="MEMBER">指定成員</option>
                  </select>
                  {st.approverType === "MEMBER" && (
                    <select
                      value={st.approverMemberId ?? ""}
                      onChange={(e) =>
                        update(i, { approverMemberId: e.target.value || null })
                      }
                      className={`${inputCls} min-w-40 flex-1`}
                    >
                      <option value="">選擇簽核人…</option>
                      {members.map((m) => (
                        <option key={m.membershipId} value={m.membershipId}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  )}
                  <div className="ml-auto flex shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => move(i, -1)}
                      disabled={i === 0}
                      className="hover:bg-muted rounded p-1 disabled:opacity-30"
                      title="上移"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(i, 1)}
                      disabled={i === steps.length - 1}
                      className="hover:bg-muted rounded p-1 disabled:opacity-30"
                      title="下移"
                    >
                      <ArrowDown className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(i)}
                      className="hover:bg-muted rounded p-1 text-rose-600"
                      title="刪除關卡"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </>
              ) : (
                <span className="text-sm">
                  {APPROVER_TYPE_LABEL[st.approverType]}
                  {st.approverType === "MEMBER" &&
                    st.approverMemberId &&
                    `：${members.find((m) => m.membershipId === st.approverMemberId)?.label ?? "（已離開）"}`}
                </span>
              )}
            </Card>
          ))}
        </ol>
      )}

      {canManage && (
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={add} className="gap-1.5">
            <Plus className="h-4 w-4" /> 新增關卡
          </Button>
          <Button
            onClick={save}
            disabled={pending || !dirty}
            className="gap-1.5"
          >
            <Save className="h-4 w-4" /> 儲存流程
          </Button>
          {steps.length > 0 && (
            <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
              <GitBranch className="h-3.5 w-3.5" />
              {steps
                .map((s) =>
                  s.approverType === "MEMBER"
                    ? (members.find((m) => m.membershipId === s.approverMemberId)
                        ?.label ?? "指定成員")
                    : "直屬主管",
                )
                .join(" → ")}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
