-- ─────────────────────────────────────────────────────────────
-- 請假 / 事件證明附件（data URL；圖片 / PDF）。純新增欄位，不影響既有資料。
-- ─────────────────────────────────────────────────────────────

ALTER TABLE "MemberEvent" ADD COLUMN "attachment" TEXT;
ALTER TABLE "MemberEvent" ADD COLUMN "attachmentName" TEXT;

ALTER TABLE "LeaveRequest" ADD COLUMN "attachment" TEXT;
ALTER TABLE "LeaveRequest" ADD COLUMN "attachmentName" TEXT;
