-- ─────────────────────────────────────────────────────────────
-- 專案版本發布紀錄（changelog）：ProjectRelease + ReleaseStatus。
-- 另在 ActivityKind 加入 RELEASE，供版本變更寫入操作軌跡。純新增，不動既有資料。
-- ─────────────────────────────────────────────────────────────

-- 1) 操作紀錄種類新增 RELEASE（PG12+ 允許在交易內 ADD VALUE，只要當下不使用）
ALTER TYPE "ActivityKind" ADD VALUE IF NOT EXISTS 'RELEASE';

-- 2) 版本發布狀態列舉
CREATE TYPE "ReleaseStatus" AS ENUM ('PLANNED', 'RELEASED');

-- 3) ProjectRelease
CREATE TABLE "ProjectRelease" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "title" TEXT,
    "notes" TEXT,
    "status" "ReleaseStatus" NOT NULL DEFAULT 'RELEASED',
    "releasedAt" DATE,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProjectRelease_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ProjectRelease_projectId_idx" ON "ProjectRelease"("projectId");
ALTER TABLE "ProjectRelease"
    ADD CONSTRAINT "ProjectRelease_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
