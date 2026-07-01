-- AlterTable
ALTER TABLE "User" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "attendance" TEXT,
ADD COLUMN     "bio" TEXT,
ADD COLUMN     "persona" TEXT,
ADD COLUMN     "personality" TEXT,
ADD COLUMN     "productivityNote" TEXT;
