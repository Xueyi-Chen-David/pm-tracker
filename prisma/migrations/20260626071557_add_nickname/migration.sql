-- AlterTable
ALTER TABLE "User" ADD COLUMN     "nickname" TEXT,
ADD COLUMN     "useNickname" BOOLEAN NOT NULL DEFAULT false;
