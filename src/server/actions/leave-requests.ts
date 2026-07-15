"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { requireActiveOrg, requireOrgPermission } from "@/server/org";
import { recomputeAttendance, weekdaysInRange } from "@/lib/attendance-sync";
import { resolveApprovalChain, countWorkdays } from "@/lib/leave-approval";
import { fmtDate } from "@/lib/date";
import { displayName } from "@/lib/display";

/**
 * 請假申請與逐關簽核。
 *   submitLeaveRequest  ：員工送出請假 → 依組織簽核關卡解析成一串簽核，通知第一關。
 *   decideLeaveApproval ：目前關卡的簽核人核准 / 駁回；核准到最後一關 → 落地到出席月曆。
 *   cancelLeaveRequest  ：申請人撤回尚未定案的申請。
 * 「哪一關輪到誰、誰就收到站內通知」；申請人也會在每次進度 / 定案時收到通知。
 */

/** yyyy-mm-dd → UTC 午夜（對應 @db.Date，避免時區位移）。 */
function toDate(v: string): Date {
  const [y, m, day] = v.split("-").map(Number);
  if (!y || !m || !day) throw new Error("日期格式錯誤");
  return new Date(Date.UTC(y, m - 1, day));
}

/** 通知內文用的「假別 · 日期範圍 · N 天」摘要。 */
function rangeLabel(
  start: Date,
  end: Date,
  days: number,
  leaveTypeName?: string | null,
): string {
  const range =
    start.getTime() === end.getTime()
      ? fmtDate(start)
      : `${fmtDate(start)} – ${fmtDate(end)}`;
  const parts: string[] = [];
  if (leaveTypeName) parts.push(leaveTypeName);
  parts.push(range);
  if (days > 0) parts.push(`${days} 天`);
  return parts.join(" · ");
}

/** 建立一則站內通知（收件者為 userId；預設連到 /leave）。 */
async function notify(opts: {
  orgId: string;
  userId: string;
  type: string;
  title: string;
  body?: string | null;
  link?: string;
}) {
  await db.notification.create({
    data: {
      organizationId: opts.orgId,
      userId: opts.userId,
      type: opts.type,
      title: opts.title,
      body: opts.body ?? null,
      link: opts.link ?? "/leave",
    },
  });
}

/**
 * 核准後落地：以「請假」成員事件寫入出席月曆（重用 recompute；請假日不算出席也不算缺席），
 * 並把假別帶到當範圍的請假紀錄上（供薪資扣薪）。
 */
async function materializeApprovedLeave(opts: {
  orgId: string;
  userId: string;
  createdById: string;
  startDate: Date;
  endDate: Date;
  leaveTypeId: string | null;
  reason: string | null;
}) {
  const { orgId, userId, createdById, startDate, endDate, leaveTypeId, reason } =
    opts;
  await db.memberEvent.create({
    data: {
      organizationId: orgId,
      userId,
      type: "請假",
      startDate,
      endDate: endDate.getTime() > startDate.getTime() ? endDate : null,
      note: reason,
      createdById,
    },
  });
  const days = weekdaysInRange(startDate, endDate);
  await recomputeAttendance(db, orgId, userId, createdById, days);
  // 帶入假別：只更新剛落地、尚未指定假別的請假日（不覆蓋 HR 手動指派）。
  if (leaveTypeId && days.length) {
    await db.attendanceRecord.updateMany({
      where: { organizationId: orgId, userId, date: { in: days }, leave: true },
      data: { leaveTypeId },
    });
  }
  revalidatePath("/attendance");
  revalidatePath("/team");
  revalidatePath(`/me/${userId}`);
}

const SubmitInput = z.object({
  leaveTypeId: z.string().min(1).optional().nullable(),
  startDate: z.string().min(1, "請選擇開始日期"),
  endDate: z.string().min(1, "請選擇結束日期"),
  reason: z.string().trim().max(2000).optional(),
});

