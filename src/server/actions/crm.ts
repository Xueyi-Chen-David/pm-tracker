"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { requireActiveOrg } from "@/server/org";
import { primaryName } from "@/lib/display";
import { CRM_ACTIVITY_ICON, CRM_ACTIVITY_LABEL, CRM_EVENT_ICON } from "@/lib/crm";
import { extractBusinessCard, type BusinessCardFields } from "@/server/gemini";

// 名片 data URL 格式（png/jpeg/webp/gif 的 base64）；跟 team.ts 的頭貼驗證同一套規則。
const CARD_DATA_URL_RE = /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/;
const CARD_MAX_LEN = 1_500_000; // 約對應 1.1MB 原始圖片（前端已壓縮，這是防呆上限）

function validateCardDataUrl(v: string): { ok: true } | { ok: false; error: string } {
  if (!CARD_DATA_URL_RE.test(v)) return { ok: false, error: "名片圖片格式不正確。" };
  if (v.length > CARD_MAX_LEN) return { ok: false, error: "名片圖片太大，請換小一點的圖片。" };
  return { ok: true };
}

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
  businessCardImage: z.string().nullable().optional(),
});

/**
 * 聯絡人填了「公司」欄位時，順手建一筆空白的企業基本檔案（如果這個公司字串還沒建過）。
 * 用 upsert + update:{} 確保已存在的檔案（可能已填了很多資料）不會被這裡蓋成空的；
 * 純粹是讓「依公司」列表 / 公司資料卡不會因為使用者只加了聯絡人、還沒手動建過檔案，
 * 而完全看不到這家公司或要點「新增資料」才看得到編輯入口。
 */
async function ensureCompanyProfile(orgId: string, company: string, userId: string) {
  const name = company.trim();
  if (!name) return;
  await db.crmCompanyProfile.upsert({
    where: { organizationId_company: { organizationId: orgId, company: name } },
    create: { organizationId: orgId, company: name, createdById: userId },
    update: {},
  });
}

export async function createContact(input: z.input<typeof ContactInput>) {
  const { user, org } = await requireActiveOrg();
  const d = ContactInput.parse(input);
  if (d.businessCardImage) {
    const v = validateCardDataUrl(d.businessCardImage);
    if (!v.ok) return { ok: false as const, error: v.error };
  }
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
      businessCardImage: d.businessCardImage || null,
      createdById: user.id,
    },
    select: { id: true },
  });
  if (d.company) await ensureCompanyProfile(org.id, d.company, user.id);
  revalidate();
  return { ok: true as const, ...contact };
}

export async function updateContact(
  id: string,
  input: z.input<typeof ContactInput>,
) {
  const { user, org } = await requireActiveOrg();
  const d = ContactInput.parse(input);
  if (d.businessCardImage) {
    const v = validateCardDataUrl(d.businessCardImage);
    if (!v.ok) return { ok: false as const, error: v.error };
  }
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
      businessCardImage: d.businessCardImage || null,
    },
  });
  if (res.count === 0) return { ok: false as const, error: "找不到聯絡人" };
  if (d.company) await ensureCompanyProfile(org.id, d.company, user.id);
  revalidate();
  return { ok: true as const };
}

/** 讀單一聯絡人的名片圖片（列表查詢刻意不撈這欄，編輯時才個別讀）。 */
export async function getContactCard(id: string): Promise<string | null> {
  const { org } = await requireActiveOrg();
  const row = await db.crmContact.findFirst({
    where: { id, organizationId: org.id },
    select: { businessCardImage: true },
  });
  return row?.businessCardImage ?? null;
}

/** 名片 OCR：讀圖片辨識姓名 / 公司 / 職稱 / Email / 電話，供前端自動填表。 */
export async function extractContactCardFields(
  dataUrl: string,
): Promise<{ ok: true; fields: BusinessCardFields } | { ok: false; error: string }> {
  await requireActiveOrg();
  const v = validateCardDataUrl(dataUrl);
  if (!v.ok) return { ok: false, error: v.error };
  return extractBusinessCard(dataUrl);
}

export async function deleteContact(id: string) {
  const { org } = await requireActiveOrg();
  await db.crmContact.deleteMany({ where: { id, organizationId: org.id } });
  revalidate();
}

// ── 商機 ────────────────────────────────────────

const PROBABILITY = z.coerce.number().int().min(0).max(100).nullable();

