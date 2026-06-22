CREATE TABLE "UploadedDocument" (
    "id"            SERIAL NOT NULL,
    "uploadedById"  INTEGER NOT NULL,
    "filename"      TEXT NOT NULL,
    "mimeType"      TEXT NOT NULL,
    "fileSize"      INTEGER NOT NULL,
    "extractedText" TEXT NOT NULL DEFAULT '',
    "title"         TEXT,
    "author"        TEXT,
    "pageCount"     INTEGER,
    "language"      TEXT,
    "uploadedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UploadedDocument_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "UploadedDocument_uploadedById_idx" ON "UploadedDocument"("uploadedById");

ALTER TABLE "UploadedDocument"
    ADD CONSTRAINT "UploadedDocument_uploadedById_fkey"
    FOREIGN KEY ("uploadedById") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
