-- ─────────────────────────────────────────────────────────────
-- 移除人資（HR）模組：自訂角色 / 權限、假別、薪資設定、薪資單。
-- 這些原由 20260714120000_add_hr_roles_payroll（＋ 20260715130000 的
-- visibleModules）建立；HR 模組現只保留在 `hr-management` 分支，main 不再有。
-- 用 IF EXISTS / CASCADE 保持冪等：即使建表 migration 尚未套到某環境也能安全執行。
-- ─────────────────────────────────────────────────────────────

-- 出席紀錄不再連到假別（先移除欄位 / 索引，才能安全刪 LeaveType）。
DROP INDEX IF EXISTS "AttendanceRecord_leaveTypeId_idx";
ALTER TABLE "AttendanceRecord" DROP COLUMN IF EXISTS "leaveTypeId";

-- 成員↔角色多對多、薪資單、薪資設定、自訂角色、假別。
DROP TABLE IF EXISTS "_MemberRoles" CASCADE;
DROP TABLE IF EXISTS "Payslip" CASCADE;
DROP TABLE IF EXISTS "SalaryProfile" CASCADE;
DROP TABLE IF EXISTS "OrgRoleDef" CASCADE;
DROP TABLE IF EXISTS "LeaveType" CASCADE;
