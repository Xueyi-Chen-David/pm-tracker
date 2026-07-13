"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { requireActiveOrgWithRole } from "@/server/org";

// 員工教育訓練文件庫（Training Docs）的伺服器動作：資料夾 / 文件 CRUD。
// 編輯權限：組織擁有者 / 管理員（OWNER / ADMIN）。讀取由頁面 requireModuleAccess 控管。

/** 巢狀資料夾的最大層數（含根層）——避免無意義的過深巢狀。 */
const MAX_FOLDER_DEPTH = 8;

/** 只有 OWNER / ADMIN 能編輯文件庫。回傳目前組織。 */
async function requireDocEditor() {
  const { org, user } = await requireActiveOrgWithRole(["OWNER", "ADMIN"]);
  return { org, user };
}

/** 確認資料夾屬於本組織，並回傳其在樹中的深度（根層＝1）。找不到則丟錯。 */
async function folderDepth(orgId: string, folderId: string): Promise<number> {
  let depth = 0;
  let current: string | null = folderId;
  // 逐層往上走到根，順便驗證每一層都屬於本組織。
  while (current) {
    const f: { parentId: string | null } | null =
      await db.trainingDocFolder.findFirst({
        where: { id: current, organizationId: orgId },
        select: { parentId: true },
      });
    if (!f) throw new Error("找不到資料夾。");
    depth += 1;
    if (depth > MAX_FOLDER_DEPTH + 1) break; // 防呆：資料異常時避免無限迴圈
    current = f.parentId;
  }
  return depth;
}

// ── 資料夾（Folder）─────────────────────────────────────────────

const FolderCreate = z.object({
  name: z.string().trim().min(1, "請輸入資料夾名稱").max(120),
  parentId: z.string().min(1).nullish(),
});

export async function createDocFolder(input: z.input<typeof FolderCreate>) {
  const { org, user } = await requireDocEditor();
  const d = FolderCreate.parse(input);

  const parentId = d.parentId ?? null;
  if (parentId) {
    const depth = await folderDepth(org.id, parentId);
    if (depth >= MAX_FOLDER_DEPTH) {
      throw new Error(`資料夾層數已達上限（${MAX_FOLDER_DEPTH} 層）。`);
    }
  }

  const max = await db.trainingDocFolder.aggregate({
    where: { organizationId: org.id, parentId },
    _max: { sortOrder: true },
  });
  const folder = await db.trainingDocFolder.create({
    data: {
      organizationId: org.id,
      name: d.name,
      parentId,
      sortOrder: (max._max.sortOrder ?? 0) + 1,
      createdById: user.id,
    },
    select: { id: true },
  });
  revalidatePath("/training");
  return { ok: true as const, id: folder.id };
}

const FolderRename = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1, "請輸入資料夾名稱").max(120),
});

export async function renameDocFolder(input: z.input<typeof FolderRename>) {
  const { org } = await requireDocEditor();
  const d = FolderRename.parse(input);
  await db.trainingDocFolder.updateMany({
    where: { id: d.id, organizationId: org.id },
    data: { name: d.name },
  });
  revalidatePath("/training");
  return { ok: true as const };
}

export async function deleteDocFolder(id: string) {
  const { org } = await requireDocEditor();
  // 子資料夾與其中文件由 DB 的 ON DELETE CASCADE 一併移除。
  await db.trainingDocFolder.deleteMany({
    where: { id, organizationId: org.id },
  });
  revalidatePath("/training");
  return { ok: true as const };
}

// ── 文件（Page）─────────────────────────────────────────────────

const PageCreate = z.object({
  title: z.string().trim().min(1, "請輸入文件名稱").max(200),
  folderId: z.string().min(1).nullish(),
  content: z.string().max(200_000).optional(),
});

export async function createDocPage(input: z.input<typeof PageCreate>) {
  const { org, user } = await requireDocEditor();
  const d = PageCreate.parse(input);

  const folderId = d.folderId ?? null;
  if (folderId) {
    // 驗證資料夾屬於本組織。
    await folderDepth(org.id, folderId);
  }

  const max = await db.trainingDocPage.aggregate({
    where: { organizationId: org.id, folderId },
    _max: { sortOrder: true },
  });
  const page = await db.trainingDocPage.create({
    data: {
      organizationId: org.id,
      title: d.title,
      content: d.content ?? "",
      folderId,
      sortOrder: (max._max.sortOrder ?? 0) + 1,
      createdById: user.id,
      updatedById: user.id,
    },
    select: { id: true },
  });
  revalidatePath("/training");
  return { ok: true as const, id: page.id };
}

const PageUpdate = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1, "請輸入文件名稱").max(200).optional(),
  content: z.string().max(200_000).optional(),
});

export async function updateDocPage(input: z.input<typeof PageUpdate>) {
  const { org, user } = await requireDocEditor();
  const d = PageUpdate.parse(input);
  await db.trainingDocPage.updateMany({
    where: { id: d.id, organizationId: org.id },
    data: {
      ...(d.title !== undefined ? { title: d.title } : {}),
      ...(d.content !== undefined ? { content: d.content } : {}),
      updatedById: user.id,
    },
  });
  revalidatePath("/training");
  return { ok: true as const };
}

export async function deleteDocPage(id: string) {
  const { org } = await requireDocEditor();
  await db.trainingDocPage.deleteMany({
    where: { id, organizationId: org.id },
  });
  revalidatePath("/training");
  return { ok: true as const };
}

// 拖放：把資料夾移到新的上層並排序（parentId=null＝根層）。含循環 / 深度防呆。
const FolderMove = z.object({
  id: z.string().min(1),
  parentId: z.string().min(1).nullable(),
  beforeId: z.string().min(1).nullable().optional(),
});