/**
 * 商機的聯絡人 / 負責人現在可多選；「主要」那位鏡射到 CrmDeal.contactId / ownerId
 * （見 schema.prisma 的 CrmDealContact / CrmDealOwner 註解）。若前端沒指定 primary*Id，
 * 或指定的不在選取清單裡，退回清單第一位；清單空了就是 null。
 */
function resolvePrimary(ids: string[], primaryId?: string | null): string | null {
  if (primaryId && ids.includes(primaryId)) return primaryId;
  return ids[0] ?? null;
}

/** 依「多選清單 + 主要」重寫一筆商機的完整聯絡人 / 負責人關聯（先清空再整批建立）。 */
async function syncDealTeam(
  dealId: string,
  contactIds: string[],
  primaryContactId: string | null,
  ownerIds: string[],
  primaryOwnerId: string | null,
) {
  await db.$transaction([
    db.crmDealContact.deleteMany({ where: { dealId } }),
    db.crmDealOwner.deleteMany({ where: { dealId } }),
    ...(contactIds.length
      ? [
          db.crmDealContact.createMany({
            data: contactIds.map((contactId) => ({
              dealId,
              contactId,
              isPrimary: contactId === primaryContactId,
            })),
          }),
        ]
      : []),
    ...(ownerIds.length
      ? [
          db.crmDealOwner.createMany({
            data: ownerIds.map((userId) => ({
              dealId,
              userId,
              isPrimary: userId === primaryOwnerId,
            })),
          }),
        ]
      : []),
  ]);
}

/** 「新增 / 編輯商機」視窗開啟時查：目前完整的聯絡人 / 負責人名單（含主要標記）。 */
export async function getDealTeam(dealId: string) {
  const { org } = await requireActiveOrg();
  const deal = await db.crmDeal.findFirst({
    where: { id: dealId, organizationId: org.id },
    select: {
      contactLinks: { select: { contactId: true, isPrimary: true } },
      ownerLinks: { select: { userId: true, isPrimary: true } },
    },
  });
  if (!deal) {
    return { contactIds: [], primaryContactId: null, ownerIds: [], primaryOwnerId: null };
  }
  return {
    contactIds: deal.contactLinks.map((c) => c.contactId),
    primaryContactId: deal.contactLinks.find((c) => c.isPrimary)?.contactId ?? null,
    ownerIds: deal.ownerLinks.map((o) => o.userId),
    primaryOwnerId: deal.ownerLinks.find((o) => o.isPrimary)?.userId ?? null,
  };
}

const DealInput = z.object({
  title: z.string().trim().min(1, "請輸入商機名稱").max(200),
  value: z.coerce.number().int().min(0).max(1_000_000_000_000).default(0),
  stage: STAGE.default("LEAD"),
  contactIds: z.array(z.string()).default([]),
  primaryContactId: z.string().nullable().optional(),
  ownerIds: z.array(z.string()).default([]),
  primaryOwnerId: z.string().nullable().optional(),
  expectedCloseDate: z.string().nullable().optional(),
  probability: PROBABILITY.optional(),
  note: z.string().trim().max(4000).nullable().optional(),
});

export async function createDeal(input: z.input<typeof DealInput>) {
  const { user, org } = await requireActiveOrg();
  const d = DealInput.parse(input);
  if (d.contactIds.length) {
    const count = await db.crmContact.count({
      where: { id: { in: d.contactIds }, organizationId: org.id },
    });
    if (count !== d.contactIds.length) return { ok: false as const, error: "找不到聯絡人" };
  }
  const primaryContactId = resolvePrimary(d.contactIds, d.primaryContactId);
  const primaryOwnerId = resolvePrimary(d.ownerIds, d.primaryOwnerId);

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
      contactId: primaryContactId,
      ownerId: primaryOwnerId,
      expectedCloseDate: toUtcDate(d.expectedCloseDate),
      probability: d.probability ?? null,
      note: d.note || null,
      sortOrder: (max._max.sortOrder ?? 0) + 1,
      createdById: user.id,
    },
    select: { id: true },
  });
  await syncDealTeam(deal.id, d.contactIds, primaryContactId, d.ownerIds, primaryOwnerId);
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
  contactIds: z.array(z.string()).default([]),
  primaryContactId: z.string().nullable().optional(),
  ownerIds: z.array(z.string()).default([]),
  primaryOwnerId: z.string().nullable().optional(),
  expectedCloseDate: z.string().nullable().optional(),
  probability: PROBABILITY.optional(),
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
  if (p.contactIds.length) {
    const count = await db.crmContact.count({
      where: { id: { in: p.contactIds }, organizationId: org.id },
    });
    if (count !== p.contactIds.length) return { ok: false as const, error: "找不到聯絡人" };
  }
  const primaryContactId = resolvePrimary(p.contactIds, p.primaryContactId);
  const primaryOwnerId = resolvePrimary(p.ownerIds, p.primaryOwnerId);

  const stageChanged = p.stage !== undefined && p.stage !== deal.stage;
  await db.crmDeal.update({
    where: { id },
    data: {
      ...(p.title !== undefined ? { title: p.title } : {}),
      ...(p.value !== undefined ? { value: p.value } : {}),
      ...(p.stage !== undefined ? { stage: p.stage } : {}),
      contactId: primaryContactId,
      ownerId: primaryOwnerId,
      ...(p.expectedCloseDate !== undefined
        ? { expectedCloseDate: toUtcDate(p.expectedCloseDate) }
        : {}),
      ...(p.probability !== undefined ? { probability: p.probability } : {}),
      ...(p.note !== undefined ? { note: p.note || null } : {}),
    },
  });
  await syncDealTeam(id, p.contactIds, primaryContactId, p.ownerIds, primaryOwnerId);
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

