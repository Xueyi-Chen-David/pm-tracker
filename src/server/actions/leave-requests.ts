"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { requireActiveOrg, requireOrgPermission } from "@/server/org";
import { recomputeAttendance, weekdaysInRange } from "@/lib/attendance-sync";
import { resolveApprovalChain, countWorkdays } from "@/lib/leave-approval";
import { fmtDate } from "@/lib/date";
import { displayName } from "@/lib/display";
import { validateAttachment } from "@/lib/attachment";
import { createNotification } from "@/server/notify";
import { syncMemberAbsenceToCalendar } from "@/server/google-calendar";

/**
 * 請假申請與逐關簽核。
 *   submitLeaveRequest  ：員工送出請假 → 依組織簽核關卡解析成一串簽核，通知第一關。
 *   decideLeaveApproval ：目前關卡的簽核人核准 / 駁回；核准到最後一關 → 落地到出席月曆。
 *   cancelLeaveRequest  ：申請人撤回尚未定案的申請。
 * 「哪一關輪到誰、誰就收到站內通知」；申請人也會在每次進度 / 定案時收到通知。
 */

/**
 * yyyy-mm-dd → UTC 午夜（對應 @db.Date，避免時區位移）。格式錯誤回傳 null（而非
 * throw）——呼叫端（Server Action）以回傳值帶回錯誤，正式環境 throw 出的 Error
 * 訊息會被 Next.js 隱去。
 */
function toDate(v: string): Date | null {
  const [y, m, day] = v.split("-").map(Number);
  if (!y || !m || !day) return null;
  return new Date(Date.UTC(y, m - 1, day));
}

