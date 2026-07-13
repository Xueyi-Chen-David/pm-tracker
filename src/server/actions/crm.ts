"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { requireActiveOrg } from "@/server/org";

function toUtcDate(v?: string | null): Date | null {
  if (!v) return null;
  const [y, m, d] = v.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d));
}

function revalidate() {
  revalidatePath("/crm");
}

const STAGE = z.enum(["LEAD", "QUALIFIED", "PROPOSAL", "NEGOTIATION"]);
const STATUS = z.enum(["OPEN", "WON", "LOST"]);

// ── 聯絡人 ──────────────────────────────────────

const ContactInput = z.object({
  name: z.string().trim().min(1, "請輸入名稱").max(160),
  company: z.string().trim().max(160).optional(),
  title: z.string().trim().max(120).optional(),
  email: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(60).optional(),
  note: z.string().trim().max(4000).optional(),
  ownerId: z.string().optional(),
});

export async function createContact(input: z.input<typeof ContactInput>) {
  const { user, org } = await requireActiveOrg();
  const d = ContactInput.parse(input);
  const contact = await db.crmContact.create({
    data: {
      organizationId: org.id,
      name: d.name,
      company: d.company || null,
      title: d.title || null,
      email: d.email || null,
      phone: d.phone || null,
      note: d.note || null,
      ownerId: d.ownerId || null,
      createdById: user.id,
    },
    select: { id: true },
  });
  revalidate();
  return contact;
}

export async function updateContact(
  id: string,
  input: z.input<typeof ContactInput>,
) {
  const { org } = await requireActiveOrg();
  const d = ContactInput.parse(input);
  const res = await db.crmContact.updateMany({
    where: { id, organizationId: org.id },
    data: {
      name: d.name,
      company: d.company || null,
      title: d.title || null,
      email: d.email || null,
      phone: d.phone || null,
      note: d.note || null,
      ownerId: d.ownerId || null,
    },
  });
  if (res.count === 0) throw new Error("找不到聯絡人");
  revalidate();
}

export async function deleteContact(id: string) {
  const { org } = await requireActiveOrg();
  await db.crmContact.deleteMany({ where: { id, organizationId: org.id } });
  revalidate();
}

// ── 商機 ────────────────────────────────────────

const DealInput = z.object({
  title: z.string().trim().min(1, "請輸入商機名稱").max(200),
  value: z.coerce.number().int().min(0).max(1_000_000_000_000).default(0),
  stage: STAGE.default("LEAD"),
  contactId: z.string().nullable().optional(),
  ownerId: z.string().nullable().optional(),
  expectedCloseDate: z.string().nullable().optional(),
  note: z.string().trim().max(4000).nullable().optional(),
});

export async function createDeal(input: z.input<typeof DealInput>) {
  const { user, org } = await requireActiveOrg();
  const d = DealInput.parse(input);
  if (d.contactId) {
    const c = await db.crmContact.findFirst({
      where: { id: d.contactId, organizationId: org.id },
      select: { id: true },
    });
    if (!c) throw new Error("找不到聯絡人");
  }
  const max = await db.crmDeal.aggregate({
    where: { organizationId: org.id, stage: d.stage, status: "OPEN" },
    _max: { sortOrder: true },
  });
  const deal = await db.crmDeal.create({
    data: {
      organizationId: org.id,
      title: d.title,
      value: d.value ?? 0,
      stage: d.stage,
      contactId: d.contactId || null,
      ownerId: d.ownerId || null,
      expectedCloseDate: toUtcDate(d.expectedCloseDate),
      note: d.note || null,
      sortOrder: (max._max.sortOrder ?? 0) + 1,
      createdById: user.id,
    },
    select: { id: true },
  });
  revalidate();
  return deal;
}

const DealPatch = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  value: z.coerce.number().int().min(0).max(1_000_000_000_000).optional(),
  stage: STAGE.optional(),
  contactId: z.string().nullable().optional(),
  ownerId: z.string().nullable().optional(),
  expectedCloseDate: z.string().nullable().optional(),
  note: z.string().trim().max(4000).nullable().optional(),
});

