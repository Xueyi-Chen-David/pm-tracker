-- AlterEnum
ALTER TYPE "CrmViewColumnType" ADD VALUE 'MAIL';

-- AlterTable
ALTER TABLE "CrmView" ADD COLUMN "mailHeader" TEXT,
ADD COLUMN "mailFooter" TEXT;

-- AlterTable
ALTER TABLE "CrmViewColumn" ADD COLUMN "template" TEXT;
