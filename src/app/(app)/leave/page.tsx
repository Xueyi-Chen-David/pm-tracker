import { requireManageContext } from "@/server/org";
import {
  getMyLeaveRequests,
  getPendingApprovalsForMember,
  getAllLeaveRequests,
  getLeaveApprovalFlow,
  getOrgLeaveTypes,
  getOrgMemberDirectory,
} from "@/server/queries";
import { displayName } from "@/lib/display";
import { PageHeader } from "@/components/page-header";
import { LeaveWorkspace } from "@/components/leave/leave-workspace";

export const metadata = { title: "請假簽核 · Project Pulse" };

export default async function LeavePage() {
  const { org, user, membership, can } = await requireManageContext();
  const canManageLeave = can("leave.manage");

  const [myRequests, pending, leaveTypes, allRequests, flow, directory] =
    await Promise.all([
      getMyLeaveRequests(org.id, user.id),
      getPendingApprovalsForMember(org.id, membership.id),
      getOrgLeaveTypes(org.id, true),
      canManageLeave ? getAllLeaveRequests(org.id) : Promise.resolve(null),
      canManageLeave ? getLeaveApprovalFlow(org.id) : Promise.resolve(null),
      canManageLeave
        ? getOrgMemberDirectory(org.id)
        : Promise.resolve(null),
    ]);

  const flowSteps =
    flow?.map((s) => ({
      approverType: s.approverType as "MANAGER" | "MEMBER",
      approverMemberId: s.approverMemberId,
    })) ?? null;

  const members =
    directory?.map((d) => ({
      membershipId: d.membershipId,
      label: d.jobTitle
        ? `${displayName(d)}（${d.jobTitle}）`
        : displayName(d),
    })) ?? null;

  return (
    <div className="space-y-4">
      <PageHeader
        title="請假簽核"
        description="送出請假申請、追蹤簽核進度；輪到你簽核時會收到通知。"
      />
      <LeaveWorkspace
        myRequests={myRequests}
        pending={pending}
        allRequests={allRequests}
        leaveTypes={leaveTypes}
        canManageLeave={canManageLeave}
        flowSteps={flowSteps}
        members={members}
      />
    </div>
  );
}