/** 送出一筆請假申請（替自己）。回傳是否因未設定簽核關卡而自動核准。 */
export async function submitLeaveRequest(input: z.input<typeof SubmitInput>) {
  const { user, org, membership } = await requireActiveOrg();
  const d = SubmitInput.parse(input);
  const start = toDate(d.startDate);
  const end = toDate(d.endDate);
  if (end.getTime() < start.getTime()) {
    throw new Error("結束日期不能早於開始日期。");
  }

  let leaveTypeName: string | null = null;
  if (d.leaveTypeId) {
    const lt = await db.leaveType.findFirst({
      where: { id: d.leaveTypeId, organizationId: org.id },
      select: { name: true },
    });
    if (!lt) throw new Error("選擇的假別不存在，或不屬於目前組織。");
    leaveTypeName = lt.name;
  }

  const days = countWorkdays(start, end);

  // 組織簽核關卡 + 有效（在職）成員——解析出這次申請的實際簽核人序列。
  const [steps, activeMembers] = await Promise.all([
    db.leaveApprovalStep.findMany({
      where: { organizationId: org.id },
      orderBy: { sortOrder: "asc" },
      select: { approverType: true, approverMemberId: true },
    }),
    db.organizationMember.findMany({
      where: { organizationId: org.id, active: true },
      select: { id: true },
    }),
  ]);
  const validIds = new Set(activeMembers.map((m) => m.id));
  const chain = resolveApprovalChain(
    steps,
    membership.id,
    membership.managerId ?? null,
    validIds,
  );

  const now = new Date();
  const request = await db.leaveRequest.create({
    data: {
      organizationId: org.id,
      memberId: membership.id,
      userId: user.id,
      leaveTypeId: d.leaveTypeId || null,
      startDate: start,
      endDate: end,
      days,
      reason: d.reason || null,
      status: chain.length ? "PENDING" : "APPROVED",
      currentStep: 0,
      decidedAt: chain.length ? null : now,
      approvals: chain.length
        ? {
            create: chain.map((approverMemberId, i) => ({
              sortOrder: i,
              approverMemberId,
              status: "PENDING",
            })),
          }
        : undefined,
    },
    select: { id: true },
  });

  if (!chain.length) {
    // 未設定簽核關卡（或全部無法解析）→ 視同直接核准，落地到出席月曆。
    await materializeApprovedLeave({
      orgId: org.id,
      userId: user.id,
      createdById: user.id,
      startDate: start,
      endDate: end,
      leaveTypeId: d.leaveTypeId || null,
      reason: d.reason || null,
    });
  } else {
    // 通知第一關簽核人。
    const first = await db.organizationMember.findUnique({
      where: { id: chain[0] },
      select: { userId: true },
    });
    if (first) {
      await notify({
        orgId: org.id,
        userId: first.userId,
        type: "leave_request",
        title: `${displayName(user)} 送出一筆請假待你簽核`,
        body: rangeLabel(start, end, days, leaveTypeName),
      });
    }
  }

  revalidatePath("/leave");
  return { autoApproved: !chain.length, id: request.id };
}

const DecideInput = z.object({
  requestId: z.string().min(1),
  decision: z.enum(["APPROVE", "REJECT"]),
  comment: z.string().trim().max(1000).optional(),
});

