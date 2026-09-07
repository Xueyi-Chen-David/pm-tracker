-- 公司文件：每份文件的可見性權限。
-- visibility: 'ALL'（所有人可見，預設）| 'RESTRICTED'（僅 allowedUserIds，管理者一律可見）。
-- 用 IF NOT EXISTS 讓此 migration 可重複套用（可能已由 seed 腳本先手動補上欄位）。
ALTER TABLE "TrainingDocPage"
    ADD COLUMN IF NOT EXISTS "visibility" TEXT NOT NULL DEFAULT 'ALL';
ALTER TABLE "TrainingDocPage"
    ADD COLUMN IF NOT EXISTS "allowedUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
