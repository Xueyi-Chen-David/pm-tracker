-- ─────────────────────────────────────────────────────────────
-- 員工教育訓練文件庫（Training Docs）：巢狀資料夾 + markdown 文件。
-- 取代原本的課程指派 / 完成追蹤（舊 TrainingCourse / TrainingAssignment 表保留不動）。
-- 純新增，不刪除既有資料。
-- ─────────────────────────────────────────────────────────────

-- 1) TrainingDocFolder：可多層巢狀的文件資料夾（parentId 自參照）
CREATE TABLE "TrainingDocFolder" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "organizationId" TEXT NOT NULL,
    "parentId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TrainingDocFolder_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TrainingDocFolder_organizationId_idx" ON "TrainingDocFolder"("organizationId");
CREATE INDEX "TrainingDocFolder_parentId_idx" ON "TrainingDocFolder"("parentId");
ALTER TABLE "TrainingDocFolder"
    ADD CONSTRAINT "TrainingDocFolder_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrainingDocFolder"
    ADD CONSTRAINT "TrainingDocFolder_parentId_fkey"
    FOREIGN KEY ("parentId") REFERENCES "TrainingDocFolder"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- 2) TrainingDocPage：markdown 文件（樹葉節點）
CREATE TABLE "TrainingDocPage" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "organizationId" TEXT NOT NULL,
    "folderId" TEXT,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TrainingDocPage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TrainingDocPage_organizationId_idx" ON "TrainingDocPage"("organizationId");
CREATE INDEX "TrainingDocPage_folderId_idx" ON "TrainingDocPage"("folderId");
ALTER TABLE "TrainingDocPage"
    ADD CONSTRAINT "TrainingDocPage_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrainingDocPage"
    ADD CONSTRAINT "TrainingDocPage_folderId_fkey"
    FOREIGN KEY ("folderId") REFERENCES "TrainingDocFolder"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
