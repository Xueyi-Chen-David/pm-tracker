-- AlterTable
ALTER TABLE "MemberEvent" ADD COLUMN     "currentStep" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "decidedAt" TIMESTAMP(3),
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'PENDING';

-- CreateTable
CREATE TABLE "MemberEventApproval" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "approverMemberId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "comment" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemberEventApproval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MemberEventApproval_eventId_sortOrder_idx" ON "MemberEventApproval"("eventId", "sortOrder");

-- CreateIndex
CREATE INDEX "MemberEventApproval_approverMemberId_status_idx" ON "MemberEventApproval"("approverMemberId", "status");

-- CreateIndex
CREATE INDEX "MemberEvent_organizationId_status_idx" ON "MemberEvent"("organizationId", "status");

-- AddForeignKey
ALTER TABLE "MemberEventApproval" ADD CONSTRAINT "MemberEventApproval_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "MemberEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberEventApproval" ADD CONSTRAINT "MemberEventApproval_approverMemberId_fkey" FOREIGN KEY ("approverMemberId") REFERENCES "OrganizationMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
