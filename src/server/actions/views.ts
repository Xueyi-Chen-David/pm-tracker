"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { requireActiveOrg } from "@/server/org";

export type ViewActionState = { error?: string; ok?: boolean; id?: string } | null;

const StatusEnum = z.enum([
  "NOT_STARTED",
  "ACTIVE",
  "ON_HOLD",
  "COMPLETED",
  "CANCELLED",
]);
const TypeEnum = z.enum(["ROUTINE", "PROJECT", "ONE_TIME"]);

const CreateInput = z.object({
  name: z.string().trim().min(1, "請輸入名稱").max(40),
  statuses: z.array(StatusEnum).default([]),
  types: z.array(TypeEnum).default([]),
  exclude: z.boolean().default(false),
});

export async function createProjectViewAction(
  _prev: ViewActionState,
  formData: FormData,
): Promise<ViewActionState> {
  const { org } = await requireActiveOrg();
  const parsed = CreateInput.safeParse({
    name: formData.get("name"),
    statuses: formData.getAll("statuses").map(String),
    types: formData.getAll("types").map(String),
    exclude: formData.get("exclude") === "on",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "資料格式錯誤" };
  }
  const { name, statuses, types, exclude } = parsed.data;
  const max = await db.projectView.aggregate({
    where: { organizationId: org.id },
    _max: { sortOrder: true },
  });
  const view = await db.projectView.create({
    data: {
      organizationId: org.id,
      name,
      statuses,
      types,
      exclude,
      sortOrder: (max._max.sortOrder ?? 0) + 1,
    },
  });
  revalidatePath("/projects");
  return { ok: true, id: view.id };
}

export async function deleteProjectView(id: string) {
  const { org } = await requireActiveOrg();
  const view = await db.projectView.findFirst({
    where: { id, organizationId: org.id },
  });
  if (!view) return { ok: true as const };
  // 「全體」是系統視窗，不能被刪除——這是真正的商業規則，以回傳值帶回而非 throw，
  // 因為 Server Action 丟出的 Error 在正式環境會被 Next.js 隱去訊息內容。
  if (view.isSystem) {
    return { ok: false as const, error: "「全體」視窗無法刪除。" };
  }
  await db.projectView.delete({ where: { id } });
  revalidatePath("/projects");
  return { ok: true as const };
}
