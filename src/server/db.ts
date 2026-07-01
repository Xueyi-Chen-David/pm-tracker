import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Prisma 7 的 engine="client" 需要 driver adapter。
// 本機 Docker Postgres 不用 SSL；Neon / Supabase 等雲端 Postgres 需要 SSL。
const connectionString = process.env.DATABASE_URL ?? "";
const needsSsl = /sslmode=require|neon\.tech|supabase\.|render\.com|amazonaws\.com/i.test(
  connectionString,
);

function makeClient() {
  const adapter = new PrismaPg({
    connectionString,
    ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
  });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db = globalForPrisma.prisma ?? makeClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
