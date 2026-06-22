-- Phase 4: NLP fields on UploadedDocument
ALTER TABLE "UploadedDocument"
  ADD COLUMN IF NOT EXISTS "summary"  TEXT,
  ADD COLUMN IF NOT EXISTS "entities" JSONB,
  ADD COLUMN IF NOT EXISTS "keywords" TEXT[] NOT NULL DEFAULT '{}';
