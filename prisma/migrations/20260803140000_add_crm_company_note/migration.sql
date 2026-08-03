-- CreateTable
CREATE TABLE "CrmCompanyNote" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "note" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmCompanyNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CrmCompanyNote_organizationId_idx" ON "CrmCompanyNote"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "CrmCompanyNote_organizationId_company_key" ON "CrmCompanyNote"("organizationId", "company");

-- AddForeignKey
ALTER TABLE "CrmCompanyNote" ADD CONSTRAINT "CrmCompanyNote_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
