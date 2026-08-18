-- CreateTable
CREATE TABLE "CrmCompanyProfile" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "industry" TEXT,
    "location" TEXT,
    "headcount" TEXT,
    "founded" TEXT,
    "website" TEXT,
    "representativeName" TEXT,
    "products" TEXT,
    "companyIntro" TEXT,
    "entryHook" TEXT,
    "hasPhysicalStore" BOOLEAN,
    "ecommercePlatform" TEXT,
    "grade" TEXT,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmCompanyProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CrmCompanyProfile_organizationId_company_key" ON "CrmCompanyProfile"("organizationId", "company");

-- AddForeignKey
ALTER TABLE "CrmCompanyProfile" ADD CONSTRAINT "CrmCompanyProfile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
