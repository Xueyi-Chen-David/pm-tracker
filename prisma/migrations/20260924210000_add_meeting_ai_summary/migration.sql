-- 會議記錄：AI 總結（Markdown）與產生時間。純新增可空欄位。
ALTER TABLE "Meeting" ADD COLUMN "aiSummary" TEXT;
ALTER TABLE "Meeting" ADD COLUMN "aiSummaryAt" TIMESTAMP(3);
