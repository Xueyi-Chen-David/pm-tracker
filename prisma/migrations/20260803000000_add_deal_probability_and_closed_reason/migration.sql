-- AlterTable
ALTER TABLE "DealStage" ADD COLUMN     "defaultProbability" INTEGER;

-- AlterTable
ALTER TABLE "CrmDeal" ADD COLUMN     "closedReason" TEXT,
ADD COLUMN     "probability" INTEGER;
