"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { requireInstalledModule } from "@/server/org";
import { convert } from "@/lib/foodlabel/engine";
import {
  extractFoodLabel,
  validateImageDataUrl,
  type FoodLabelOcrFields,
} from "@/server/gemini";
import { DEFAULT_REGULATION_ID, REGULATIONS } from "@/lib/foodlabel/regulations";

/**
 * 食品標示模組的 server actions。
 *
 * 兩個原則：
 * 1. 每個 action 先過 requireInstalledModule("foodlabel")——組織移除安裝後就寫不進來。
 * 2. 轉換結果**一律在伺服器端重算**。前端也會跑同一份純函式做即時預覽，但存進資料庫
 *    的必須是伺服器算的，否則等於讓瀏覽器決定合規結論。
 */

const ProductInput = z.object({
  id: z.string().min(1).optional(),
  name: z.string().trim().min(1, "請輸入商品名稱").max(200),
  nameZh: z.string().trim().max(200).optional(),
  supplier: z.string().trim().max(200).optional(),
  state: z.enum(["solid", "liquid"]).default("solid"),
  servingSize: z.number().positive().max(100000).nullable().optional(),
  packageSize: z.number().positive().max(100000).nullable().optional(),
  crmDealId: z.string().min(1).nullable().optional(),
});

const ConvertInput = ProductInput.extend({
  sourceText: z.string().trim().min(1, "請貼上日本營養成分表示"),
  regulationId: z.string().default(DEFAULT_REGULATION_ID),
  basisOverride: z.number().positive().max(100000).nullable().optional(),
});

export type FoodLabelActionResult =
  | { ok: true; productId: string; conversionId: string }
  | { ok: false; error: string };

/** 轉換並存檔：建立 / 更新商品，再寫入一筆轉換紀錄。 */
export async function saveConversion(
  input: z.input<typeof ConvertInput>,
): Promise<FoodLabelActionResult> {
  const { org, user } = await requireInstalledModule("foodlabel");
  const parsed = ConvertInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "資料格式錯誤" };
  }
  const d = parsed.data;
  const regulationId = REGULATIONS[d.regulationId]
    ? d.regulationId
    : DEFAULT_REGULATION_ID;

  // CRM 商機是選填關聯；只接受屬於本組織的商機，避免跨組織掛載。
  let crmDealId: string | null = null;
  if (d.crmDealId) {
    const deal = await db.crmDeal.findFirst({
      where: { id: d.crmDealId, organizationId: org.id },
      select: { id: true },
    });
    crmDealId = deal?.id ?? null;
  }

  const productData = {
    name: d.name,
    nameZh: d.nameZh || null,
    supplier: d.supplier || null,
    state: d.state,
    servingSize: d.servingSize ?? null,
    packageSize: d.packageSize ?? null,
    crmDealId,
  };

  // 伺服器端重算（前端預覽的結果不採信）。
  const result = convert({
    sourceText: d.sourceText,
    regulationId,
    product: {
      productName: d.nameZh || d.name,
      servingSize: d.servingSize ?? null,
      packageSize: d.packageSize ?? null,
      state: d.state,
    },
    basisOverride: d.basisOverride
      ? { amount: d.basisOverride, unit: d.state === "liquid" ? "ml" : "g" }
      : null,
  });

  let productId = d.id ?? null;
  if (productId) {
    // updateMany + organizationId＝縱深防禦（擋跨組織更新）。
    const res = await db.foodLabelProduct.updateMany({
      where: { id: productId, organizationId: org.id },
      data: productData,
    });
    if (res.count === 0) return { ok: false, error: "找不到商品，或它不屬於目前組織。" };
  } else {
    const created = await db.foodLabelProduct.create({
      data: { ...productData, organizationId: org.id, createdById: user.id },
      select: { id: true },
    });
    productId = created.id;
  }

  const conversion = await db.foodLabelConversion.create({
    data: {
      organizationId: org.id,
      productId,
      sourceText: d.sourceText,
      regulationId,
      resultJson: result as unknown as Prisma.InputJsonValue,
      errorCount: result.issues.filter((i) => i.level === "error").length,
      warningCount: result.issues.filter((i) => i.level === "warning").length,
      createdById: user.id,
    },
    select: { id: true },
  });

  revalidatePath("/foodlabel");
  return { ok: true, productId, conversionId: conversion.id };
}

/** 刪除商品（含其所有轉換紀錄，由 FK CASCADE 處理）。 */
export async function deleteProduct(id: string): Promise<void> {
  const { org } = await requireInstalledModule("foodlabel");
  await db.foodLabelProduct.deleteMany({
    where: { id, organizationId: org.id },
  });
  revalidatePath("/foodlabel");
}

/** 刪除單筆轉換紀錄（商品保留）。 */
export async function deleteConversion(id: string): Promise<void> {
  const { org } = await requireInstalledModule("foodlabel");
  await db.foodLabelConversion.deleteMany({
    where: { id, organizationId: org.id },
  });
  revalidatePath("/foodlabel");
}

/**
 * 包裝照片 OCR：讀出商品名、供應商、内容量與「栄養成分表示」原文，供前端自動填表。
 *
 * 注意分工：OCR 只把包裝上的字讀出來，換算與合規判定仍然全部走
 * src/lib/foodlabel 的規則引擎。不讓 AI 去算法規——那樣的結果無法稽核、
 * 也沒辦法跟著法規版本走。
 */
export async function extractFoodLabelFields(
  dataUrl: string,
): Promise<
  { ok: true; fields: FoodLabelOcrFields } | { ok: false; error: string }
> {
  await requireInstalledModule("foodlabel");
  const v = validateImageDataUrl(dataUrl, "包裝照片");
  if (!v.ok) return { ok: false, error: v.error };
  return extractFoodLabel(dataUrl);
}
