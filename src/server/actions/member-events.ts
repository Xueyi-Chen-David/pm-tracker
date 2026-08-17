"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { requireActiveOrg, membershipHas } from "@/server/org";
import { eventAttendanceEffect } from "@/lib/constants";
import { recomputeAttendance, weekdaysInRange } from "@/lib/attendance-sync";
import { resolveApprovalChain } from "@/lib/leave-approval";
import { validateAttachment } from "@/lib/attachment";
import { fmtDate } from "@/lib/date";
import { displayName } from "@/lib/display";
import { createNotification } from "@/server/notify";

/**
 * 出差 / 事件登記與逐關簽核——與 leave-requests.ts 同一套機制（同一組「簽核流程」設定），
 * 差別只在一件事：出勤管理權限者「代他人登記」一律直接核准（見 createMemberEvent 內註解）。
 *   createMemberEvent          ：登記一筆事件 → 自己登記依簽核關卡解析成一串簽核；
 *                                 代他人登記／免簽核成員／未設定流程 → 直接核准並落地。
 *   decideMemberEventApproval  ：目前關卡的簽核人核准 / 駁回；核准到最後一關 → 落地到出席月曆。
 *   deleteMemberEvent          ：刪除（待簽核時等同撤回；已核准時一併從出席月曆撤銷效果）。
 */

const EventInput = z.object({
  userId: z.string().min(1),
  type: z.string().trim().min(1, "請選擇事件類型").max(50),
  startDate: z.string().min(1, "請選擇開始日期"),
  endDate: z.string().optional(),
  note: z.string().trim().max(2000).optional(),
  attachment: z.string().optional(), // 證明附件 data URL（選填）
  attachmentName: z.string().trim().max(200).optional(),
});

/** yyyy-mm-dd → UTC 午夜（對應 @db.Date，避免時區位移）。 */
function toDate(v: string): Date {
  const [y, m, day] = v.split("-").map(Number);
  if (!y || !m || !day) throw new Error("日期格式錯誤");
  return new Date(Date.UTC(y, m - 1, day));
}

/** 通知內文用的「類型 · 日期範圍」摘要。 */
function eventRangeLabel(type: string, start: Date, end: Date | null): string {
  const range =
    end && end.getTime() !== start.getTime()
      ? `${fmtDate(start)} – ${fmtDate(end)}`
      : fmtDate(start);
  return `${type} · ${range}`;
}

/** 建立一則站內通知 + 桌面推播（收件者為 userId；預設連到 /leave）。 */
async function notify(opts: {
  orgId: string;
  userId: string;
  type: string;
  title: string;
  body?: string | null;
  link?: string;
}) {
  await createNotification({
    orgId: opts.orgId,
    userId: opts.userId,
    type: opts.type,
    title: opts.title,
    body: opts.body ?? null,
    link: opts.link ?? "/leave",
  });
}

export async function createMemberEvent(input: z.input<typeof EventInput>) {
  const { user, org, membership } = await requireActiveOrg();
  const d = EventInput.parse(input);
  const isDelegate = d.userId !== user.id;
  // 只能替自己登記請假 / 事件；替他人登記需出勤管理權限。以回傳值（非 throw）帶回——
  // 正式環境 Server Action 丟出的 Error 訊息會被 Next.js 隱去。
  if (isDelegate && !membershipHas(membership, "attendance.manage")) {
    return {
      ok: false as const,
      error: "只能替自己登記請假 / 事件；需具備出勤管理權限才能替他人登記。",
    };
  }
  const member = await db.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: org.id, userId: d.userId } },
    select: { id: true, managerId: true, leaveApprovalExempt: true },
  });
  if (!member) throw new Error("該成員不屬於目前組織。");

  const start = toDate(d.startDate);
  const end = d.endDate ? toDate(d.endDate) : null;
  // 結束日早於開始日時忽略結束日
  const endDate = end && end.getTime() >= start.getTime() ? end : null;

  const attachment = d.attachment?.trim() || null;
  if (attachment) {
    const err = validateAttachment(attachment);
    if (err) return { ok: false as const, error: err };
  }

  // 簽核關卡解析：與請假共用同一組「簽核流程」設定。但「代他人登記」一律略過——
  // 出勤管理權限者本來就有權直接改任何人的出勤，再走一次簽核只是多餘的關卡，
  // 這也是本次唯一「出差 / 事件」與「請假」在流程上的差異（HR 已確認的預設行為）。
  let chain: string[] = [];
  if (!isDelegate && !member.leaveApprovalExempt) {
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
    chain = resolveApprovalChain(steps, member.id, member.managerId ?? null, validIds);
  }
  const needsApproval = chain.length > 0;
  const now = new Date();

  await db.memberEvent.create({
    data: {
      organizationId: org.id,
      userId: d.userId,
      type: d.type,
      startDate: start,
      endDate,
      note: d.note || null,
      attachment,
      attachmentName: attachment ? d.attachmentName?.trim() || null : null,
      createdById: user.id,
      status: needsApproval ? "PENDING" : "APPROVED",
      currentStep: 0,
      decidedAt: needsApproval ? null : now,
      approvals: needsApproval
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

  if (!needsApproval) {
    // 免簽核（代他人登記 / 免簽核成員 / 未設定簽核流程）：直接落地到出席月曆。
    if (eventAttendanceEffect(d.type)) {
      await recomputeAttendance(
        db,
        org.id,
        d.userId,
        user.id,
        weekdaysInRange(start, endDate ?? start),
      );
    }
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
        type: "member_event",
        title: `${displayName(user)} 送出一筆「${d.type}」待你簽核`,
        body: eventRangeLabel(d.type, start, endDate),
      });
    }
  }

  revalidatePath("/leave");
  revalidatePath("/checkin");
  revalidatePath("/team");
  revalidatePath("/attendance");
  return {
    ok: true as const,
    autoApproved: !needsApproval,
    // 自動核准的原因：代他人登記 vs 免簽核成員 vs 組織尚未設定簽核關卡——前端訊息不同。
    autoApproveReason: !needsApproval
      ? isDelegate
        ? ("delegate" as const)
        : member.leaveApprovalExempt
          ? ("exempt" as const)
          : ("no_flow" as const)
      : undefined,
  };
}

