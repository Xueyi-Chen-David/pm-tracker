-- ─────────────────────────────────────────────────────────────
-- 移除「專案團隊成員」子系統（ProjectMember）。改以任務負責人（Task.owners）
-- 推導「誰在專案裡」。本 migration 會刪除 ProjectMember 資料表與其所有資料，
-- 以及不再使用的 MemberRole 列舉型別。⚠️ 資料無法復原。
-- ─────────────────────────────────────────────────────────────

-- DropForeignKey
ALTER TABLE "ProjectMember" DROP CONSTRAINT "ProjectMember_projectId_fkey";

-- DropForeignKey
ALTER TABLE "ProjectMember" DROP CONSTRAINT "ProjectMember_userId_fkey";

-- DropTable
DROP TABLE "ProjectMember";

-- DropEnum
DROP TYPE "MemberRole";