/** 標記成交 / 流失（可選填原因）/ 重開（回到管線，原因清空）。 */
export async function setDealStatus(
  id: string,
  status: z.input<typeof STATUS>,
  reason?: string,
) {
  const { org } = await requireActiveOrg();
  const s = STATUS.parse(status);
  const res = await db.crmDeal.updateMany({
    where: { id, organizationId: org.id },
    data: {
      status: s,
      closedAt: s === "OPEN" ? null : new Date(),
      closedReason: s === "OPEN" ? null : reason?.trim() || null,
    },
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
  defaultProbability: PROBABILITY.optional(),
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
      defaultProbability: d.defaultProbability ?? null,
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
    data: {
      label: d.label,
      note: d.note || null,
      color: d.color || "slate",
      defaultProbability: d.defaultProbability ?? null,
    },
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
  const activities = await db.crmActivity.findMany({
    where: { dealId, deal: { organizationId: org.id } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      type: true,
      body: true,
      dueDate: true,
      done: true,
      createdAt: true,
      updatedAt: true,
      createdById: true,
    },
  });
  const ids = [
    ...new Set(
      activities.map((a) => a.createdById).filter((v): v is string => !!v),
    ),
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
          image: true,
        },
      })
    : [];
  const byId = new Map(users.map((u) => [u.id, u]));
  return activities.map((a) => ({
    ...a,
    author: a.createdById ? (byId.get(a.createdById) ?? null) : null,
  }));
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

/** 編輯一則活動 / 跟進的內容（類型、到期日不可改——要換類型就刪掉重建）。 */
export async function updateActivity(id: string, body: string) {
  const { org } = await requireActiveOrg();
  const b = z.string().trim().min(1, "請輸入內容").max(4000).parse(body);
  const res = await db.crmActivity.updateMany({
    where: { id, deal: { organizationId: org.id } },
    data: { body: b },
  });
  if (res.count === 0) return { ok: false as const, error: "找不到活動" };
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

// ── 企業時間軸（依聯絡人「公司」欄位分組，彙整跨聯絡人的完整歷史）───

export type CompanyTimelineEntry = {
  id: string;
  at: string; // ISO，供排序 / 顯示
  color: string; // STAGE_COLORS 的色彩鍵
  chip: string; // 徽章文字
  icon: string | null; // 前綴圖示（emoji）
  contactName: string | null; // 這筆紀錄對應哪位聯絡人
  dealTitle: string | null; // 這筆紀錄對應哪個商機（活動 / 階段異動才有）
  fromStageLabel: string | null; // 僅階段異動：前一階段名稱
  detail: string | null; // 內文（備註 / 活動內容 / 換階段原因）
  link: string | null; // 僅活動紀錄：可選連結
  actor: string | null; // 操作者顯示名稱
};

/**
 * 讀某企業（依 CrmContact.company 字串分組，同名視為同一企業）名下所有
 * 聯絡人的完整歷史：CRM 活動紀錄 + 商機跟進活動 + 商機階段異動，合併成
 * 單一時間軸（依時間升冪），讓使用者一眼看到與這間企業互動的完整路徑。
 * 「企業」目前沒有獨立資料表，純粹以聯絡人的公司名稱字串分組——跟現有
 * UI 各處以此字串顯示/篩選公司的作法一致。
 */
export async function getCompanyTimeline(
  company: string,
): Promise<{ contactCount: number; entries: CompanyTimelineEntry[] }> {
  const { org } = await requireActiveOrg();
  const name = company.trim();
  if (!name) return { contactCount: 0, entries: [] };

  const contacts = await db.crmContact.findMany({
    where: { organizationId: org.id, company: name },
    select: { id: true, name: true, createdAt: true },
  });
  if (contacts.length === 0) return { contactCount: 0, entries: [] };
  const contactIds = contacts.map((c) => c.id);
  const contactNameById = new Map(contacts.map((c) => [c.id, c.name]));

  const [events, deals, dealStages] = await Promise.all([
    db.crmEvent.findMany({
      where: { organizationId: org.id, contactId: { in: contactIds } },
      select: {
        id: true,
        type: true,
        title: true,
        notes: true,
        link: true,
        contactId: true,
        createdById: true,
        createdAt: true,
      },
    }),
    db.crmDeal.findMany({
      where: { organizationId: org.id, contactId: { in: contactIds } },
      select: {
        id: true,
        title: true,
        contactId: true,
        activities: {
          select: {
            id: true,
            type: true,
            body: true,
            createdById: true,
            createdAt: true,
          },
        },
        stageChanges: {
          select: {
            id: true,
            fromStage: true,
            toStage: true,
            reason: true,
            changedById: true,
            changedAt: true,
          },
        },
      },
    }),
    db.dealStage.findMany({
      where: { organizationId: org.id },
      select: { key: true, label: true, color: true },
    }),
  ]);
  const stageByKey = new Map(dealStages.map((s) => [s.key, s]));

  const actorIds = new Set<string>();
  for (const e of events) if (e.createdById) actorIds.add(e.createdById);
  for (const d of deals) {
    for (const a of d.activities) if (a.createdById) actorIds.add(a.createdById);
    for (const s of d.stageChanges) if (s.changedById) actorIds.add(s.changedById);
  }
  const users = actorIds.size
    ? await db.user.findMany({
        where: { id: { in: [...actorIds] } },
        select: {
          id: true,
          name: true,
          nickname: true,
          useNickname: true,
          email: true,
        },
      })
    : [];
  const userById = new Map(users.map((u) => [u.id, u]));
  const actorNameOf = (id: string | null) => {
    const u = id ? userById.get(id) : undefined;
    return u ? primaryName(u) : null;
  };

  const entries: CompanyTimelineEntry[] = [];

  for (const c of contacts) {
    entries.push({
      id: `contact-${c.id}`,
      at: c.createdAt.toISOString(),
      color: "zinc",
      chip: "新聯絡人",
      icon: "👤",
      contactName: c.name,
      dealTitle: null,
      fromStageLabel: null,
      detail: null,
      link: null,
      actor: null,
    });
  }

  for (const e of events) {
    entries.push({
      id: `event-${e.id}`,
      at: e.createdAt.toISOString(),
      color: "sky",
      chip: e.type,
      icon: CRM_EVENT_ICON[e.type] ?? "📌",
      contactName: e.contactId ? (contactNameById.get(e.contactId) ?? null) : null,
      dealTitle: null,
      fromStageLabel: null,
      detail: [e.title, e.notes].filter(Boolean).join(" — ") || null,
      link: e.link,
      actor: actorNameOf(e.createdById),
    });
  }

  for (const d of deals) {
    const cName = d.contactId ? (contactNameById.get(d.contactId) ?? null) : null;
    for (const a of d.activities) {
      entries.push({
        id: `activity-${a.id}`,
        at: a.createdAt.toISOString(),
        color: "violet",
        chip: CRM_ACTIVITY_LABEL[a.type] ?? a.type,
        icon: CRM_ACTIVITY_ICON[a.type] ?? "📝",
        contactName: cName,
        dealTitle: d.title,
        fromStageLabel: null,
        detail: a.body,
        link: null,
        actor: actorNameOf(a.createdById),
      });
    }
    for (const s of d.stageChanges) {
      const to = stageByKey.get(s.toStage);
      const from = s.fromStage ? stageByKey.get(s.fromStage) : null;
      entries.push({
        id: `stage-${s.id}`,
        at: s.changedAt.toISOString(),
        color: to?.color ?? "slate",
        chip: to?.label ?? s.toStage,
        icon: null,
        contactName: cName,
        dealTitle: d.title,
        fromStageLabel: from?.label ?? null,
        detail: s.reason,
        link: null,
        actor: actorNameOf(s.changedById),
      });
    }
  }

  entries.sort((a, b) => a.at.localeCompare(b.at));
  return { contactCount: contacts.length, entries };
}

// ── 企業進度備註動態（依公司字串，跟企業時間軸同一個分組邏輯）───
// 多筆、可回覆（一層）：每個人各自留言記錄進度，不是共用一段可覆寫的文字。

/** 讀某企業的進度備註動態（依時間升冪；含作者名稱），供列表就地展開使用。 */
export async function listCompanyNotes(company: string) {
  const { org } = await requireActiveOrg();
  const name = company.trim();
  if (!name) return [];
  const notes = await db.crmCompanyNote.findMany({
    where: { organizationId: org.id, company: name },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      body: true,
      parentId: true,
      createdAt: true,
      updatedAt: true,
      authorId: true,
    },
  });
  const ids = [
    ...new Set(notes.map((n) => n.authorId).filter((v): v is string => !!v)),
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
          image: true,
        },
      })
    : [];
  const byId = new Map(users.map((u) => [u.id, u]));
  return notes.map((n) => ({
    ...n,
    author: n.authorId ? (byId.get(n.authorId) ?? null) : null,
  }));
}

