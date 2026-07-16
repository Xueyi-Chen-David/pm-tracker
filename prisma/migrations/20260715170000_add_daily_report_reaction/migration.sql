-- ─────────────────────────────────────────────────────────────
-- 每日報告表情回應（Slack 式 emoji reaction）。可見該日報的人（作者本人 +
-- 其主管）可對日報按 emoji，作者會收到通知。同一人同一 emoji 只有一筆（可切換）。純新增。
-- ─────────────────────────────────────────────────────────────

-- CreateTable
CREATE TABLE "DailyReportReaction" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyReportReaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DailyReportReaction_reportId_idx" ON "DailyReportReaction"("reportId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyReportReaction_reportId_userId_emoji_key" ON "DailyReportReaction"("reportId", "userId", "emoji");

-- AddForeignKey
ALTER TABLE "DailyReportReaction" ADD CONSTRAINT "DailyReportReaction_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "DailyReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyReportReaction" ADD CONSTRAINT "DailyReportReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
