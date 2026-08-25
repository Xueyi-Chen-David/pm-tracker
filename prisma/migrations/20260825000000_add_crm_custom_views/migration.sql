-- CreateEnum
CREATE TYPE "CrmViewColumnType" AS ENUM ('STAGE', 'CHECKBOX', 'DATE', 'TEXT', 'SELECT');

-- CreateTable
CREATE TABLE "CrmView" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmViewColumn" (
    "id" TEXT NOT NULL,
    "viewId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "CrmViewColumnType" NOT NULL,
    "selectOptions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmViewColumn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmViewCellValue" (
    "id" TEXT NOT NULL,
    "columnId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "value" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmViewCellValue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CrmView_organizationId_idx" ON "CrmView"("organizationId");

-- CreateIndex
CREATE INDEX "CrmViewColumn_viewId_idx" ON "CrmViewColumn"("viewId");

-- CreateIndex
CREATE UNIQUE INDEX "CrmViewCellValue_columnId_dealId_key" ON "CrmViewCellValue"("columnId", "dealId");

-- CreateIndex
CREATE INDEX "CrmViewCellValue_dealId_idx" ON "CrmViewCellValue"("dealId");

-- AddForeignKey
ALTER TABLE "CrmView" ADD CONSTRAINT "CrmView_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmViewColumn" ADD CONSTRAINT "CrmViewColumn_viewId_fkey" FOREIGN KEY ("viewId") REFERENCES "CrmView"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmViewCellValue" ADD CONSTRAINT "CrmViewCellValue_columnId_fkey" FOREIGN KEY ("columnId") REFERENCES "CrmViewColumn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmViewCellValue" ADD CONSTRAINT "CrmViewCellValue_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "CrmDeal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
