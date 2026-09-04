-- CreateTable
CREATE TABLE "OrganizationModule" (
    "organizationId" TEXT NOT NULL,
    "moduleKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "settings" JSONB,
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "installedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationModule_pkey" PRIMARY KEY ("organizationId","moduleKey")
);

-- CreateTable
CREATE TABLE "FoodLabelProduct" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameZh" TEXT,
    "supplier" TEXT,
    "state" TEXT NOT NULL DEFAULT 'solid',
    "servingSize" DOUBLE PRECISION,
    "packageSize" DOUBLE PRECISION,
    "crmDealId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FoodLabelProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FoodLabelConversion" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sourceText" TEXT NOT NULL,
    "regulationId" TEXT NOT NULL,
    "resultJson" JSONB NOT NULL,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "warningCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FoodLabelConversion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrganizationModule_organizationId_idx" ON "OrganizationModule"("organizationId");

-- CreateIndex
CREATE INDEX "FoodLabelProduct_organizationId_idx" ON "FoodLabelProduct"("organizationId");

-- CreateIndex
CREATE INDEX "FoodLabelProduct_crmDealId_idx" ON "FoodLabelProduct"("crmDealId");

-- CreateIndex
CREATE INDEX "FoodLabelConversion_organizationId_idx" ON "FoodLabelConversion"("organizationId");

-- CreateIndex
CREATE INDEX "FoodLabelConversion_productId_idx" ON "FoodLabelConversion"("productId");

-- AddForeignKey
ALTER TABLE "OrganizationModule" ADD CONSTRAINT "OrganizationModule_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoodLabelProduct" ADD CONSTRAINT "FoodLabelProduct_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoodLabelProduct" ADD CONSTRAINT "FoodLabelProduct_crmDealId_fkey" FOREIGN KEY ("crmDealId") REFERENCES "CrmDeal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoodLabelConversion" ADD CONSTRAINT "FoodLabelConversion_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoodLabelConversion" ADD CONSTRAINT "FoodLabelConversion_productId_fkey" FOREIGN KEY ("productId") REFERENCES "FoodLabelProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ─────────────────────────────────────────────────────────────
-- Backfill：既有組織一律視為「已安裝目前所有既有模組」。
--
-- 這段是必要的：canSeeModule 從此多一道「組織已安裝」的閘門，若不補這些資料列，
-- 既有組織在部署後會瞬間看不到任何非核心模組。
-- 核心模組（dashboard / daily / todo / checkin / me / apps）不進這張表，永遠可用。
-- 新模組 foodlabel 刻意不補——它要由管理員自己到「應用程式」頁安裝。
-- ─────────────────────────────────────────────────────────────
INSERT INTO "OrganizationModule" ("organizationId", "moduleKey", "enabled", "installedAt", "updatedAt")
SELECT o."id", m."key", true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Organization" o
CROSS JOIN (VALUES
  ('projects'), ('company'), ('crm'), ('timeline'), ('team'),
  ('hr'), ('attendance'), ('leave'), ('payroll'),
  ('training'), ('meetings'), ('report')
) AS m("key")
ON CONFLICT ("organizationId", "moduleKey") DO NOTHING;
