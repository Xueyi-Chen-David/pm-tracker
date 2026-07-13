-- ─────────────────────────────────────────────────────────────
-- Daily report work items (陳宗賢式 計畫 vs 實績量化).
-- Each DailyReport gets 0..N items; each item has a target (分母) and
-- an actual (分子). 達成率 = actual / target; the report's `score` is
-- the average of the items' achievement rates (computed in the action).
-- Data-preserving: existing DailyReport rows keep their manual score.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE "DailyReportItem" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "unit" TEXT,
    "target" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "actual" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyReportItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DailyReportItem_reportId_idx" ON "DailyReportItem"("reportId");

ALTER TABLE "DailyReportItem"
    ADD CONSTRAINT "DailyReportItem_reportId_fkey"
    FOREIGN KEY ("reportId") REFERENCES "DailyReport"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
