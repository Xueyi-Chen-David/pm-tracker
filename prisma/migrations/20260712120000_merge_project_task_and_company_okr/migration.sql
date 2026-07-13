-- CreateEnum
CREATE TYPE "OkrLevel" AS ENUM ('ANNUAL', 'QUARTERLY');

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "vision" TEXT;

-- AlterTable
ALTER TABLE "Objective" ADD COLUMN     "level" "OkrLevel" NOT NULL DEFAULT 'QUARTERLY';

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "KrStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "health" "Health" NOT NULL DEFAULT 'GREEN',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "dueDate" DATE,
    "ownerLabel" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_TaskOwners" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_TaskOwners_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "Task_projectId_idx" ON "Task"("projectId");

-- CreateIndex
CREATE INDEX "_TaskOwners_B_index" ON "_TaskOwners"("B");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TaskOwners" ADD CONSTRAINT "_TaskOwners_A_fkey" FOREIGN KEY ("A") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TaskOwners" ADD CONSTRAINT "_TaskOwners_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Data: 「OKR / 目標」模組已拆分 —— 策略層 OKR 移到新的「公司營運」頁(company)，
-- 營運層併入既有的「專案與任務」頁(projects)。把細分權限裡的 'okr' 重映成 'company'，
-- 讓原本只被授權看 OKR 的成員改看得到公司營運頁。（空陣列＝全開者不受影響。）
UPDATE "OrganizationMember"
SET "allowedModules" = array_replace("allowedModules", 'okr', 'company')
WHERE 'okr' = ANY("allowedModules");
