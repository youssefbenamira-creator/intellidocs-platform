-- Phase 4: NLP fields on ScrapedDocument
ALTER TABLE "ScrapedDocument"
  ADD COLUMN IF NOT EXISTS "summary"  TEXT,
  ADD COLUMN IF NOT EXISTS "entities" JSONB,
  ADD COLUMN IF NOT EXISTS "keywords" TEXT[] NOT NULL DEFAULT '{}';
