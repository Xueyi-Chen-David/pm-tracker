-- ─────────────────────────────────────────────────────────────
-- 任務主負責人：Task 加入 primaryOwnerId（owners 之中被指定為「主要負責」的一位）。
-- 純新增、可空，移除該使用者時 SET NULL。不影響既有資料。
-- ─────────────────────────────────────────────────────────────

ALTER TABLE "Task" ADD COLUMN "primaryOwnerId" TEXT;

ALTER TABLE "Task" ADD CONSTRAINT "Task_primaryOwnerId_fkey" FOREIGN KEY ("primaryOwnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