export async function updateDeal(id: string, patch: z.input<typeof DealPatch>) {
  const { org } = await requireActiveOrg();
  const p = DealPatch.parse(patch);
  const deal = await db.crmDeal.findFirst({
    where: { id, organizationId: org.id },
    select: { id: true },
  });
  if (!deal) throw new Error("找不到商機");
  if (p.contactId) {
    const c = await db.crmContact.findFirst({
      where: { id: p.contactId, organizationId: org.id },
      select: { id: true },
    });
    if (!c) throw new Error("找不到聯絡人");
  }
  await db.crmDeal.update({
    where: { id },
    data: {
      ...(p.title !== undefined ? { title: p.title } : {}),
      ...(p.value !== undefined ? { value: p.value } : {}),
      ...(p.stage !== undefined ? { stage: p.stage } : {}),
      ...(p.contactId !== undefined ? { contactId: p.contactId || null } : {}),
      ...(p.ownerId !== undefined ? { ownerId: p.ownerId || null } : {}),
      ...(p.expectedCloseDate !== undefined
        ? { expectedCloseDate: toUtcDate(p.expectedCloseDate) }
        : {}),
      ...(p.note !== undefined ? { note: p.note || null } : {}),
    },
  });
  revalidate();
}

/** 看板移動：換階段（僅對進行中的商機）。 */
export async function moveDealStage(
  id: string,
  stage: z.input<typeof STAGE>,
) {
  const { org } = await requireActiveOrg();
  const s = STAGE.parse(stage);
  const max = await db.crmDeal.aggregate({
    where: { organizationId: org.id, stage: s, status: "OPEN" },
    _max: { sortOrder: true },
  });
  const res = await db.crmDeal.updateMany({
    where: { id, organizationId: org.id },
    data: { stage: s, sortOrder: (max._max.sortOrder ?? 0) + 1 },
  });
  if (res.count === 0) throw new Error("找不到商機");
  revalidate();
}

/** 標記成交 / 流失 / 重開（回到管線）。 */
export async function setDealStatus(id: string, status: z.input<typeof STATUS>) {
  const { org } = await requireActiveOrg();
  const s = STATUS.parse(status);
  const res = await db.crmDeal.updateMany({
    where: { id, organizationId: org.id },
    data: { status: s, closedAt: s === "OPEN" ? null : new Date() },
  });
  if (res.count === 0) throw new Error("找不到商機");
  revalidate();
}

export async function deleteDeal(id: string) {
  const { org } = await requireActiveOrg();
  await db.crmDeal.deleteMany({ where: { id, organizationId: org.id } });
  revalidate();
}

// ── 活動 / 備註 ─────────────────────────────────

/** 讀某商機的活動時間軸（供編輯對話框開啟時載入）。 */
export async function listDealActivities(dealId: string) {
  const { org } = await requireActiveOrg();
  return db.crmActivity.findMany({
    where: { dealId, deal: { organizationId: org.id } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      type: true,
      body: true,
      dueDate: true,
      done: true,
      createdAt: true,
    },
  });
}

const ActivityInput = z.object({
  dealId: z.string().min(1),
  type: z.enum(["note", "call", "email", "meeting", "task"]).default("note"),
  body: z.string().trim().min(1, "請輸入內容").max(4000),
  dueDate: z.string().nullable().optional(),
});

export async function addActivity(input: z.input<typeof ActivityInput>) {
  const { user, org } = await requireActiveOrg();
  const d = ActivityInput.parse(input);
  const deal = await db.crmDeal.findFirst({
    where: { id: d.dealId, organizationId: org.id },
    select: { id: true },
  });
  if (!deal) throw new Error("找不到商機");
  await db.crmActivity.create({
    data: {
      dealId: d.dealId,
      type: d.type,
      body: d.body,
      dueDate: toUtcDate(d.dueDate),
      createdById: user.id,
    },
  });
  revalidate();
}

export async function toggleActivityDone(id: string, done: boolean) {
  const { org } = await requireActiveOrg();
  const res = await db.crmActivity.updateMany({
    where: { id, deal: { organizationId: org.id } },
    data: { done },
  });
  if (res.count === 0) throw new Error("找不到活動");
  revalidate();
}

export async function deleteActivity(id: string) {
  const { org } = await requireActiveOrg();
  await db.crmActivity.deleteMany({
    where: { id, deal: { organizationId: org.id } },
  });
  revalidate();
}
