-- 會議：可附一個連結（Google Meet / 會議文件…）。
ALTER TABLE "Meeting" ADD COLUMN IF NOT EXISTS "link" TEXT;
