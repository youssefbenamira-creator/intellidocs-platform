-- CreateEnum
CREATE TYPE "ScrapingMode" AS ENUM ('ONE_TIME', 'CONTINUOUS');

-- CreateEnum
CREATE TYPE "ScrapingStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "ScrapingJob" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "createdById" INTEGER NOT NULL,
    "targetCoins" TEXT[],
    "attributes" TEXT[],
    "mode" "ScrapingMode" NOT NULL,
    "intervalMinutes" INTEGER,
    "status" "ScrapingStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScrapingJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScrapingResult" (
    "id" SERIAL NOT NULL,
    "jobId" INTEGER NOT NULL,
    "coin" TEXT NOT NULL,
    "rank" INTEGER,
    "price" DOUBLE PRECISION,
    "marketCap" DOUBLE PRECISION,
    "volume24h" DOUBLE PRECISION,
    "percentChange24h" DOUBLE PRECISION,
    "circulatingSupply" DOUBLE PRECISION,
    "scrapedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScrapingResult_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ScrapingJob" ADD CONSTRAINT "ScrapingJob_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapingResult" ADD CONSTRAINT "ScrapingResult_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ScrapingJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
