-- ─────────────────────────────────────────────────────────────
-- 專案「目前狀態」的切換時間戳。
-- 用途：卡片一眼看出「何時完成 / 何時暫停 / 何時取消」，並可算「已在此狀態 N 天」。
-- 既有專案回填：已完成者用實際完成日（actualEndDate），否則退回最後更新時間（updatedAt），
-- 之後由 server action 在每次狀態實際變動時維護。純新增可空欄位，不影響既有資料。
-- ─────────────────────────────────────────────────────────────
ALTER TABLE "Project" ADD COLUMN "statusChangedAt" TIMESTAMP(3);
UPDATE "Project" SET "statusChangedAt" = COALESCE("actualEndDate", "updatedAt");