const DecideEventInput = z.object({
  eventId: z.string().min(1),
  decision: z.enum(["APPROVE", "REJECT"]),
  comment: z.string().trim().max(1000).optional(),
});

/** 目前關卡的簽核人核准 / 駁回一筆出差 / 事件登記。核准到最後一關即落地到出席月曆。 */
export async function decideMemberEventApproval(
  input: z.input<typeof DecideEventInput>,
) {
  const { user, org, membership } = await requireActiveOrg();
  const d = DecideEventInput.parse(input);

  const event = await db.memberEvent.findFirst({
    where: { id: d.eventId, organizationId: org.id },
    include: {
      approvals: { orderBy: { sortOrder: "asc" } },
      user: { select: { name: true, nickname: true, useNickname: true } },
    },
  });
  if (!event) return { ok: false as const, error: "找不到這筆事件登記。" };
  if (event.status !== "PENDING") {
    return { ok: false as const, error: "這筆登記已定案，無法再簽核。" };
  }

  const current = event.approvals.find((a) => a.sortOrder === event.currentStep);
  if (!current || current.status !== "PENDING") {
    return { ok: false as const, error: "找不到目前待簽核的關卡。" };
  }
  if (current.approverMemberId !== membership.id) {
    return { ok: false as const, error: "現在不是輪到你簽核這筆登記。" };
  }

  const now = new Date();
  const comment = d.comment || null;
  const label = eventRangeLabel(event.type, event.startDate, event.endDate);

  if (d.decision === "REJECT") {
    await db.$transaction([
      db.memberEventApproval.update({
        where: { id: current.id },
        data: { status: "REJECTED", comment, decidedAt: now },
      }),
      db.memberEvent.update({
        where: { id: event.id },
        data: { status: "REJECTED", decidedAt: now },
      }),
    ]);
    await notify({
      orgId: org.id,
      userId: event.userId,
      type: "member_event_decided",
      title: `你的「${event.type}」登記被 ${displayName(user)} 駁回`,
      body: comment ?? label,
    });
    revalidatePath("/leave");
    revalidatePath("/checkin");
    return { ok: true as const };
  }

  // 核准當前關卡；若還有下一關 → 前進並通知下一關，否則定案並落地。
  const nextStep = event.currentStep + 1;
  const isFinal = nextStep >= event.approvals.length;
  await db.$transaction([
    db.memberEventApproval.update({
      where: { id: current.id },
      data: { status: "APPROVED", comment, decidedAt: now },
    }),
    db.memberEvent.update({
      where: { id: event.id },
      data: isFinal
        ? { status: "APPROVED", decidedAt: now }
        : { currentStep: nextStep },
    }),
  ]);

  if (isFinal) {
    if (eventAttendanceEffect(event.type)) {
      await recomputeAttendance(
        db,
        org.id,
        event.userId,
        user.id,
        weekdaysInRange(event.startDate, event.endDate ?? event.startDate),
      );
    }
    await notify({
      orgId: org.id,
      userId: event.userId,
      type: "member_event_decided",
      title: `你的「${event.type}」登記已全部核准 🎉`,
      body: label,
    });
  } else {
    const next = event.approvals[nextStep];
    const nextApprover = await db.organizationMember.findUnique({
      where: { id: next.approverMemberId },
      select: { userId: true },
    });
    if (nextApprover) {
      await notify({
        orgId: org.id,
        userId: nextApprover.userId,
        type: "member_event",
        title: `${displayName(event.user)} 的「${event.type}」登記待你簽核`,
        body: label,
      });
    }
    await notify({
      orgId: org.id,
      userId: event.userId,
      type: "member_event_progress",
      title: `你的「${event.type}」登記已通過第 ${event.currentStep + 1} 關簽核`,
      body: `還有 ${event.approvals.length - nextStep} 關，等待下一關簽核中`,
    });
  }

  revalidatePath("/leave");
  revalidatePath("/checkin");
  revalidatePath("/attendance");
  revalidatePath("/team");
  return { ok: true as const };
}

