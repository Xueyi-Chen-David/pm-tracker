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

const STAGE = z.string().trim().min(1); // DealStage.key（每組織自訂）
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
  if (res.count === 0) return { ok: false as const, error: "找不到聯絡人" };
  revalidate();
  return { ok: true as const };
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
    if (!c) return { ok: false as const, error: "找不到聯絡人" };
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
  // 時間線起點：建立於哪個階段。
  await db.dealStageChange.create({
    data: {
      organizationId: org.id,
      dealId: deal.id,
      fromStage: null,
      toStage: d.stage,
      changedById: user.id,
    },
  });
  revalidate();
  return { ok: true as const, ...deal };
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
  const { user, org } = await requireActiveOrg();
  const p = DealPatch.parse(patch);
  const deal = await db.crmDeal.findFirst({
    where: { id, organizationId: org.id },
    select: { id: true, stage: true },
  });
  if (!deal) return { ok: false as const, error: "找不到商機" };
  if (p.contactId) {
    const c = await db.crmContact.findFirst({
      where: { id: p.contactId, organizationId: org.id },
      select: { id: true },
    });
    if (!c) return { ok: false as const, error: "找不到聯絡人" };
  }
  const stageChanged = p.stage !== undefined && p.stage !== deal.stage;
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
  // 在編輯視窗改階段也記入時間線（無原因）。
  if (stageChanged) {
    await db.dealStageChange.create({
      data: {
        organizationId: org.id,
        dealId: id,
        fromStage: deal.stage,
        toStage: p.stage!,
        changedById: user.id,
      },
    });
  }
  revalidate();
  return { ok: true as const };
}

/** 看板移動：換階段，並記入時間線（可帶原因）。 */
export async function moveDealStage(id: string, stage: string, reason?: string) {
  const { user, org } = await requireActiveOrg();
  const s = STAGE.parse(stage);
  const deal = await db.crmDeal.findFirst({
    where: { id, organizationId: org.id },
    select: { id: true, stage: true },
  });
  if (!deal) return { ok: false as const, error: "找不到商機" };
  if (deal.stage === s) return { ok: true as const }; // 沒換階段
  const max = await db.crmDeal.aggregate({
    where: { organizationId: org.id, stage: s, status: "OPEN" },
    _max: { sortOrder: true },
  });
  await db.$transaction([
    db.crmDeal.update({
      where: { id },
      data: { stage: s, sortOrder: (max._max.sortOrder ?? 0) + 1 },
    }),
    db.dealStageChange.create({
      data: {
        organizationId: org.id,
        dealId: id,
        fromStage: deal.stage,
        toStage: s,
        reason: reason?.trim() || null,
        changedById: user.id,
      },
    }),
  ]);
  revalidate();
  return { ok: true as const };
}

/** 標記成交 / 流失 / 重開（回到管線）。 */
export async function setDealStatus(id: string, status: z.input<typeof STATUS>) {
  const { org } = await requireActiveOrg();
  const s = STATUS.parse(status);
  const res = await db.crmDeal.updateMany({
    where: { id, organizationId: org.id },
    data: { status: s, closedAt: s === "OPEN" ? null : new Date() },
  });
  if (res.count === 0) return { ok: false as const, error: "找不到商機" };
  revalidate();
  return { ok: true as const };
}

export async function deleteDeal(id: string) {
  const { org } = await requireActiveOrg();
  await db.crmDeal.deleteMany({ where: { id, organizationId: org.id } });
  revalidate();
}

// ── 管線階段（每組織可自訂） ────────────────────

const StageInput = z.object({
  label: z.string().trim().min(1, "請輸入階段名稱").max(40),
  note: z.string().trim().max(500).optional(),
  color: z.string().trim().max(20).optional(),
});

export async function createDealStage(input: z.input<typeof StageInput>) {
  const { org } = await requireActiveOrg();
  const d = StageInput.parse(input);
  const max = await db.dealStage.aggregate({
    where: { organizationId: org.id },
    _max: { sortOrder: true },
  });
  await db.dealStage.create({
    data: {
      organizationId: org.id,
      key: crypto.randomUUID(), // 自訂階段用穩定隨機鍵
      label: d.label,
      note: d.note || null,
      color: d.color || "slate",
      sortOrder: (max._max.sortOrder ?? -1) + 1,
    },
  });
  revalidate();
}

export async function updateDealStage(
  id: string,
  input: z.input<typeof StageInput>,
) {
  const { org } = await requireActiveOrg();
  const d = StageInput.parse(input);
  const res = await db.dealStage.updateMany({
    where: { id, organizationId: org.id },
    data: { label: d.label, note: d.note || null, color: d.color || "slate" },
  });
  if (res.count === 0) return { ok: false as const, error: "找不到階段" };
  revalidate();
  return { ok: true as const };
}

