-- ─────────────────────────────────────────────────────────────────────────────
-- Fix 1: Rename intervalMinutes → intervalSeconds
--   The original migration created the column as "intervalMinutes" but the
--   schema was later corrected to "intervalSeconds". This block handles both
--   states safely.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  -- If the old column name exists, rename it
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'ScrapingJob'
      AND column_name  = 'intervalMinutes'
  ) THEN
    ALTER TABLE "ScrapingJob" RENAME COLUMN "intervalMinutes" TO "intervalSeconds";
  END IF;

  -- If neither old nor new exists, add the column fresh
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'ScrapingJob'
      AND column_name  = 'intervalSeconds'
  ) THEN
    ALTER TABLE "ScrapingJob" ADD COLUMN "intervalSeconds" INTEGER;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Fix 2: Add url column to ScrapingJob (generic URL scraping target)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'ScrapingJob'
      AND column_name  = 'url'
  ) THEN
    ALTER TABLE "ScrapingJob" ADD COLUMN "url" TEXT;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Fix 3: Create ScrapedDocument table
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ScrapedDocument" (
    "id"          SERIAL NOT NULL,
    "jobId"       INTEGER NOT NULL,
    "url"         TEXT NOT NULL,
    "title"       TEXT,
    "description" TEXT,
    "content"     TEXT NOT NULL,
    "scrapedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScrapedDocument_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ScrapedDocument_jobId_idx" ON "ScrapedDocument"("jobId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'ScrapedDocument_jobId_fkey'
  ) THEN
    ALTER TABLE "ScrapedDocument"
      ADD CONSTRAINT "ScrapedDocument_jobId_fkey"
      FOREIGN KEY ("jobId") REFERENCES "ScrapingJob"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
