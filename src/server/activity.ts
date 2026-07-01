import type { ActivityKind } from "@prisma/client";
import { db } from "@/server/db";

/**
 * 寫入一筆操作紀錄。記錄本身的失敗不應讓主要動作失敗，故吞掉錯誤。
 */
export async function logActivity(input: {
  projectId: string;
  kind: ActivityKind;
  message: string;
  userId?: string | null;
}) {
  try {
    await db.activity.create({
      data: {
        projectId: input.projectId,
        kind: input.kind,
        message: input.message,
        userId: input.userId ?? null,
      },
    });
  } catch (e) {
    console.error("logActivity failed:", e);
  }
}
