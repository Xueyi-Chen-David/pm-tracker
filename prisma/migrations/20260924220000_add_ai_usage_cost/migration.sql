-- AI 用量：每筆呼叫的美金費用（寫入當下依價目換算）。
ALTER TABLE "AiUsage" ADD COLUMN "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- 回填既有紀錄：都是 gemini-2.5-flash 的文字 / 圖片輸入（輸入 $0.30、輸出 $2.50 / 百萬 tokens）。
-- 輸出以 total - input 計（含 thinking tokens，與 Google 計費一致）。
UPDATE "AiUsage"
SET "costUsd" = ("inputTokens" * 0.30 + GREATEST("totalTokens" - "inputTokens", "outputTokens") * 2.50) / 1000000.0;
