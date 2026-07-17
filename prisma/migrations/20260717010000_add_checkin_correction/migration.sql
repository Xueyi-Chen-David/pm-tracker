-- ─────────────────────────────────────────────────────────────
-- 補打卡申請（CheckInCorrection）：成員忘記上/下班打卡時提出，
-- 經具 attendance.manage 者核准後補一筆有效打卡（計入工時）。
-- 純新增資料表，不影響既有資料。
-- ─────────────────────────────────────────────────────────────

CREATE TABLE "CheckInCorrection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "kind" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CheckInCorrection_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CheckInCorrection_organizationId_status_idx" ON "CheckInCorrection"("organizationId", "status");
CREATE INDEX "CheckInCorrection_userId_date_idx" ON "CheckInCorrection"("userId", "date");
ALTER TABLE "CheckInCorrection" ADD CONSTRAINT "CheckInCorrection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CheckInCorrection" ADD CONSTRAINT "CheckInCorrection_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
