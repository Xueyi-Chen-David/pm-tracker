import "dotenv/config";
import { defineConfig } from "prisma/config";

// 遷移 / CLI（migrate、db push、studio）一律走「直連」（非 -pooler）連線。
// 原因：Neon 的 pooler 是 PgBouncer 交易池化模式，Prisma migrate 需要的
// session 級 pg_advisory_lock 會被切到不同 backend、造成孤兒鎖卡死 migrate
// （P1002 advisory lock timeout）。app 執行時仍用 DATABASE_URL（pooler）沒問題。
//
// 解析順序：
//   1) 明確設定的 DIRECT_URL（最優先，可完全自訂）。
//   2) 否則從 DATABASE_URL 自動推導直連——把 Neon host 的 "-pooler" 去掉。
//      這樣即使部署環境（如 Vercel）只設了 DATABASE_URL，migrate 也會走直連而不卡鎖。
//   3) 若 DATABASE_URL 本來就不是 pooler，替換不到就原樣使用。
function resolveMigrationUrl(): string {
  const explicit = process.env.DIRECT_URL?.trim();
  if (explicit) return explicit;
  const pooled = process.env.DATABASE_URL?.trim() ?? "";
  // 只替換 host 段的 "-pooler."（Neon 慣例），其餘連線參數（sslmode 等）保持不變。
  return pooled.replace(/-pooler\./, ".");
}

const datasourceUrl = resolveMigrationUrl();

if (!datasourceUrl) {
  throw new Error(
    "Missing DATABASE_URL / DIRECT_URL. 請在 .env 設定 Postgres 連線字串。",
  );
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: datasourceUrl,
  },
});
