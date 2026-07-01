-- ─────────────────────────────────────────────────────────────
-- Introduce Organizations (multi-tenant). Data-preserving:
-- create org tables, backfill a default org + memberships from the
-- existing single-workspace data, then move org-context columns off User.
-- Hand-written (Prisma 7 `migrate dev` is non-interactive and chokes on
-- column drops); apply with `prisma migrate deploy`.
-- ─────────────────────────────────────────────────────────────

-- CreateEnum
CREATE TYPE "OrgRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationMember" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "OrgRole" NOT NULL DEFAULT 'MEMBER',
    "jobTitle" TEXT,
    "isBoss" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "allowedModules" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "trackAttendance" BOOLEAN NOT NULL DEFAULT false,
    "persona" TEXT,
    "personality" TEXT,
    "bio" TEXT,
    "attendance" TEXT,
    "productivityNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrganizationMember_organizationId_idx" ON "OrganizationMember"("organizationId");

-- CreateIndex
CREATE INDEX "OrganizationMember_userId_idx" ON "OrganizationMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationMember_organizationId_userId_key" ON "OrganizationMember"("organizationId", "userId");

-- AddForeignKey
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: add organizationId (nullable first, backfilled below)
ALTER TABLE "Project" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "ProjectView" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "WeeklyReport" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "ReportImage" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "Meeting" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "AttendanceRecord" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "MemberEvent" ADD COLUMN "organizationId" TEXT;

-- ─── Data backfill ────────────────────────────────────────────

-- 1) default organization to hold all existing (single-workspace) data
INSERT INTO "Organization" ("id", "name", "createdAt", "updatedAt")
VALUES ('org_default', '我的組織', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- 2) point every existing row at the default org
UPDATE "Project"          SET "organizationId" = 'org_default';
UPDATE "ProjectView"      SET "organizationId" = 'org_default';
UPDATE "WeeklyReport"     SET "organizationId" = 'org_default';
UPDATE "ReportImage"      SET "organizationId" = 'org_default';
UPDATE "Meeting"          SET "organizationId" = 'org_default';
UPDATE "AttendanceRecord" SET "organizationId" = 'org_default';
UPDATE "MemberEvent"      SET "organizationId" = 'org_default';

-- 3) every existing user becomes a member (copy the org-context columns)
INSERT INTO "OrganizationMember" (
    "id", "organizationId", "email", "userId", "role",
    "jobTitle", "isBoss", "active", "allowedModules", "trackAttendance",
    "persona", "personality", "bio", "attendance", "productivityNote",
    "createdAt", "updatedAt"
)
SELECT
    'omdef_' || u."id",
    'org_default',
    LOWER(COALESCE(u."email", 'user-' || u."id" || '@local')),
    u."id",
    'MEMBER',
    u."jobTitle", u."isBoss", u."active",
    COALESCE(u."allowedModules", ARRAY[]::TEXT[]), u."trackAttendance",
    u."persona", u."personality", u."bio", u."attendance", u."productivityNote",
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "User" u;

-- 4) promote exactly one OWNER: prefer dev@korvva.com, else the boss, else earliest user
UPDATE "OrganizationMember" SET "role" = 'OWNER'
WHERE "organizationId" = 'org_default'
  AND "userId" = (
    SELECT u."id" FROM "User" u
    ORDER BY (COALESCE(u."email", '') = 'dev@korvva.com') DESC, u."isBoss" DESC, u."createdAt" ASC
    LIMIT 1
  );

-- ─── Enforce NOT NULL, add indexes + FKs ──────────────────────
ALTER TABLE "Project"          ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "ProjectView"      ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "WeeklyReport"     ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "ReportImage"      ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Meeting"          ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "AttendanceRecord" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "MemberEvent"      ALTER COLUMN "organizationId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Project_organizationId_idx" ON "Project"("organizationId");
CREATE INDEX "ProjectView_organizationId_idx" ON "ProjectView"("organizationId");
CREATE INDEX "ReportImage_organizationId_idx" ON "ReportImage"("organizationId");
CREATE INDEX "Meeting_organizationId_idx" ON "Meeting"("organizationId");
CREATE INDEX "AttendanceRecord_organizationId_idx" ON "AttendanceRecord"("organizationId");
CREATE INDEX "MemberEvent_organizationId_idx" ON "MemberEvent"("organizationId");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectView" ADD CONSTRAINT "ProjectView_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WeeklyReport" ADD CONSTRAINT "WeeklyReport_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReportImage" ADD CONSTRAINT "ReportImage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MemberEvent" ADD CONSTRAINT "MemberEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Adjust unique indexes to be per-organization ─────────────
DROP INDEX "WeeklyReport_weekStart_key";
CREATE UNIQUE INDEX "WeeklyReport_organizationId_weekStart_key" ON "WeeklyReport"("organizationId", "weekStart");

DROP INDEX "AttendanceRecord_userId_date_key";
CREATE UNIQUE INDEX "AttendanceRecord_organizationId_userId_date_key" ON "AttendanceRecord"("organizationId", "userId", "date");

-- ─── Move org-context columns off User (now on OrganizationMember) ─
ALTER TABLE "User"
    DROP COLUMN "jobTitle",
    DROP COLUMN "isBoss",
    DROP COLUMN "active",
    DROP COLUMN "allowedModules",
    DROP COLUMN "trackAttendance",
    DROP COLUMN "persona",
    DROP COLUMN "personality",
    DROP COLUMN "bio",
    DROP COLUMN "attendance",
    DROP COLUMN "productivityNote";
