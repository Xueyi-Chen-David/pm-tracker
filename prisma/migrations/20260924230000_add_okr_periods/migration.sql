-- ─────────────────────────────────────────────────────────────
-- 公司 OKR：可自行新增的年份 / 季度（OkrPeriod）。quarter=0＝年份，1–4＝該年 Q1–Q4。
-- 回填：既有目標用到的年份與季度都建立對應的 period，畫面維持原樣。
-- ─────────────────────────────────────────────────────────────

CREATE TABLE "OkrPeriod" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "quarter" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OkrPeriod_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OkrPeriod_organizationId_year_quarter_key" ON "OkrPeriod"("organizationId", "year", "quarter");

ALTER TABLE "OkrPeriod" ADD CONSTRAINT "OkrPeriod_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 年份：所有目標 cycle 開頭的四位數年份
INSERT INTO "OkrPeriod" ("id", "organizationId", "year", "quarter")
SELECT gen_random_uuid()::text, t."organizationId", t.y, 0
FROM (
  SELECT DISTINCT "organizationId", CAST(substring("cycle" from '^([0-9]{4})') AS INTEGER) AS y
  FROM "Objective"
  WHERE "cycle" ~ '^[0-9]{4}'
) t
ON CONFLICT DO NOTHING;

-- 季度：季度目標的 "YYYY Qn"
INSERT INTO "OkrPeriod" ("id", "organizationId", "year", "quarter")
SELECT gen_random_uuid()::text, t."organizationId", t.y, t.q
FROM (
  SELECT DISTINCT "organizationId",
    CAST(substring("cycle" from '^([0-9]{4})') AS INTEGER) AS y,
    CAST(substring("cycle" from 'Q([1-4])') AS INTEGER) AS q
  FROM "Objective"
  WHERE "cycle" ~ '^[0-9]{4} Q[1-4]$'
) t
ON CONFLICT DO NOTHING;
