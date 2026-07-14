-- 額外（虛線 / 矩陣式）回報對象：OrganizationMember.secondaryManagerIds
--   • 值＝其他成員的 membership id 陣列（無 FK；移除成員時由應用層清理殘留 id）。
--   • 這些人與正式上級主管一樣，可在每日報告看到並回饋這位成員的日報。
ALTER TABLE "OrganizationMember"
    ADD COLUMN "secondaryManagerIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