const CompanyNoteInput = z.object({
  company: z.string().trim().min(1),
  body: z.string().trim().min(1, "請輸入內容").max(4000),
  parentId: z.string().nullable().optional(),
});

/** 新增一則企業進度備註，或回覆某一則（parentId）。 */
export async function addCompanyNote(input: z.input<typeof CompanyNoteInput>) {
  const { user, org } = await requireActiveOrg();
  const d = CompanyNoteInput.parse(input);
  if (d.parentId) {
    const parent = await db.crmCompanyNote.findFirst({
      where: { id: d.parentId, organizationId: org.id, company: d.company },
      select: { id: true },
    });
    if (!parent) return { ok: false as const, error: "找不到要回覆的備註" };
  }
  await db.crmCompanyNote.create({
    data: {
      organizationId: org.id,
      company: d.company,
      body: d.body,
      parentId: d.parentId || null,
      authorId: user.id,
    },
  });
  revalidate();
  return { ok: true as const };
}

/** 刪除一則進度備註（連同其底下的回覆一起刪，見 schema 的 onDelete: Cascade）。 */
export async function deleteCompanyNote(id: string) {
  const { org } = await requireActiveOrg();
  await db.crmCompanyNote.deleteMany({ where: { id, organizationId: org.id } });
  revalidate();
}

