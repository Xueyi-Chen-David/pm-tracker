-- autoAbsent 泛化為 auto（缺席與在外工作等「事件自動產生」的紀錄共用此旗標）
ALTER TABLE "AttendanceRecord" RENAME COLUMN "autoAbsent" TO "auto";

-- 在外工作（出差 / 在家工作）：出席月曆以圈圈呈現
ALTER TABLE "AttendanceRecord" ADD COLUMN     "offsite" BOOLEAN NOT NULL DEFAULT false;
