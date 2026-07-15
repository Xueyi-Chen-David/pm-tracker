import "dotenv/config";
import { defineConfig } from "prisma/config";

// 遷移 / CLI（migrate、db push、studio）一律走「直連」（非 -pooler）連線。
// 原因：Neon 的 pooler 是 PgBouncer 交易池化模式，Prisma migrate 需要的
// session 級 pg_advisory_lock 會被切到不同 backend、造成孤兒鎖卡死 migrate
// （P1002 advisory lock timeout）。app 執行時仍用 DATABASE_URL（pooler）沒問題。
// 設定 DIRECT_URL（把 host 的 "-pooler" 去掉）即啟用；未設則退回 DATABASE_URL。
const datasourceUrl =
  process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim() || "";

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
