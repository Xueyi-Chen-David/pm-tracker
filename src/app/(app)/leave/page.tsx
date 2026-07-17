import { requireManageContext } from "@/server/org";
import {
  getMyLeaveRequests,
  getPendingApprovalsForMember,
  isEligibleLeaveApprover,
  getAllLeaveRequests,
  getLeaveApprovalFlow,
  getOrgLeaveTypes,
  getOrgMemberDirectory,
  getLeaveQuotaOverview,
  getMemberEventsForUser,
} from "@/server/queries";
import { displayName } from "@/lib/display";
import { PageHeader } from "@/components/page-header";
import { LeaveWorkspace } from "@/components/leave/leave-workspace";

export const metadata = { title: "請假簽核 · Project Pulse" };

export default async function LeavePage() {
  const { org, user, membership, can } = await requireManageContext();
  const canManageLeave = can("leave.manage");
  const canManageAttendance = can("attendance.manage");
  const needsDirectory = canManageLeave || canManageAttendance;

  const quotaYear = new Date().getFullYear();
  const [
    myRequests,
    pending,
    isEligibleApprover,
    leaveTypes,
    myEvents,
    allRequests,
    flow,
    directory,
    quota,
  ] = await Promise.all([
    getMyLeaveRequests(org.id, user.id),
    getPendingApprovalsForMember(org.id, membership.id),
    isEligibleLeaveApprover(org.id, membership.id),
    getOrgLeaveTypes(org.id, true),
    getMemberEventsForUser(org.id, user.id),
    canManageLeave ? getAllLeaveRequests(org.id) : Promise.resolve(null),
    canManageLeave ? getLeaveApprovalFlow(org.id) : Promise.resolve(null),
    needsDirectory ? getOrgMemberDirectory(org.id) : Promise.resolve(null),
    canManageLeave
      ? getLeaveQuotaOverview(org.id, quotaYear)
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

  // 出勤管理者可切換檢視 / 登記其他成員的請假 / 出差 / 事件（見 LeaveEventsSection）。
  const eventMembers = canManageAttendance
    ? (directory?.map((d) => ({
        userId: d.id,
        label: d.jobTitle ? `${displayName(d)}（${d.jobTitle}）` : displayName(d),
      })) ?? [])
    : null;

  return (
    <div className="space-y-4">
      <PageHeader
        title="請假簽核"
        description="送出請假申請、追蹤簽核進度；輪到你簽核時會收到通知。"
      />
      <LeaveWorkspace
        myRequests={myRequests}
        pending={pending}
        isEligibleApprover={isEligibleApprover}
        allRequests={allRequests}
        leaveTypes={leaveTypes}
        canManageLeave={canManageLeave}
        flowSteps={flowSteps}
        members={members}
        quota={quota}
        quotaYear={quotaYear}
        myUserId={user.id}
        myLabel={displayName(user)}
        myEvents={myEvents}
        canManageAttendance={canManageAttendance}
        eventMembers={eventMembers}
      />
    </div>
  );
}
