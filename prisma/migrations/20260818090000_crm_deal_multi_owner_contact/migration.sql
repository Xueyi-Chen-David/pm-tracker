-- CreateTable
CREATE TABLE "CrmDealContact" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmDealContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmDealOwner" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmDealOwner_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CrmDealContact_dealId_idx" ON "CrmDealContact"("dealId");

-- CreateIndex
CREATE INDEX "CrmDealContact_contactId_idx" ON "CrmDealContact"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "CrmDealContact_dealId_contactId_key" ON "CrmDealContact"("dealId", "contactId");

-- CreateIndex
CREATE INDEX "CrmDealOwner_dealId_idx" ON "CrmDealOwner"("dealId");

-- CreateIndex
CREATE INDEX "CrmDealOwner_userId_idx" ON "CrmDealOwner"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CrmDealOwner_dealId_userId_key" ON "CrmDealOwner"("dealId", "userId");

-- AddForeignKey
ALTER TABLE "CrmDealContact" ADD CONSTRAINT "CrmDealContact_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "CrmDeal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmDealContact" ADD CONSTRAINT "CrmDealContact_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "CrmContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmDealOwner" ADD CONSTRAINT "CrmDealOwner_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "CrmDeal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmDealOwner" ADD CONSTRAINT "CrmDealOwner_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: 既有商機的單一 contactId / ownerId 各自灌成一筆 isPrimary=true 的關聯，
-- 讓多選欄位在編輯舊資料時不會憑空看起來「沒有聯絡人 / 沒有負責人」。
INSERT INTO "CrmDealContact" ("id", "dealId", "contactId", "isPrimary", "createdAt")
SELECT gen_random_uuid()::text, "id", "contactId", true, now()
FROM "CrmDeal"
WHERE "contactId" IS NOT NULL;

INSERT INTO "CrmDealOwner" ("id", "dealId", "userId", "isPrimary", "createdAt")
SELECT gen_random_uuid()::text, "id", "ownerId", true, now()
FROM "CrmDeal"
WHERE "ownerId" IS NOT NULL;
