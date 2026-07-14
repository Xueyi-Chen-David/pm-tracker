-- ─────────────────────────────────────────────────────────────
-- 公司文件：每份文件除了「誰可以看」(allowedUserIds)，再加「誰可以編輯」白名單。
-- 管理者(OWNER/ADMIN)一律可編輯；editorUserIds 為額外可編輯的成員。純新增。
-- ─────────────────────────────────────────────────────────────

ALTER TABLE "TrainingDocPage"
  ADD COLUMN "editorUserIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