/** 請假簽核頁用：切換檢視對象時，即時抓該成員的事件清單。 */
export async function getMemberEventsAction(userId: string) {
  const { org, user, membership } = await requireActiveOrg();
  // 以回傳值（非 throw）帶回——正式環境 Server Action 丟出的 Error 訊息會被 Next.js 隱去。
  if (userId !== user.id && !membershipHas(membership, "attendance.manage")) {
    return {
      ok: false as const,
      error: "只能查看自己的事件；需具備出勤管理權限才能查看他人的。",
    };
  }
  const events = await db.memberEvent.findMany({
    where: { organizationId: org.id, userId },
    orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
    take: 50,
    select: {
      id: true,
      type: true,
      startDate: true,
      endDate: true,
      note: true,
      attachment: true,
      attachmentName: true,
      createdAt: true,
      status: true,
      currentStep: true,
      approvals: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          sortOrder: true,
          status: true,
          comment: true,
          decidedAt: true,
          approverMember: { select: { id: true, user: { select: { name: true, nickname: true, useNickname: true } } } },
        },
      },
    },
  });
  return { ok: true as const, events };
}

/**
 * 刪除一筆事件登記：待簽核時等同撤回（順帶通知目前待簽核的關卡不用再簽）；
 * 已核准時一併從出席月曆撤銷效果（recomputeAttendance 重算，找不到這筆事件即移除）。
 */
export async function deleteMemberEvent(input: { id: string; userId: string }) {
  const { user, org, membership } = await requireActiveOrg();
  // 先讀出事件（需要範圍 + 類型 + 目前簽核關卡才能正確善後），再刪除。
  const event = await db.memberEvent.findFirst({
    where: { id: input.id, organizationId: org.id },
    select: {
      userId: true,
      type: true,
      startDate: true,
      endDate: true,
      status: true,
      currentStep: true,
      approvals: {
        where: { status: "PENDING" },
        select: { approverMemberId: true },
      },
    },
  });
  if (!event) return { ok: true as const };
  // 只能刪自己的事件；刪他人需出勤管理權限，或請假管理權限（「全體請假 / 出差」頁的
  // 清除誤送 / 測試登記——與 deleteLeaveRequest 用同一個權限，兩者現在同一張表並排）。
  // 以回傳值（非 throw）帶回——正式環境 Server Action 丟出的 Error 訊息會被 Next.js 隱去。
  const canManageOthers =
    membershipHas(membership, "attendance.manage") ||
    membershipHas(membership, "leave.manage");
  if (event.userId !== user.id && !canManageOthers) {
    return {
      ok: false as const,
      error: "只能刪除自己的事件；需具備出勤管理或請假管理權限才能刪除他人的。",
    };
  }
  const wasPending = event.status === "PENDING";
  const current = event.approvals[0]; // 目前待簽關卡（select 已篩 status: PENDING，至多一筆）

  await db.memberEvent.deleteMany({
    where: { id: input.id, organizationId: org.id },
  });

  if (event.status === "APPROVED" && eventAttendanceEffect(event.type)) {
    await recomputeAttendance(
      db,
      org.id,
      event.userId,
      user.id,
      weekdaysInRange(event.startDate, event.endDate ?? event.startDate),
    );
  }

  if (wasPending && current) {
    const approver = await db.organizationMember.findUnique({
      where: { id: current.approverMemberId },
      select: { userId: true },
    });
    if (approver) {
      await notify({
        orgId: org.id,
        userId: approver.userId,
        type: "member_event_cancelled",
        title: `${displayName(user)} 已撤回一筆待你簽核的「${event.type}」登記`,
      });
    }
  }

  revalidatePath("/leave");
  revalidatePath("/checkin");
  revalidatePath("/team");
  revalidatePath("/attendance");
  return { ok: true as const };
}
