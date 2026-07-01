-- ProjectView: 單一 status/type → 陣列 statuses/types + exclude（反向篩選）
-- 先加新欄位，把舊的單值搬進陣列，再刪舊欄位（保留既有視窗的篩選）。

-- 1) 新增欄位
ALTER TABLE "ProjectView"
  ADD COLUMN "exclude" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "statuses" "ProjectStatus"[],
  ADD COLUMN "types" "ProjectType"[];

-- 2) 搬移既有資料
UPDATE "ProjectView" SET "statuses" = ARRAY["status"]::"ProjectStatus"[] WHERE "status" IS NOT NULL;
UPDATE "ProjectView" SET "types" = ARRAY["type"]::"ProjectType"[] WHERE "type" IS NOT NULL;

-- 3) 刪除舊欄位
ALTER TABLE "ProjectView" DROP COLUMN "status", DROP COLUMN "type";
