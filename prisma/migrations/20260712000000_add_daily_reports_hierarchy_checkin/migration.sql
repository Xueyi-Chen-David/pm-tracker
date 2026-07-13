-- ─────────────────────────────────────────────────────────────
-- Daily reports + team hierarchy + in-app notifications + check-in.
-- Data-preserving. Hand-written (Prisma 7 `migrate dev` is non-interactive
-- and chokes on column drops); apply with `prisma migrate deploy`.
--   • OrganizationMember: add managerId (上級主管, self-relation),
--     drop persona / personality / productivityNote.
--   • Organization: daily-report chain visibility + check-in config.
--   • New tables: DailyReport, DailyReportComment, Notification, CheckIn.
-- ─────────────────────────────────────────────────────────────

-- ─── Organization: daily-report + check-in settings ──────────
ALTER TABLE "Organization"
    ADD COLUMN "dailyReportChainVisible" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "checkInEnabled" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "checkInAllowedIps" TEXT[] DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN "checkInGeofences" JSONB;

-- ─── OrganizationMember: supervisor + drop removed profile cols ─
ALTER TABLE "OrganizationMember" ADD COLUMN "managerId" TEXT;

CREATE INDEX "OrganizationMember_managerId_idx" ON "OrganizationMember"("managerId");

ALTER TABLE "OrganizationMember"
    ADD CONSTRAINT "OrganizationMember_managerId_fkey"
    FOREIGN KEY ("managerId") REFERENCES "OrganizationMember"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OrganizationMember"
    DROP COLUMN "persona",
    DROP COLUMN "personality",
    DROP COLUMN "productivityNote";

-- ─── DailyReport ─────────────────────────────────────────────
CREATE TABLE "DailyReport" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyReport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DailyReport_organizationId_userId_date_key" ON "DailyReport"("organizationId", "userId", "date");
CREATE INDEX "DailyReport_organizationId_date_idx" ON "DailyReport"("organizationId", "date");
CREATE INDEX "DailyReport_userId_date_idx" ON "DailyReport"("userId", "date");

ALTER TABLE "DailyReport" ADD CONSTRAINT "DailyReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DailyReport" ADD CONSTRAINT "DailyReport_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── DailyReportComment ──────────────────────────────────────
CREATE TABLE "DailyReportComment" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyReportComment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DailyReportComment_reportId_idx" ON "DailyReportComment"("reportId");

ALTER TABLE "DailyReportComment" ADD CONSTRAINT "DailyReportComment_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "DailyReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DailyReportComment" ADD CONSTRAINT "DailyReportComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Notification ────────────────────────────────────────────
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Notification_userId_read_idx" ON "Notification"("userId", "read");
CREATE INDEX "Notification_organizationId_idx" ON "Notification"("organizationId");

ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── CheckIn ─────────────────────────────────────────────────
CREATE TABLE "CheckIn" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" TEXT NOT NULL,
    "method" TEXT,
    "valid" BOOLEAN NOT NULL DEFAULT false,
    "ip" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "CheckIn_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CheckIn_organizationId_date_idx" ON "CheckIn"("organizationId", "date");
CREATE INDEX "CheckIn_userId_date_idx" ON "CheckIn"("userId", "date");

ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
