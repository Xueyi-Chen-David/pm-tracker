-- AlterTable
ALTER TABLE "LeaveRequest" ADD COLUMN     "startTime" TEXT,
ADD COLUMN     "endTime" TEXT,
ADD COLUMN     "hours" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "AttendanceRecord" ADD COLUMN     "leaveHours" DOUBLE PRECISION;
