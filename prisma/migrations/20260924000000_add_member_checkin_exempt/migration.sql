-- ─────────────────────────────────────────────────────────────
-- 出勤：成員加入「免打卡」旗標（checkInExempt）。
-- 開啟後不提醒打卡、出勤月曆不自動標「未打卡」缺席；本人仍可打卡。
-- 純新增、預設 false，不影響既有資料。
-- ─────────────────────────────────────────────────────────────

ALTER TABLE "OrganizationMember" ADD COLUMN "checkInExempt" BOOLEAN NOT NULL DEFAULT false;