/** 目前關卡的簽核人核准 / 駁回一筆請假。核准到最後一關即落地到出席月曆。 */
export async function decideLeaveApproval(input: z.input<typeof DecideInput>) {
  const { user, org, membership } = await requireActiveOrg();
  const d = DecideInput.parse(input);

  const request = await db.leaveRequest.findFirst({
    where: { id: d.requestId, organizationId: org.id },
    include: {
      approvals: { orderBy: { sortOrder: "asc" } },
      user: { select: { name: true, nickname: true, useNickname: true } },
    },
  });
  if (!request) throw new Error("找不到這筆請假申請。");
  if (request.status !== "PENDING") {
    throw new Error("這筆申請已定案，無法再簽核。");
  }

  const current = request.approvals.find(
    (a) => a.sortOrder === request.currentStep,
  );
  if (!current || current.status !== "PENDING") {
    throw new Error("找不到目前待簽核的關卡。");
  }
  if (current.approverMemberId !== membership.id) {
    throw new Error("現在不是輪到你簽核這筆申請。");
  }

  const now = new Date();
  const comment = d.comment || null;
  const label = rangeLabel(request.startDate, request.endDate, request.days);

  if (d.decision === "REJECT") {
    await db.$transaction([
      db.leaveApproval.update({
        where: { id: current.id },
        data: { status: "REJECTED", comment, decidedAt: now },
      }),
      db.leaveRequest.update({
        where: { id: request.id },
        data: { status: "REJECTED", decidedAt: now },
      }),
    ]);
    await notify({
      orgId: org.id,
      userId: request.userId,
      type: "leave_decided",
      title: `你的請假申請被 ${displayName(user)} 駁回`,
      body: comment ?? label,
    });
    revalidatePath("/leave");
    revalidatePath("/attendance");
    revalidatePath("/team");
    return;
  }

  // 核准當前關卡；若還有下一關 → 前進並通知下一關，否則定案並落地。
  const nextStep = request.currentStep + 1;
  const isFinal = nextStep >= request.approvals.length;
  await db.$transaction([
    db.leaveApproval.update({
      where: { id: current.id },
      data: { status: "APPROVED", comment, decidedAt: now },
    }),
    db.leaveRequest.update({
      where: { id: request.id },
      data: isFinal
        ? { status: "APPROVED", decidedAt: now }
        : { currentStep: nextStep },
    }),
  ]);

  if (isFinal) {
    await materializeApprovedLeave({
      orgId: org.id,
      userId: request.userId,
      createdById: user.id,
      startDate: request.startDate,
      endDate: request.endDate,
      leaveTypeId: request.leaveTypeId,
      reason: request.reason,
    });
    await notify({
      orgId: org.id,
      userId: request.userId,
      type: "leave_decided",
      title: "你的請假申請已全部核准 🎉",
      body: label,
    });
  } else {
    const next = request.approvals[nextStep];
    const nextApprover = await db.organizationMember.findUnique({
      where: { id: next.approverMemberId },
      select: { userId: true },
    });
    if (nextApprover) {
      await notify({
        orgId: org.id,
        userId: nextApprover.userId,
        type: "leave_request",
        title: `${displayName(request.user)} 的請假待你簽核`,
        body: label,
      });
    }
    await notify({
      orgId: org.id,
      userId: request.userId,
      type: "leave_progress",
      title: `你的請假已通過第 ${request.currentStep + 1} 關簽核`,
      body: `還有 ${request.approvals.length - nextStep} 關，等待下一關簽核中`,
    });
  }

  revalidatePath("/leave");
  revalidatePath("/attendance");
  revalidatePath("/team");
}

/**
 * 管理員（具 leave.manage 權限）刪除一筆請假簽核紀錄；逐關簽核（LeaveApproval）
 * 因 onDelete: Cascade 一併移除。用於清理誤送 / 測試 / 重複的申請。
 *
 * 注意：已核准並「落地」到出席月曆的請假，其出席紀錄 / 成員事件是獨立資料，
 *      不會被此刪除連動撤銷——若要一併移除，請於「出席狀況」調整該員月曆。
 *      （與 cancelLeaveRequest 的既有語意一致：出席以月曆為準。）
 */
export async function deleteLeaveRequest(id: string) {
  const { org } = await requireOrgPermission("leave.manage");
  const request = await db.leaveRequest.findFirst({
    where: { id, organizationId: org.id },
    select: { id: true, status: true },
  });
  if (!request) throw new Error("找不到這筆請假申請。");

  await db.leaveRequest.delete({ where: { id: request.id } });

  revalidatePath("/leave");
  return { status: request.status };
}

/** 申請人撤回自己尚未定案（待簽核）的請假申請。 */
export async function cancelLeaveRequest(id: string) {
  const { user, org } = await requireActiveOrg();
  const request = await db.leaveRequest.findFirst({
    where: { id, organizationId: org.id },
    include: { approvals: { orderBy: { sortOrder: "asc" } } },
  });
  if (!request) throw new Error("找不到這筆請假申請。");
  if (request.userId !== user.id) throw new Error("只能撤回自己的請假申請。");
  if (request.status !== "PENDING") {
    throw new Error(
      "只能撤回「待簽核」的申請；已核准的請假請洽出勤管理者調整出席月曆。",
    );
  }

  await db.leaveRequest.update({
    where: { id: request.id },
    data: { status: "CANCELLED", decidedAt: new Date() },
  });

  // 通知目前待簽核的關卡簽核人：申請已撤回，不用簽了。
  const current = request.approvals.find(
    (a) => a.sortOrder === request.currentStep,
  );
  if (current) {
    const approver = await db.organizationMember.findUnique({
      where: { id: current.approverMemberId },
      select: { userId: true },
    });
    if (approver) {
      await notify({
        orgId: org.id,
        userId: approver.userId,
        type: "leave_cancelled",
        title: `${displayName(user)} 已撤回一筆待你簽核的請假`,
      });
    }
  }
  revalidatePath("/leave");
}
