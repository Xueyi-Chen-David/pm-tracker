"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { requireUser } from "@/server/auth-helpers";
import { assertCanEditProject } from "@/server/access";
import { logActivity } from "@/server/activity";

const NoteInput = z.object({
  projectId: z.string().min(1),
  message: z.string().trim().min(1, "請輸入備註內容").max(2000),
});

/** 使用者手動新增一筆備註（kind=NOTE）。 */
export async function addActivityNote(input: z.input<typeof NoteInput>) {
  const user = await requireUser();
  const d = NoteInput.parse(input);
  await assertCanEditProject(user.id, d.projectId, user.isBoss);
  await logActivity({
    projectId: d.projectId,
    kind: "NOTE",
    message: d.message,
    userId: user.id,
  });
  revalidatePath(`/projects/${d.projectId}`);
}

const EditNoteInput = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  message: z.string().trim().min(1, "請輸入備註內容").max(2000),
});

/** 編輯備註內容（僅限手動備註 kind=NOTE，系統自動紀錄不可改）。 */
export async function updateActivityNote(input: z.input<typeof EditNoteInput>) {
  const user = await requireUser();
  const d = EditNoteInput.parse(input);
  await assertCanEditProject(user.id, d.projectId, user.isBoss);
  const existing = await db.activity.findUnique({
    where: { id: d.id },
    select: { kind: true, projectId: true },
  });
  if (!existing || existing.projectId !== d.projectId) {
    throw new Error("找不到這筆紀錄");
  }
  if (existing.kind !== "NOTE") {
    throw new Error("只有備註可以編輯");
  }
  await db.activity.update({
    where: { id: d.id },
    data: { message: d.message },
  });
  revalidatePath(`/projects/${d.projectId}`);
}

/** 刪除任一筆操作紀錄。 */
export async function deleteActivity(input: { id: string; projectId: string }) {
  const user = await requireUser();
  await assertCanEditProject(user.id, input.projectId, user.isBoss);
  await db.activity.delete({ where: { id: input.id } });
  revalidatePath(`/projects/${input.projectId}`);
}