/** 編輯一則已存在的進度備註 / 回覆的內容。 */
export async function updateCompanyNote(id: string, body: string) {
  const { org } = await requireActiveOrg();
  const b = z.string().trim().min(1, "請輸入內容").max(4000).parse(body);
  const res = await db.crmCompanyNote.updateMany({
    where: { id, organizationId: org.id },
    data: { body: b },
  });
  if (res.count === 0) return { ok: false as const, error: "找不到備註" };
  revalidate();
  return { ok: true as const };
}

// ── 企業基本檔案（依公司字串，同一企業一筆；業務開發用：這家公司是誰、切入點是什麼）───

const CompanyProfileInput = z.object({
  company: z.string().trim().min(1),
  industry: z.string().trim().max(120).optional(),
  location: z.string().trim().max(200).optional(),
  headcount: z.string().trim().max(200).optional(),
  capital: z.string().trim().max(200).optional(),
  founded: z.string().trim().max(200).optional(),
  website: z.string().trim().max(300).optional(),
  representativeName: z.string().trim().max(120).optional(),
  products: z.string().trim().max(4000).optional(),
  productCategory: z.string().trim().max(60).optional(),
  companyIntro: z.string().trim().max(4000).optional(),
  entryHook: z.string().trim().max(4000).optional(),
  hasPhysicalStore: z.boolean().nullable().optional(),
  hasEcommerce: z.boolean().nullable().optional(),
  ecommercePlatform: z.string().trim().max(120).optional(),
  grade: z.string().trim().max(40).optional(),
  note: z.string().trim().max(4000).optional(),
});

/** 「代表人」下拉建議：同組織裡所有企業檔案已經填過的代表人姓名（去重排序），
 *  同一人身兼多家關係企業代表時可以直接選、不用重打一次，也少一點打字誤差。 */
