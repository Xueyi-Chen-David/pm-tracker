-- ─────────────────────────────────────────────────────────────
-- CRM 可自訂管線階段 + 階段異動時間線。
-- 階段從 enum 改為每組織可自訂的 DealStage 資料表；CrmDeal.stage 改存階段 key(text)。
-- 資料保留：既有商機 stage 值轉 text 並映射到新預設階段，並補一筆初始異動紀錄。
-- ─────────────────────────────────────────────────────────────

-- 1) DealStage：每組織的階段
CREATE TABLE "DealStage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "note" TEXT,
    "color" TEXT NOT NULL DEFAULT 'slate',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DealStage_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DealStage_organizationId_key_key" ON "DealStage"("organizationId", "key");
CREATE INDEX "DealStage_organizationId_idx" ON "DealStage"("organizationId");
ALTER TABLE "DealStage"
    ADD CONSTRAINT "DealStage_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- 2) DealStageChange：階段異動時間線
CREATE TABLE "DealStageChange" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "fromStage" TEXT,
    "toStage" TEXT NOT NULL,
    "reason" TEXT,
    "changedById" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DealStageChange_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DealStageChange_dealId_changedAt_idx" ON "DealStageChange"("dealId", "changedAt");
CREATE INDEX "DealStageChange_organizationId_idx" ON "DealStageChange"("organizationId");
ALTER TABLE "DealStageChange"
    ADD CONSTRAINT "DealStageChange_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DealStageChange"
    ADD CONSTRAINT "DealStageChange_dealId_fkey"
    FOREIGN KEY ("dealId") REFERENCES "CrmDeal"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- 3) CrmDeal.stage：enum → text（值以名稱保留）
ALTER TABLE "CrmDeal" ALTER COLUMN "stage" DROP DEFAULT;
ALTER TABLE "CrmDeal" ALTER COLUMN "stage" TYPE TEXT USING "stage"::text;
ALTER TABLE "CrmDeal" ALTER COLUMN "stage" SET DEFAULT 'LEAD';

-- 4) 舊階段值映射到新預設階段（避免孤兒）
UPDATE "CrmDeal" SET "stage" = CASE "stage"
    WHEN 'QUALIFIED' THEN 'CONTACTED'
    WHEN 'PROPOSAL' THEN 'MEETING'
    WHEN 'NEGOTIATION' THEN 'TRIAL'
    ELSE "stage" END;
UPDATE "CrmDeal" SET "stage" = 'LEAD'
    WHERE "stage" NOT IN ('LEAD','CONTACTED','REPLIED','MEETING','TRIAL','ACTIVE','FAILED','PAUSED');

-- 5) 為每個既有組織種下 8 個預設階段
INSERT INTO "DealStage" ("id","organizationId","key","label","color","sortOrder","createdAt","updatedAt")
SELECT gen_random_uuid()::text, o.id, v.key, v.label, v.color, v.ord, now(), now()
FROM "Organization" o
CROSS JOIN (VALUES
    ('LEAD','潛在','slate',0),
    ('CONTACTED','已接觸','sky',1),
    ('REPLIED','已回覆','cyan',2),
    ('MEETING','會議','violet',3),
    ('TRIAL','試用','amber',4),
    ('ACTIVE','正式服務','emerald',5),
    ('FAILED','已失敗','rose',6),
    ('PAUSED','暫停追蹤','zinc',7)
) AS v(key,label,color,ord)
ON CONFLICT ("organizationId","key") DO NOTHING;

-- 6) 為既有商機補一筆初始階段紀錄（時間線起點）
INSERT INTO "DealStageChange" ("id","organizationId","dealId","fromStage","toStage","reason","changedById","changedAt")
SELECT gen_random_uuid()::text, d."organizationId", d."id", NULL, d."stage", NULL, d."createdById", d."createdAt"
FROM "CrmDeal" d;

-- 7) 移除舊 enum 型別
DROP TYPE "CrmStage";