export async function deleteDealStage(id: string) {
  const { org } = await requireActiveOrg();
  const stage = await db.dealStage.findFirst({
    where: { id, organizationId: org.id },
    select: { key: true },
  });
  if (!stage) return { ok: false as const, error: "找不到階段" };
  const total = await db.dealStage.count({ where: { organizationId: org.id } });
  if (total <= 1) return { ok: false as const, error: "至少保留一個階段" };
  const inUse = await db.crmDeal.count({
    where: { organizationId: org.id, stage: stage.key },
  });
  if (inUse > 0) {
    return {
      ok: false as const,
      error: `此階段還有 ${inUse} 個商機，請先移走再刪除`,
    };
  }
  await db.dealStage.delete({ where: { id } });
  revalidate();
  return { ok: true as const };
}

/** 讀某商機的階段異動時間線（含變更者名稱），供時間軸視覺化。 */
export async function listDealStageChanges(dealId: string) {
  const { org } = await requireActiveOrg();
  const changes = await db.dealStageChange.findMany({
    where: { organizationId: org.id, dealId },
    orderBy: { changedAt: "asc" },
    select: {
      id: true,
      fromStage: true,
      toStage: true,
      reason: true,
      changedAt: true,
      changedById: true,
    },
  });
  const ids = [
    ...new Set(changes.map((c) => c.changedById).filter((v): v is string => !!v)),
  ];
  const users = ids.length
    ? await db.user.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          name: true,
          nickname: true,
          useNickname: true,
          email: true,
        },
      })
    : [];
  const byId = new Map(users.map((u) => [u.id, u]));
  return changes.map((c) => ({
    ...c,
    changedBy: c.changedById ? (byId.get(c.changedById) ?? null) : null,
  }));
}

// ── CRM 活動紀錄（org-scoped，獨立於商機）─────────

const EventInput = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "請選擇日期"),
  type: z.string().trim().min(1).max(30).default("活動"),
  title: z.string().trim().min(1, "請輸入主題").max(200),
  notes: z.string().trim().max(8000).optional(),
  link: z.string().trim().max(2000).optional(),
  contactId: z.string().nullable().optional(),
});

function eventDate(
  v: string,
): { ok: true; value: Date } | { ok: false; error: string } {
  const d = toUtcDate(v);
  if (!d) return { ok: false, error: "日期格式錯誤" };
  return { ok: true, value: d };
}

/** 驗證聯絡人屬於本組織；空值回 null。 */
async function resolveContactId(
  orgId: string,
  contactId?: string | null,
): Promise<{ ok: true; value: string | null } | { ok: false; error: string }> {
  if (!contactId) return { ok: true, value: null };
  const c = await db.crmContact.findFirst({
    where: { id: contactId, organizationId: orgId },
    select: { id: true },
  });
  if (!c) return { ok: false, error: "找不到聯絡人" };
  return { ok: true, value: c.id };
}

export async function createCrmEvent(input: z.input<typeof EventInput>) {
  const { user, org } = await requireActiveOrg();
  const d = EventInput.parse(input);
  const dateRes = eventDate(d.date);
  if (!dateRes.ok) return { ok: false as const, error: dateRes.error };
  const contactRes = await resolveContactId(org.id, d.contactId);
  if (!contactRes.ok) return { ok: false as const, error: contactRes.error };
  await db.crmEvent.create({
    data: {
      organizationId: org.id,
      date: dateRes.value,
      type: d.type,
      title: d.title,
      notes: d.notes || null,
      link: d.link || null,
      contactId: contactRes.value,
      createdById: user.id,
    },
  });
  revalidate();
  return { ok: true as const };
}

export async function updateCrmEvent(
  id: string,
  input: z.input<typeof EventInput>,
) {
  const { org } = await requireActiveOrg();
  const d = EventInput.parse(input);
  const dateRes = eventDate(d.date);
  if (!dateRes.ok) return { ok: false as const, error: dateRes.error };
  const contactRes = await resolveContactId(org.id, d.contactId);
  if (!contactRes.ok) return { ok: false as const, error: contactRes.error };
  const res = await db.crmEvent.updateMany({
    where: { id, organizationId: org.id },
    data: {
      date: dateRes.value,
      type: d.type,
      title: d.title,
      notes: d.notes || null,
      link: d.link || null,
      contactId: contactRes.value,
    },
  });
  if (res.count === 0) return { ok: false as const, error: "找不到活動" };
  revalidate();
  return { ok: true as const };
}

export async function deleteCrmEvent(id: string) {
  const { org } = await requireActiveOrg();
  await db.crmEvent.deleteMany({ where: { id, organizationId: org.id } });
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
  if (!deal) return { ok: false as const, error: "找不到商機" };
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
  return { ok: true as const };
}

export async function toggleActivityDone(id: string, done: boolean) {
  const { org } = await requireActiveOrg();
  const res = await db.crmActivity.updateMany({
    where: { id, deal: { organizationId: org.id } },
    data: { done },
  });
  if (res.count === 0) return { ok: false as const, error: "找不到活動" };
  revalidate();
  return { ok: true as const };
}

export async function deleteActivity(id: string) {
  const { org } = await requireActiveOrg();
  await db.crmActivity.deleteMany({
    where: { id, deal: { organizationId: org.id } },
  });
  revalidate();
}
