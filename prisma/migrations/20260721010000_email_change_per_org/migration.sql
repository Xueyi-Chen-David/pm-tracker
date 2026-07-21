-- ─────────────────────────────────────────────────────────────
-- 變更 Email 改為「per 組織」：EmailChangeRequest 增加 organizationId，
-- 驗證後只更新該組織的成員 email（不動全域登入身分、不影響其他組織）。
-- 待驗證請求是暫時性資料，先清空以便加上 NOT NULL 欄位。
-- ─────────────────────────────────────────────────────────────
DELETE FROM "EmailChangeRequest";

ALTER TABLE "EmailChangeRequest" ADD COLUMN "organizationId" TEXT NOT NULL;

CREATE INDEX "EmailChangeRequest_organizationId_idx" ON "EmailChangeRequest"("organizationId");

ALTER TABLE "EmailChangeRequest" ADD CONSTRAINT "EmailChangeRequest_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
