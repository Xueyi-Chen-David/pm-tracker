-- AlterTable
ALTER TABLE "CrmView" DROP COLUMN "mailHeader",
DROP COLUMN "mailFooter";

-- AlterTable
ALTER TABLE "CrmViewColumn" ADD COLUMN "header" TEXT,
ADD COLUMN "footer" TEXT;