/** "HH:mm" → 當天的分鐘數；格式錯誤回傳 null。 */
function toMinutes(v: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

/** 通知內文用的「假別 · 日期範圍（或時數區間）· N 天/小時」摘要。 */
function rangeLabel(
  start: Date,
  end: Date,
  days: number,
  leaveTypeName?: string | null,
  hourly?: { startTime: string; endTime: string; hours: number } | null,
): string {
  const range = hourly
    ? `${fmtDate(start)} ${hourly.startTime}–${hourly.endTime}`
    : start.getTime() === end.getTime()
      ? fmtDate(start)
      : `${fmtDate(start)} – ${fmtDate(end)}`;
  const parts: string[] = [];
  if (leaveTypeName) parts.push(leaveTypeName);
  parts.push(range);
  if (hourly) parts.push(`${hourly.hours} 小時`);
  else if (days > 0) parts.push(`${days} 天`);
  return parts.join(" · ");
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

/**
 * 核准後落地：以「請假」成員事件寫入出席月曆（重用 recompute；請假日不算出席也不算缺席），
 * 並把假別帶到當範圍的請假紀錄上（供薪資扣薪）。
 *
 * 時數請假（hourly 有值）是例外路徑：不建立「請假」成員事件（那會被 recomputeAttendance
 * 判成整天缺席／請假，蓋掉這天原本的出勤），而是直接把時數疊加到當天 AttendanceRecord.leaveHours，
 * 出席狀態維持不動。標記 auto:false（人工性質），避免日後其他事件觸發 recomputeAttendance
 * 重算同一天時，因為找不到對應成員事件而被整筆刪除。
 */
async function materializeApprovedLeave(opts: {
  orgId: string;
  requestId: string;
  userId: string;
  createdById: string;
  memberDisplayName: string;
  startDate: Date;
  endDate: Date;
  leaveTypeId: string | null;
  reason: string | null;
  attachment?: string | null;
  attachmentName?: string | null;
  hourly?: { startTime: string; endTime: string; hours: number } | null;
}) {
  const {
    orgId,
    requestId,
    userId,
    createdById,
    memberDisplayName,
    startDate,
    endDate,
    leaveTypeId,
    reason,
    hourly,
  } = opts;

  // Google 日曆同步：跟請假/出差共用同一顆函式；型別標籤帶假別名稱方便一眼看出請的是什麼假。
  // 未設定組織日曆 ID 或服務帳戶 env 時 syncMemberAbsenceToCalendar 會自己靜默略過。
  const leaveType = leaveTypeId
    ? await db.leaveType.findUnique({ where: { id: leaveTypeId }, select: { name: true } })
    : null;
  const typeLabel = leaveType?.name ? `請假（${leaveType.name}）` : "請假";

  if (hourly) {
    const existing = await db.attendanceRecord.findUnique({
      where: {
        organizationId_userId_date: { organizationId: orgId, userId, date: startDate },
      },
      select: { id: true, leaveHours: true, cleared: true },
    });
    const reasonLabel = `請假 ${hourly.startTime}–${hourly.endTime}`;
    if (existing) {
      await db.attendanceRecord.update({
        where: { id: existing.id },
        data: {
          leaveHours: (existing.leaveHours ?? 0) + hourly.hours,
          leaveTypeId: leaveTypeId ?? undefined,
          // 若這天原本被人工「清除」（墓碑）：核准的請假仍要看得見，順帶恢復出席狀態。
          ...(existing.cleared
            ? { cleared: false, present: true, reason: reasonLabel }
            : {}),
        },
      });
    } else {
      await db.attendanceRecord.create({
        data: {
          organizationId: orgId,
          userId,
          date: startDate,
          present: true,
          leaveHours: hourly.hours,
          leaveTypeId,
          reason: reasonLabel,
          auto: false,
          createdById,
        },
      });
    }
    revalidatePath("/attendance");
    revalidatePath("/team");
    revalidatePath(`/me/${userId}`);
    await syncMemberAbsenceToCalendar({
      orgId,
      sourceKey: `leave:${requestId}`,
      memberName: memberDisplayName,
      typeLabel,
      note: `${hourly.startTime}–${hourly.endTime}${reason ? "・" + reason : ""}`,
      startDate,
      endDate: startDate,
    });
    return;
  }

  await db.memberEvent.create({
    data: {
      organizationId: orgId,
      userId,
      type: "請假",
      startDate,
      endDate: endDate.getTime() > startDate.getTime() ? endDate : null,
      note: reason,
      attachment: opts.attachment ?? null,
      attachmentName: opts.attachmentName ?? null,
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
  await syncMemberAbsenceToCalendar({
    orgId,
    sourceKey: `leave:${requestId}`,
    memberName: memberDisplayName,
    typeLabel,
    note: reason,
    startDate,
    endDate,
  });
}

const SubmitInput = z.object({
  leaveTypeId: z.string().min(1).optional().nullable(),
  startDate: z.string().min(1, "請選擇開始日期"),
  endDate: z.string().min(1, "請選擇結束日期"),
  // 時數請假（選填）：兩者要嘛都給、要嘛都不給；給了就只能是同一天（startDate＝endDate）。
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  reason: z.string().trim().max(2000).optional(),
  attachment: z.string().optional(), // 證明附件 data URL（選填）
  attachmentName: z.string().trim().max(200).optional(),
});

/** 送出一筆請假申請（替自己）。回傳是否因未設定簽核關卡而自動核准。 */
export async function submitLeaveRequest(input: z.input<typeof SubmitInput>) {
  const { user, org, membership } = await requireActiveOrg();
  const d = SubmitInput.parse(input);
  const start = toDate(d.startDate);
  const end = toDate(d.endDate);
  if (!start || !end) {
    return { ok: false as const, error: "日期格式錯誤" };
  }
  if (end.getTime() < start.getTime()) {
    return { ok: false as const, error: "結束日期不能早於開始日期。" };
  }

  // 時數請假：驗證時間格式、結束早於開始、且只能是單一天。
  let hourly: { startTime: string; endTime: string; hours: number } | null = null;
  if (d.startTime || d.endTime) {
    if (!d.startTime || !d.endTime) {
      return { ok: false as const, error: "請同時填寫開始與結束時間。" };
    }
    if (start.getTime() !== end.getTime()) {
      return { ok: false as const, error: "時數請假只能選單一天。" };
    }
    const startMin = toMinutes(d.startTime);
    const endMin = toMinutes(d.endTime);
    if (startMin === null || endMin === null) {
      return { ok: false as const, error: "時間格式錯誤" };
    }
    if (endMin <= startMin) {
      return { ok: false as const, error: "結束時間必須晚於開始時間。" };
    }
    hourly = {
      startTime: d.startTime,
      endTime: d.endTime,
      hours: Math.round(((endMin - startMin) / 60) * 100) / 100,
    };
  }

  // 證明附件（選填）：驗證格式與大小。
  const attachment = d.attachment?.trim() || null;
  if (attachment) {
    const err = validateAttachment(attachment);
    if (err) return { ok: false as const, error: err };
  }
  const attachmentName = attachment ? d.attachmentName?.trim() || null : null;

  let leaveTypeName: string | null = null;
  if (d.leaveTypeId) {
    const lt = await db.leaveType.findFirst({
      where: { id: d.leaveTypeId, organizationId: org.id },
      select: { name: true },
    });
    if (!lt) {
      return { ok: false as const, error: "選擇的假別不存在，或不屬於目前組織。" };
    }
    leaveTypeName = lt.name;
  }

  let days: number;
  if (hourly) {
    const sp = await db.salaryProfile.findUnique({
      where: { memberId: membership.id },
      select: { standardHoursPerDay: true },
    });
    const hoursPerDay = sp && sp.standardHoursPerDay > 0 ? sp.standardHoursPerDay : 8;
    days = Math.round((hourly.hours / hoursPerDay) * 100) / 100;
  } else {
    days = countWorkdays(start, end);
  }

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
  // 免簽核成員（HR 於簽核流程頁指定）：一律視同沒有關卡，送出即自動核准。
  const chain = membership.leaveApprovalExempt
    ? []
    : resolveApprovalChain(steps, membership.id, membership.managerId ?? null, validIds);

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
      startTime: hourly?.startTime,
      endTime: hourly?.endTime,
      hours: hourly?.hours,
      reason: d.reason || null,
      attachment,
      attachmentName,
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
      requestId: request.id,
      userId: user.id,
      createdById: user.id,
      memberDisplayName: displayName(user),
      startDate: start,
      endDate: end,
      leaveTypeId: d.leaveTypeId || null,
      reason: d.reason || null,
      attachment,
      attachmentName,
      hourly,
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
        body: rangeLabel(start, end, days, leaveTypeName, hourly),
      });
    }
  }

  revalidatePath("/leave");
  return {
    ok: true as const,
    autoApproved: !chain.length,
    // 自動核准的原因：免簽核成員 vs 組織尚未設定任何簽核關卡——前端訊息不同。
    autoApproveReason: !chain.length
      ? membership.leaveApprovalExempt
        ? ("exempt" as const)
        : ("no_flow" as const)
      : undefined,
    id: request.id,
  };
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
  if (!request) return { ok: false as const, error: "找不到這筆請假申請。" };
  if (request.status !== "PENDING") {
    return { ok: false as const, error: "這筆申請已定案，無法再簽核。" };
  }

  const current = request.approvals.find(
    (a) => a.sortOrder === request.currentStep,
  );
  if (!current || current.status !== "PENDING") {
    return { ok: false as const, error: "找不到目前待簽核的關卡。" };
  }
  if (current.approverMemberId !== membership.id) {
    return { ok: false as const, error: "現在不是輪到你簽核這筆申請。" };
  }

  const now = new Date();
  const comment = d.comment || null;
  const hourly =
    request.startTime && request.endTime && request.hours != null
      ? { startTime: request.startTime, endTime: request.endTime, hours: request.hours }
      : null;
  const label = rangeLabel(request.startDate, request.endDate, request.days, null, hourly);

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
    return { ok: true as const };
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
      requestId: request.id,
      userId: request.userId,
      createdById: user.id,
      memberDisplayName: displayName(request.user),
      startDate: request.startDate,
      endDate: request.endDate,
      leaveTypeId: request.leaveTypeId,
      reason: request.reason,
      attachment: request.attachment,
      attachmentName: request.attachmentName,
      hourly,
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
  return { ok: true as const };
}

/**
 * 管理員（具 leave.manage 權限）刪除一筆請假簽核紀錄。用於清理誤送 / 測試 / 重複的申請。
 *
 * 軟刪除，不實體移除：直接刪除會讓這筆申請（連同簽核意見、假別、時數…）完全無跡可查，
 * 尤其是已核准、已經影響出勤 / 薪資的申請——刪掉之後不但看不到「當初為什麼准了這天假」，
 * 也沒辦法回頭復原。改為標記 deletedAt/deletedById：預設清單（全體請假 / 我的請假 /
 * 待我簽核）一律排除，HR 可在「已刪除」清單看到並復原（見 restoreLeaveRequest）。
 *
 * 注意：已核准並「落地」到出席月曆的請假，其出席紀錄 / 成員事件是獨立資料，
 *      不會被此刪除連動撤銷——若要一併移除，請於「出席狀況」調整該員月曆。
 *      （與 cancelLeaveRequest 的既有語意一致：出席以月曆為準。）
 */
export async function deleteLeaveRequest(id: string) {
  const { org, user } = await requireOrgPermission("leave.manage");
  const request = await db.leaveRequest.findFirst({
    where: { id, organizationId: org.id, deletedAt: null },
    select: { id: true, status: true },
  });
  if (!request) return { ok: false as const, error: "找不到這筆請假申請。" };

  await db.leaveRequest.update({
    where: { id: request.id },
    data: { deletedAt: new Date(), deletedById: user.id },
  });

  revalidatePath("/leave");
  return { ok: true as const, status: request.status };
}

/** 管理員復原一筆先前刪除的請假申請（清空 deletedAt/deletedById）。需 `leave.manage`。 */
export async function restoreLeaveRequest(id: string) {
  const { org } = await requireOrgPermission("leave.manage");
  const request = await db.leaveRequest.findFirst({
    where: { id, organizationId: org.id, deletedAt: { not: null } },
    select: { id: true },
  });
  if (!request) return { ok: false as const, error: "找不到這筆已刪除的請假申請。" };

  await db.leaveRequest.update({
    where: { id: request.id },
    data: { deletedAt: null, deletedById: null },
  });

  revalidatePath("/leave");
  return { ok: true as const };
}

/** 申請人撤回自己尚未定案（待簽核）的請假申請。 */
export async function cancelLeaveRequest(id: string) {
  const { user, org } = await requireActiveOrg();
  const request = await db.leaveRequest.findFirst({
    where: { id, organizationId: org.id },
    include: { approvals: { orderBy: { sortOrder: "asc" } } },
  });
  if (!request) return { ok: false as const, error: "找不到這筆請假申請。" };
  if (request.userId !== user.id) {
    return { ok: false as const, error: "只能撤回自己的請假申請。" };
  }
  if (request.status !== "PENDING") {
    return {
      ok: false as const,
      error: "只能撤回「待簽核」的申請；已核准的請假請洽出勤管理者調整出席月曆。",
    };
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
  return { ok: true as const };
}
