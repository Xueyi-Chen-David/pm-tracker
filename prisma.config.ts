import "dotenv/config";
import { defineConfig } from "prisma/config";

const datasourceUrl = process.env.DATABASE_URL?.trim() ?? "";

if (!datasourceUrl) {
  throw new Error("Missing DATABASE_URL. 請在 .env 設定 Postgres 連線字串。");
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