export async function getRepresentativeNameSuggestions(): Promise<string[]> {
  const { org } = await requireActiveOrg();
  const rows = await db.crmCompanyProfile.findMany({
    where: { organizationId: org.id, NOT: { representativeName: null } },
    select: { representativeName: true },
    distinct: ["representativeName"],
  });
  return rows
    .map((r) => r.representativeName?.trim())
    .filter((v): v is string => !!v)
    .sort((a, b) => a.localeCompare(b, "ja"));
}

/** 讀某企業的基本檔案；沒建立過就回 null（前端據此顯示「新增資料」或現有內容）。 */
export async function getCompanyProfile(company: string) {
  const { org } = await requireActiveOrg();
  const name = company.trim();
  if (!name) return null;
  return db.crmCompanyProfile.findUnique({
    where: { organizationId_company: { organizationId: org.id, company: name } },
  });
}

/** 新增或更新某企業的基本檔案（同一企業一筆，upsert）。 */
export async function upsertCompanyProfile(
  input: z.input<typeof CompanyProfileInput>,
) {
  const { user, org } = await requireActiveOrg();
  const d = CompanyProfileInput.parse(input);
  const data = {
    industry: d.industry || null,
    location: d.location || null,
    headcount: d.headcount || null,
    capital: d.capital || null,
    founded: d.founded || null,
    website: d.website || null,
    representativeName: d.representativeName || null,
    products: d.products || null,
    productCategory: d.productCategory || null,
    companyIntro: d.companyIntro || null,
    entryHook: d.entryHook || null,
    hasPhysicalStore: d.hasPhysicalStore ?? null,
    hasEcommerce: d.hasEcommerce ?? null,
    ecommercePlatform: d.ecommercePlatform || null,
    grade: d.grade || null,
    note: d.note || null,
  };
  await db.crmCompanyProfile.upsert({
    where: {
      organizationId_company: { organizationId: org.id, company: d.company },
    },
    create: {
      organizationId: org.id,
      company: d.company,
      createdById: user.id,
      ...data,
    },
    update: data,
  });
  revalidate();
  return { ok: true as const };
}

// ── 企業聯絡人名冊（同公司字串底下有幾個聯絡人、彼此的匯報關係）───

export type CompanyContactRow = {
  id: string;
  name: string;
  title: string | null;
  decisionRole: string | null;
  reportsToId: string | null;
  ownerName: string | null;
};

/** 某企業底下所有聯絡人，含決策角色 / 匯報對象，供企業總覽的名冊區塊使用。 */
export async function getCompanyContacts(
  company: string,
): Promise<CompanyContactRow[]> {
  const { org } = await requireActiveOrg();
  const name = company.trim();
  if (!name) return [];
  const contacts = await db.crmContact.findMany({
    where: { organizationId: org.id, company: name },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      title: true,
      decisionRole: true,
      reportsToId: true,
      owner: {
        select: { name: true, nickname: true, useNickname: true, email: true },
      },
    },
  });
  return contacts.map((c) => ({
    id: c.id,
    name: c.name,
    title: c.title,
    decisionRole: c.decisionRole,
    reportsToId: c.reportsToId,
    ownerName: c.owner ? primaryName(c.owner) : null,
  }));
}

const ContactRoleInput = z.object({
  decisionRole: z.string().trim().max(20).nullable().optional(),
  reportsToId: z.string().nullable().optional(),
});

/** 更新聯絡人的決策角色 / 匯報對象（企業總覽名冊的行內編輯用）。 */
export async function updateContactRole(
  id: string,
  input: z.input<typeof ContactRoleInput>,
) {
  const { org } = await requireActiveOrg();
  const d = ContactRoleInput.parse(input);
  if (d.reportsToId) {
    if (d.reportsToId === id) {
      return { ok: false as const, error: "不能設定自己為匯報對象" };
    }
    const target = await db.crmContact.findFirst({
      where: { id: d.reportsToId, organizationId: org.id },
      select: { id: true },
    });
    if (!target) return { ok: false as const, error: "找不到匯報對象" };
  }
  const res = await db.crmContact.updateMany({
    where: { id, organizationId: org.id },
    data: {
      ...(d.decisionRole !== undefined
        ? { decisionRole: d.decisionRole || null }
        : {}),
      ...(d.reportsToId !== undefined
        ? { reportsToId: d.reportsToId || null }
        : {}),
    },
  });
  if (res.count === 0) return { ok: false as const, error: "找不到聯絡人" };
  revalidate();
  return { ok: true as const };
}