export async function moveDocFolder(input: z.input<typeof FolderMove>) {
  const { org } = await requireDocEditor();
  const d = FolderMove.parse(input);
  const parentId = d.parentId ?? null;
  if (parentId === d.id) throw new Error("不能把資料夾移到自己底下。");

  const all = await db.trainingDocFolder.findMany({
    where: { organizationId: org.id },
    select: { id: true, parentId: true },
  });
  if (!all.some((f) => f.id === d.id)) throw new Error("找不到資料夾。");
  const parentOf = new Map(all.map((f) => [f.id, f.parentId] as const));

  // 目標上層不可是自己或自己的子孫（避免循環）。
  if (parentId) {
    if (!parentOf.has(parentId)) throw new Error("找不到目標資料夾。");
    let cur: string | null = parentId;
    const seen = new Set<string>();
    while (cur && !seen.has(cur)) {
      if (cur === d.id) throw new Error("不能把資料夾移到它自己的子資料夾底下。");
      seen.add(cur);
      cur = parentOf.get(cur) ?? null;
    }
  }

  // 深度檢查：移動後最深的子孫不可超過上限。
  const childrenOf = new Map<string | null, string[]>();
  for (const f of all) {
    const arr = childrenOf.get(f.parentId) ?? [];
    arr.push(f.id);
    childrenOf.set(f.parentId, arr);
  }
  const subtreeHeight = (rootId: string): number => {
    let height = 1;
    let level = [rootId];
    while (level.length) {
      const next: string[] = [];
      for (const fid of level) next.push(...(childrenOf.get(fid) ?? []));
      if (next.length) height += 1;
      level = next;
    }
    return height;
  };
  const newBaseDepth = parentId ? (await folderDepth(org.id, parentId)) + 1 : 1;
  if (newBaseDepth + subtreeHeight(d.id) - 1 > MAX_FOLDER_DEPTH) {
    throw new Error(`移動後資料夾層數會超過上限（${MAX_FOLDER_DEPTH} 層）。`);
  }

  // 重寫同層資料夾的 sortOrder（含把被移動的設到新的上層）。
  const siblings = await db.trainingDocFolder.findMany({
    where: { organizationId: org.id, parentId, id: { not: d.id } },
    orderBy: { sortOrder: "asc" },
    select: { id: true },
  });
  const ids = siblings.map((s) => s.id);
  const at = d.beforeId ? ids.indexOf(d.beforeId) : -1;
  ids.splice(at >= 0 ? at : ids.length, 0, d.id);

  await db.$transaction([
    db.trainingDocFolder.updateMany({
      where: { id: d.id, organizationId: org.id },
      data: { parentId },
    }),
    ...ids.map((fid, i) =>
      db.trainingDocFolder.updateMany({
        where: { id: fid, organizationId: org.id },
        data: { sortOrder: i },
      }),
    ),
  ]);
  revalidatePath("/training");
  return { ok: true as const };
}

// 拖放：把文件移到某資料夾並排序。
// folderId=null＝根層；beforeId 有值＝插到「該文件之前」，否則放到末端。
const PageMove = z.object({
  id: z.string().min(1),
  folderId: z.string().min(1).nullable(),
  beforeId: z.string().min(1).nullable().optional(),
});

export async function moveDocPage(input: z.input<typeof PageMove>) {
  const { org, user } = await requireDocEditor();
  const d = PageMove.parse(input);
  const folderId = d.folderId ?? null;
  // 驗證目標資料夾屬於本組織（順便確保存在）。
  if (folderId) await folderDepth(org.id, folderId);

  // 目標資料夾內現有文件（依序，排除被移動的那份）。
  const siblings = await db.trainingDocPage.findMany({
    where: { organizationId: org.id, folderId, id: { not: d.id } },
    orderBy: { sortOrder: "asc" },
    select: { id: true },
  });
  const ids = siblings.map((s) => s.id);
  const at = d.beforeId ? ids.indexOf(d.beforeId) : -1;
  ids.splice(at >= 0 ? at : ids.length, 0, d.id);

  // 一個交易內：把被移動的文件設到目標資料夾 + 依新順序重寫 sortOrder。
  await db.$transaction([
    db.trainingDocPage.updateMany({
      where: { id: d.id, organizationId: org.id },
      data: { folderId, updatedById: user.id },
    }),
    ...ids.map((pid, i) =>
      db.trainingDocPage.updateMany({
        where: { id: pid, organizationId: org.id },
        data: { sortOrder: i },
      }),
    ),
  ]);
  revalidatePath("/training");
  return { ok: true as const };
}

// ── 文件可見性權限（管理者限定）─────────────────────────────────

const VisibilityInput = z.object({
  id: z.string().min(1),
  // ALL＝所有人可見；RESTRICTED＝僅白名單（管理者一律可見）。
  visibility: z.enum(["ALL", "RESTRICTED"]),
  allowedUserIds: z.array(z.string()).default([]),
});

/** 設定某文件由誰可見。管理者一律可見，不受此限制。 */
export async function setDocPageVisibility(
  input: z.input<typeof VisibilityInput>,
) {
  const { org } = await requireDocEditor();
  const d = VisibilityInput.parse(input);
  const res = await db.trainingDocPage.updateMany({
    where: { id: d.id, organizationId: org.id },
    data: {
      visibility: d.visibility,
      allowedUserIds: d.visibility === "RESTRICTED" ? d.allowedUserIds : [],
    },
  });
  if (res.count === 0) throw new Error("找不到文件");
  revalidatePath("/training");
  return { ok: true as const };
}
