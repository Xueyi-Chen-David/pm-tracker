-- ─────────────────────────────────────────────────────────────
-- 員工教育訓練（Training）：課程目錄 + 指派 / 完成追蹤。
-- Hand-written; apply with `prisma migrate deploy`.
-- ─────────────────────────────────────────────────────────────

-- CreateEnum
CREATE TYPE "TrainingFormat" AS ENUM ('ONLINE', 'VIDEO', 'DOCUMENT', 'IN_PERSON', 'EXTERNAL');
CREATE TYPE "TrainingStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED');

-- CreateTable
CREATE TABLE "TrainingCourse" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT '一般',
    "format" "TrainingFormat" NOT NULL DEFAULT 'ONLINE',
    "resourceUrl" TEXT,
    "estimatedMin" INTEGER,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "renewMonths" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "TrainingCourse_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TrainingCourse_organizationId_idx" ON "TrainingCourse"("organizationId");

ALTER TABLE "TrainingCourse" ADD CONSTRAINT "TrainingCourse_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "TrainingAssignment" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "TrainingStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "dueDate" DATE,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "score" INTEGER,
    "note" TEXT,
    "assignedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "TrainingAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TrainingAssignment_courseId_userId_key" ON "TrainingAssignment"("courseId", "userId");
CREATE INDEX "TrainingAssignment_organizationId_idx" ON "TrainingAssignment"("organizationId");
CREATE INDEX "TrainingAssignment_userId_status_idx" ON "TrainingAssignment"("userId", "status");
CREATE INDEX "TrainingAssignment_courseId_idx" ON "TrainingAssignment"("courseId");

ALTER TABLE "TrainingAssignment" ADD CONSTRAINT "TrainingAssignment_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "TrainingCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrainingAssignment" ADD CONSTRAINT "TrainingAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrainingAssignment" ADD CONSTRAINT "TrainingAssignment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
