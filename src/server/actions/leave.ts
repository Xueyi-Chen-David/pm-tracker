"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { requireOrgPermission } from "@/server/org";

/**
 * 假別（LeaveType）管理。需 `leave.manage` 權限（人資 / 管理者）。
 * paidPercent 決定該假別的薪資給付比例（100＝全薪、0＝無薪、50＝半薪…），供薪資計算扣薪。
 */

/** 台灣常見假別預設（依勞基法概念設定給付比例）。 */
const DEFAULT_LEAVE_TYPES: {
  name: string;
  paidPercent: number;
  color: string;
  annualQuotaDays?: number;
}[] = [
  { name: "特休", paidPercent: 100, color: "#10b981", annualQuotaDays: 7 },
  { name: "公假", paidPercent: 100, color: "#0ea5e9" },
  { name: "婚假", paidPercent: 100, color: "#ec4899", annualQuotaDays: 8 },
  { name: "喪假", paidPercent: 100, color: "#64748b" },
  { name: "病假", paidPercent: 50, color: "#f59e0b", annualQuotaDays: 30 },
  { name: "事假", paidPercent: 0, color: "#ef4444", annualQuotaDays: 14 },
];

const LeaveInput = z.object({
  name: z.string().trim().min(1, "請輸入假別名稱").max(30),
  paidPercent: z.coerce.number().int().min(0).max(100),
  annualQuotaDays: z.coerce.number().min(0).max(366).optional(),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "顏色需為 #RRGGBB")
    .optional(),
  active: z.boolean().optional(),
});

export async function createLeaveType(input: z.input<typeof LeaveInput>) {
  const { org } = await requireOrgPermission("leave.manage");
  const d = LeaveInput.parse(input);
  const count = await db.leaveType.count({ where: { organizationId: org.id } });
  try {
    await db.leaveType.create({
      data: {
        organizationId: org.id,
        name: d.name,
        paidPercent: d.paidPercent,
        annualQuotaDays: d.annualQuotaDays ?? null,
        color: d.color || null,
        sortOrder: count,
      },
    });
  } catch (e) {
    if ((e as { code?: string })?.code === "P2002") {
      return { ok: false as const, error: "已有同名假別。" };
    }
    throw e;
  }
  revalidatePath("/payroll");
  revalidatePath("/attendance");
  return { ok: true as const };
}

const UpdateLeaveInput = LeaveInput.extend({ id: z.string().min(1) });

export async function updateLeaveType(input: z.input<typeof UpdateLeaveInput>) {
  const { org } = await requireOrgPermission("leave.manage");
  const d = UpdateLeaveInput.parse(input);
  const existing = await db.leaveType.findFirst({
    where: { id: d.id, organizationId: org.id },
    select: { id: true },
  });
  if (!existing) {
    return { ok: false as const, error: "找不到假別，或它不屬於目前組織。" };
  }
  try {
    await db.leaveType.update({
      where: { id: d.id },
      data: {
        name: d.name,
        paidPercent: d.paidPercent,
        annualQuotaDays: d.annualQuotaDays ?? null,
        color: d.color || null,
        active: d.active ?? true,
      },
    });
  } catch (e) {
    if ((e as { code?: string })?.code === "P2002") {
      return { ok: false as const, error: "已有同名假別。" };
    }
    throw e;
  }
  revalidatePath("/payroll");
  revalidatePath("/attendance");
  return { ok: true as const };
}

export async function deleteLeaveType(id: string) {
  const { org } = await requireOrgPermission("leave.manage");
  // 出席紀錄的 leaveTypeId 會由 FK SET NULL 自動解除。
  await db.leaveType.deleteMany({ where: { id, organizationId: org.id } });
  revalidatePath("/payroll");
  revalidatePath("/attendance");
}

/** 一鍵建立台灣常見假別（已存在的同名假別會略過）。需 `leave.manage`。 */
export async function createDefaultLeaveTypes() {
  const { org } = await requireOrgPermission("leave.manage");
  const base = await db.leaveType.count({ where: { organizationId: org.id } });
  await db.leaveType.createMany({
    data: DEFAULT_LEAVE_TYPES.map((t, i) => ({
      organizationId: org.id,
      name: t.name,
      paidPercent: t.paidPercent,
      annualQuotaDays: t.annualQuotaDays ?? null,
      color: t.color,
      sortOrder: base + i,
    })),
    skipDuplicates: true,
  });
  revalidatePath("/payroll");
  revalidatePath("/attendance");
}

/**
 * 請假「簽核流程」設定：一組有序關卡，決定請假送出後依序由誰簽核。需 `leave.manage`。
 * 每關的簽核人可以是「直屬主管」(MANAGER，送出時動態解析) 或「指定成員」(MEMBER)。
 * 整份覆寫（關卡數量小、順序即索引，刪除後重建最單純）。
 */
const FlowStepInput = z.object({
  approverType: z.enum(["MANAGER", "MEMBER"]),
  approverMemberId: z.string().min(1).optional().nullable(),
});
const FlowInput = z.object({
  steps: z.array(FlowStepInput).max(10),
});

export async function setLeaveApprovalFlow(input: z.input<typeof FlowInput>) {
  const { org } = await requireOrgPermission("leave.manage");
  const { steps } = FlowInput.parse(input);

  // 指定成員的關卡：驗證該成員屬於目前組織。
  const memberIds = steps
    .filter((s) => s.approverType === "MEMBER")
    .map((s) => s.approverMemberId)
    .filter((id): id is string => Boolean(id));
  if (memberIds.length) {
    const found = await db.organizationMember.count({
      where: { id: { in: memberIds }, organizationId: org.id },
    });
    if (found !== new Set(memberIds).size) {
      return { ok: false as const, error: "指定的簽核成員不屬於目前組織。" };
    }
  }
  // MEMBER 關卡一定要指定成員。
  for (const s of steps) {
    if (s.approverType === "MEMBER" && !s.approverMemberId) {
      return {
        ok: false as const,
        error: "「指定成員」的關卡請選擇一位簽核人。",
      };
    }
  }

  await db.$transaction([
    db.leaveApprovalStep.deleteMany({ where: { organizationId: org.id } }),
    db.leaveApprovalStep.createMany({
      data: steps.map((s, i) => ({
        organizationId: org.id,
        sortOrder: i,
        approverType: s.approverType,
        approverMemberId:
          s.approverType === "MEMBER" ? (s.approverMemberId ?? null) : null,
      })),
    }),
  ]);
  revalidatePath("/leave");
  return { ok: true as const };
}
