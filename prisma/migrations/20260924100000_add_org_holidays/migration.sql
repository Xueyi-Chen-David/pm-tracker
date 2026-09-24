-- ─────────────────────────────────────────────────────────────
-- 出勤：組織年度假日清單（OrgHoliday）。讓「匯入年度假日」記住已設定的日期 / 區間，
-- 並讓出席月曆對沒有個人紀錄的成員也顯示放假。純新增資料表，不影響既有資料。
-- ─────────────────────────────────────────────────────────────

CREATE TABLE "OrgHoliday" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrgHoliday_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OrgHoliday_organizationId_date_idx" ON "OrgHoliday"("organizationId", "date");

ALTER TABLE "OrgHoliday" ADD CONSTRAINT "OrgHoliday_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
