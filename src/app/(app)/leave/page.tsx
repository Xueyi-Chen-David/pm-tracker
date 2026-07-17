import { redirect } from "next/navigation";
import { requireManageContext } from "@/server/org";
import {
  getPendingApprovalsForMember,
  isEligibleLeaveApprover,
  getAllLeaveRequests,
  getLeaveApprovalFlow,
  getOrgMemberDirectory,
  getLeaveQuotaOverview,
} from "@/server/queries";
import { displayName } from "@/lib/display";
import { PageHeader } from "@/components/page-header";
import { LeaveWorkspace } from "@/components/leave/leave-workspace";

export const metadata = { title: "請假簽核 · Project Pulse" };

/**
 * 請假簽核頁：只給「要簽核的人」與 HR。
 *
 * 送出自己的請假 / 登記出差已搬到「打卡 / 請假 / 出差」，所以沒被排進簽核流程、
 * 也沒有 leave.manage 的一般成員在這頁無事可做——側欄不顯示（見 app/layout.tsx），
 * 直接打網址也擋掉，避免出現一個空白分頁的頁面。
 */
export default async function LeavePage() {
  const { org, membership, can, previewing } = await requireManageContext();
  const canManageLeave = can("leave.manage");

  const quotaYear = new Date().getFullYear();
  const [pending, isEligibleApprover, allRequests, flow, directory, quota] =
    await Promise.all([
      getPendingApprovalsForMember(org.id, membership.id),
      isEligibleLeaveApprover(org.id, membership.id),
      canManageLeave ? getAllLeaveRequests(org.id) : Promise.resolve(null),
      canManageLeave ? getLeaveApprovalFlow(org.id) : Promise.resolve(null),
      canManageLeave ? getOrgMemberDirectory(org.id) : Promise.resolve(null),
      canManageLeave
        ? getLeaveQuotaOverview(org.id, quotaYear)
        : Promise.resolve(null),
    ]);

  // 守門（本頁自理，見 layout.tsx 的說明）。條件與側欄的 showLeaveAsApprover 一致：
  // pending.length > 0 保底＝流程設定改過、但手上還卡著舊分派的簽核仍要能處理；
  // 預覽他人視角時不以簽核者身分放行，否則管理者切成員工視角會看到不該有的頁。
  const isApprover = !previewing && (isEligibleApprover || pending.length > 0);
  if (!isApprover && !canManageLeave) redirect("/checkin");

  const flowSteps =
    flow?.map((s) => ({
      approverType: s.approverType as "MANAGER" | "MEMBER",
      approverMemberId: s.approverMemberId,
    })) ?? null;

  const members =
    directory?.map((d) => ({
      membershipId: d.membershipId,
      label: d.jobTitle ? `${displayName(d)}（${d.jobTitle}）` : displayName(d),
    })) ?? null;

  return (
    <div className="space-y-4">
      <PageHeader
        title="請假簽核"
        description={
          canManageLeave
            ? "簽核送到你這關的請假，並檢視全體請假 / 特休額度與簽核流程。"
            : "簽核送到你這關的請假；輪到你時會收到通知。要請假請至「打卡 / 請假 / 出差」。"
        }
      />
      <LeaveWorkspace
        pending={pending}
        isEligibleApprover={isEligibleApprover}
        allRequests={allRequests}
        canManageLeave={canManageLeave}
        flowSteps={flowSteps}
        members={members}
        quota={quota}
        quotaYear={quotaYear}
      />
    </div>
  );
}
