-- ─────────────────────────────────────────────────────────────
-- 任務說明：Task 加入 description（這個任務要做什麼，對應 Project.description）。
-- 純新增、可空、Text。不影響既有資料。
-- ─────────────────────────────────────────────────────────────

ALTER TABLE "Task" ADD COLUMN "description" TEXT;
