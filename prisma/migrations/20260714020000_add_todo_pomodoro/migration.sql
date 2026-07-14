-- ─────────────────────────────────────────────────────────────
-- 個人待辦（TodoItem）+ 番茄鐘（PomodoroSession）。每個人自己管理。
-- 純新增；TodoItem 可選關聯 Task（SetNull），Pomodoro 可選關聯 TodoItem（SetNull）。
-- ─────────────────────────────────────────────────────────────

-- TodoItem
CREATE TABLE "TodoItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "startDate" DATE,
    "dueDate" DATE,
    "taskId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TodoItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TodoItem_userId_idx" ON "TodoItem"("userId");
CREATE INDEX "TodoItem_organizationId_idx" ON "TodoItem"("organizationId");
CREATE INDEX "TodoItem_taskId_idx" ON "TodoItem"("taskId");

ALTER TABLE "TodoItem"
    ADD CONSTRAINT "TodoItem_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TodoItem"
    ADD CONSTRAINT "TodoItem_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TodoItem"
    ADD CONSTRAINT "TodoItem_taskId_fkey"
    FOREIGN KEY ("taskId") REFERENCES "Task"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- PomodoroSession
CREATE TABLE "PomodoroSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "todoId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "durationSec" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PomodoroSession_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PomodoroSession_userId_idx" ON "PomodoroSession"("userId");
CREATE INDEX "PomodoroSession_organizationId_idx" ON "PomodoroSession"("organizationId");
CREATE INDEX "PomodoroSession_todoId_idx" ON "PomodoroSession"("todoId");

ALTER TABLE "PomodoroSession"
    ADD CONSTRAINT "PomodoroSession_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PomodoroSession"
    ADD CONSTRAINT "PomodoroSession_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PomodoroSession"
    ADD CONSTRAINT "PomodoroSession_todoId_fkey"
    FOREIGN KEY ("todoId") REFERENCES "TodoItem"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
