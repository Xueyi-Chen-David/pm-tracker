-- ─────────────────────────────────────────────────────────────
-- AI：組織自備 Gemini API key（加密存放）+ 每次 AI 呼叫的用量紀錄（AiUsage）。
-- 平台不再使用共用的 GOOGLE_API_KEY。純新增欄位 / 資料表，不影響既有資料。
-- ─────────────────────────────────────────────────────────────

ALTER TABLE "Organization" ADD COLUMN "geminiApiKeyEncrypted" TEXT;
ALTER TABLE "Organization" ADD COLUMN "geminiApiKeyLast4" TEXT;

CREATE TABLE "AiUsage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT,
    "feature" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "ok" BOOLEAN NOT NULL DEFAULT true,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiUsage_organizationId_createdAt_idx" ON "AiUsage"("organizationId", "createdAt");

ALTER TABLE "AiUsage" ADD CONSTRAINT "AiUsage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
