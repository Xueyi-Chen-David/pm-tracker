-- AlterTable
ALTER TABLE "LeaveRequest" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedById" TEXT;

-- CreateIndex
CREATE INDEX "LeaveRequest_organizationId_deletedAt_idx" ON "LeaveRequest"("organizationId", "deletedAt");
