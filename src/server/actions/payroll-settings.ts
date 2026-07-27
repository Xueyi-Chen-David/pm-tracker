"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { requireOrgPermission } from "@/server/org";
import {
  DEFAULT_PAYROLL_SETTING_2026,
  DEFAULT_INSURANCE_GRID_2026,
} from "@/lib/insurance";
import { DEFAULT_SALARY_ITEMS } from "@/lib/salary-items";

/**
 * 薪資 / 勞健保設定（每組織一份）＋投保金額分級表。皆需 `payroll.manage`。
 * 費率與級距是「資料」——可一鍵帶當年法定預設，之後 HR 自行維護（每年新制自己改）。
 */

const SEED_YEAR = 2026;

/** 一鍵帶入 2026（民國115年）法定預設：費率 / 上限 + 投保金額分級表。 */
export async function seedPayrollDefaults() {
  const { org } = await requireOrgPermission("payroll.manage");
  await db.$transaction([
    db.payrollSetting.upsert({
      where: { organizationId: org.id },
      update: { ...DEFAULT_PAYROLL_SETTING_2026, seededYear: SEED_YEAR },
      create: {
        organizationId: org.id,
        ...DEFAULT_PAYROLL_SETTING_2026,
        seededYear: SEED_YEAR,
      },
    }),
    db.insuranceBracket.deleteMany({ where: { organizationId: org.id } }),
    db.insuranceBracket.createMany({
      data: DEFAULT_INSURANCE_GRID_2026.map((amount, i) => ({
        organizationId: org.id,
        amount,
        sortOrder: i,
      })),
    }),
  ]);
  revalidatePath("/payroll");
}

const rate = z.coerce.number().min(0).max(1);
const money = z.coerce.number().int().min(0).max(10_000_000);

const SettingInput = z.object({
  laborRate: rate,
  laborEmployeeShare: rate,
  laborEmployerShare: rate,
  healthRate: rate,
  healthEmployeeShare: rate,
  healthEmployerShare: rate,
  healthAvgDependents: z.coerce.number().min(0).max(10),
  pensionEmployerRate: rate,
  occupationalRate: rate,
  supplementaryRate: rate,
  laborCeiling: money,
  healthCeiling: money,
  pensionCeiling: money,
  minWageMonthly: money,
  minWageHourly: money,
});

/** 更新費率 / 上限設定（沿用現有值 upsert；建立時補上 2026 預設中未列的欄位）。 */
export async function updatePayrollSetting(
  input: z.input<typeof SettingInput>,
) {
  const { org } = await requireOrgPermission("payroll.manage");
  const d = SettingInput.parse(input);
  await db.payrollSetting.upsert({
    where: { organizationId: org.id },
    update: d,
    create: { organizationId: org.id, ...d },
  });
  revalidatePath("/payroll");
}

const BracketsInput = z.object({
  amounts: z.array(z.coerce.number().int().min(1).max(10_000_000)).max(200),
});

/** 整份覆寫投保金額分級表（由低到高排序、去重）。 */
export async function setInsuranceBrackets(
  input: z.input<typeof BracketsInput>,
) {
  const { org } = await requireOrgPermission("payroll.manage");
  const { amounts } = BracketsInput.parse(input);
  const uniqueAsc = [...new Set(amounts)].sort((a, b) => a - b);
  await db.$transaction([
    db.insuranceBracket.deleteMany({ where: { organizationId: org.id } }),
    db.insuranceBracket.createMany({
      data: uniqueAsc.map((amount, i) => ({
        organizationId: org.id,
        amount,
        sortOrder: i,
      })),
    }),
  ]);
  revalidatePath("/payroll");
}

// ─────────────────────────────────────────────
// 薪資科目目錄（SalaryItemDef，Phase 2）
// ─────────────────────────────────────────────

const ItemInput = z.object({
  name: z.string().trim().min(1, "請輸入科目名稱").max(30),
  kind: z.enum(["EARNING", "DEDUCTION"]),
  taxable: z.boolean().default(true),
  countsToInsurance: z.boolean().default(true),
  recurring: z.boolean().default(true),
  taxFreeLimit: z.coerce.number().int().min(0).max(10_000_000).nullish(),
  active: z.boolean().default(true),
});

/** 一鍵建立台灣常見薪資科目（已存在同名者略過）。 */
export async function seedDefaultSalaryItems() {
  const { org } = await requireOrgPermission("payroll.manage");
  const base = await db.salaryItemDef.count({
    where: { organizationId: org.id },
  });
  await db.salaryItemDef.createMany({
    data: DEFAULT_SALARY_ITEMS.map((t, i) => ({
      organizationId: org.id,
      name: t.name,
      kind: t.kind,
      taxable: t.taxable,
      countsToInsurance: t.countsToInsurance,
      recurring: t.recurring,
      taxFreeLimit: t.taxFreeLimit,
      sortOrder: base + i,
    })),
    skipDuplicates: true,
  });
  revalidatePath("/payroll");
}

export async function createSalaryItemDef(input: z.input<typeof ItemInput>) {
  const { org } = await requireOrgPermission("payroll.manage");
  const d = ItemInput.parse(input);
  const count = await db.salaryItemDef.count({
    where: { organizationId: org.id },
  });
  try {
    await db.salaryItemDef.create({
      data: {
        organizationId: org.id,
        name: d.name,
        kind: d.kind,
        taxable: d.taxable,
        countsToInsurance: d.countsToInsurance,
        recurring: d.recurring,
        taxFreeLimit: d.taxFreeLimit ?? null,
        active: d.active,
        sortOrder: count,
      },
    });
  } catch (e) {
    if ((e as { code?: string })?.code === "P2002")
      return { ok: false as const, error: "已有同名薪資科目。" };
    throw e;
  }
  revalidatePath("/payroll");
  return { ok: true as const };
}

const UpdateItemInput = ItemInput.extend({ id: z.string().min(1) });

export async function updateSalaryItemDef(
  input: z.input<typeof UpdateItemInput>,
) {
  const { org } = await requireOrgPermission("payroll.manage");
  const d = UpdateItemInput.parse(input);
  const existing = await db.salaryItemDef.findFirst({
    where: { id: d.id, organizationId: org.id },
    select: { id: true },
  });
  if (!existing) {
    return {
      ok: false as const,
      error: "找不到薪資科目，或它不屬於目前組織。",
    };
  }
  try {
    await db.salaryItemDef.update({
      where: { id: d.id },
      data: {
        name: d.name,
        kind: d.kind,
        taxable: d.taxable,
        countsToInsurance: d.countsToInsurance,
        recurring: d.recurring,
        taxFreeLimit: d.taxFreeLimit ?? null,
        active: d.active,
      },
    });
  } catch (e) {
    if ((e as { code?: string })?.code === "P2002")
      return { ok: false as const, error: "已有同名薪資科目。" };
    throw e;
  }
  revalidatePath("/payroll");
  return { ok: true as const };
}

export async function deleteSalaryItemDef(id: string) {
  const { org } = await requireOrgPermission("payroll.manage");
  await db.salaryItemDef.deleteMany({ where: { id, organizationId: org.id } });
  revalidatePath("/payroll");
}
