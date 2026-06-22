# TODO — PFE Platform

**Date:** 2026-06-04  
**Ordered by:** Priority (blocking → high → medium → low)

---

## IMMEDIATE — Technical Debt

- [ ] **[DEBT-1]** Move secrets out of `docker-compose.yml` into `.env` file — `JWT_REFRESH_SECRET`, DB passwords
- [x] **[DEBT-2]** Install and configure `@nestjs/swagger` in `backend/src/main.ts` ✅
- [x] **[DEBT-3]** Add global exception filter (`AllExceptionsFilter`) to NestJS ✅
- [ ] **[DEBT-4]** Add `@nestjs/throttler` rate limiting guard to NestJS
- [ ] **[DEBT-5]** Configure Winston structured logger in NestJS (replace `console.log`)

---

## PHASE 2 — Generic URL Scraper ✅ COMPLETE

### 2A — Database (Prisma)
- [x] **[P2-DB-1]** Write Prisma migration: add `url TEXT` to `ScrapingJob` ✅
- [x] **[P2-DB-2]** Write Prisma migration: create `ScrapedDocument` table ✅
- [ ] **[P2-DB-3]** Run `prisma generate` + apply migration (`docker compose up` will auto-apply)
- [x] **[P2-DB-4]** Update `schema.prisma` with new models and relations ✅

### 2B — FastAPI (AI Service)
- [x] **[P2-AI-1]** Refactor `scraper.py`: added `scrape_url(url: str) -> dict` ✅
- [x] **[P2-AI-2]** Generic content extractor: title, meta description, H1-H6, main text ✅
- [x] **[P2-AI-3]** URL validation happens at NestJS layer via `@IsUrl()` ✅
- [x] **[P2-AI-4]** `_clean_text()` utility strips excess whitespace ✅
- [x] **[P2-AI-5]** `POST /scrape` endpoint created ✅
- [x] **[P2-AI-6]** `POST /scrape/run-job` endpoint created ✅
- [x] **[P2-AI-7]** Preserved `POST /scraper/run` (CoinMarketCap) ✅
- [x] **[P2-AI-8]** `ScrapedDocument` stored via SQLAlchemy in `run_url_scraping_job()` ✅
- [x] **[P2-AI-9]** `ScrapedDocument` SQLAlchemy model added to `models.py` ✅
- [x] **[P2-AI-10]** `reload_active_jobs()` dispatches to URL vs CMC scheduler ✅

### 2C — NestJS Backend
- [x] **[P2-BE-1]** `CreateUrlJobDto` with `url`, `name`, `mode`, `intervalSeconds` ✅
- [x] **[P2-BE-2]** `POST /scraping-jobs` endpoint ✅
- [x] **[P2-BE-3]** `GET /scraping-jobs` endpoint (ADMIN/DECISION_MAKER see all, EXPERT sees own) ✅
- [x] **[P2-BE-4]** `GET /scraping-jobs/:id` endpoint (with recent documents) ✅
- [x] **[P2-BE-5]** `DELETE /scraping-jobs/:id` endpoint ✅
- [x] **[P2-BE-6]** `GET /scraping-jobs/:id/documents` endpoint ✅
- [x] **[P2-BE-7]** `GET /scraping-jobs/documents/:docId` endpoint ✅
- [x] **[P2-BE-8]** Service calls FastAPI `POST /scrape` after job creation ✅
- [x] **[P2-BE-9]** Swagger decorators on all endpoints ✅

### 2D — Frontend
- [x] **[P2-FE-1]** `/expert/url-scraper` — URL submission form with frequency selector ✅
- [x] **[P2-FE-2]** `/expert/url-jobs` — jobs dashboard (URL, status, doc count, delete) ✅
- [x] **[P2-FE-3]** `/expert/documents/[id]` — document viewer (title, URL, content, date) ✅
- [x] **[P2-FE-4]** Expert sidebar updated with "New URL Job" + "URL Jobs" nav items + active highlighting ✅
- [x] **[P2-FE-5]** apiClient unchanged — `fetchWithAuth` already handles new endpoints ✅

---

## PHASE 3 — Document Ingestion

### 3A — Infrastructure
- [ ] **[P3-INFRA-1]** Add Apache Tika container to `docker-compose.yml` (port 9998)
- [ ] **[P3-INFRA-2]** Add Tika URL env variable to FastAPI service

### 3B — Database
- [ ] **[P3-DB-1]** Write Prisma migration: create `UploadedDocument` table (id, userId, filename, mimeType, size, extractedText, metadata, uploadedAt)

### 3C — NestJS Backend
- [ ] **[P3-BE-1]** Install `multer` + `@types/multer`
- [ ] **[P3-BE-2]** Create `DocumentsModule`, `DocumentsService`, `DocumentsController`
- [ ] **[P3-BE-3]** Create `POST /documents/upload` endpoint — multipart, validate MIME type
- [ ] **[P3-BE-4]** Create `GET /documents` endpoint
- [ ] **[P3-BE-5]** Create `GET /documents/:id` endpoint
- [ ] **[P3-BE-6]** Create `DELETE /documents/:id` endpoint
- [ ] **[P3-BE-7]** Forward file to FastAPI `/extract` endpoint after upload
- [ ] **[P3-BE-8]** Add Swagger decorators

### 3D — FastAPI
- [ ] **[P3-AI-1]** Install `tika`, `pytesseract`, `pillow`, `python-docx`, `python-pptx`, `openpyxl`, `pypdf2`
- [ ] **[P3-AI-2]** Create `POST /extract` endpoint — accept uploaded file, return extracted text + metadata
- [ ] **[P3-AI-3]** Implement Tika-based extraction for PDF, DOCX, PPTX, XLSX
- [ ] **[P3-AI-4]** Implement Tesseract OCR fallback for scanned PDFs

### 3E — Frontend
- [ ] **[P3-FE-1]** Create `/expert/upload` page — drag-and-drop file upload
- [ ] **[P3-FE-2]** Create `/expert/documents` page — document list with metadata
- [ ] **[P3-FE-3]** Integrate document viewer from Phase 2 to handle uploads

---

## PHASE 4 — NLP Pipeline

### 4A — Database
- [ ] **[P4-DB-1]** Prisma migration: create `NlpResult` table (id, documentId, summary, entities JSON, keywords TEXT[], language, modelVersion, processedAt)

### 4B — FastAPI
- [ ] **[P4-AI-1]** Install `spacy`, download `en_core_web_sm`, `fr_core_news_sm`
- [ ] **[P4-AI-2]** Install `transformers`, `torch` (CPU-only for dev)
- [ ] **[P4-AI-3]** Implement NER extraction using spaCy
- [ ] **[P4-AI-4]** Implement summarization using `sshleifer/distilbart-cnn-12-6`
- [ ] **[P4-AI-5]** Implement language detection
- [ ] **[P4-AI-6]** Create `POST /nlp/process` endpoint — accept `{ document_id, text }`, return NLP result
- [ ] **[P4-AI-7]** Store NLP results to PostgreSQL
- [ ] **[P4-AI-8]** Add NLP job to APScheduler for background processing

### 4C — NestJS Backend
- [ ] **[P4-BE-1]** Create `NlpModule`, `NlpService`, `NlpController`
- [ ] **[P4-BE-2]** Create `POST /nlp/process/:documentId` endpoint
- [ ] **[P4-BE-3]** Create `GET /nlp/results/:documentId` endpoint
- [ ] **[P4-BE-4]** Trigger NLP processing after document ingestion (Phase 3)

### 4D — Frontend
- [ ] **[P4-FE-1]** Add NLP results tab to document viewer (summary, entities, keywords)
- [ ] **[P4-FE-2]** Add "Process with NLP" button on document detail page

---

## PHASE 5 — Semantic Search

### 5A — Infrastructure
- [ ] **[P5-INFRA-1]** Add Qdrant container to `docker-compose.yml` (port 6333/6334)
- [ ] **[P5-INFRA-2]** Add Elasticsearch container to `docker-compose.yml` (port 9200)

### 5B — Database
- [ ] **[P5-DB-1]** Prisma migration: create `DocumentChunk` table (id, documentId, chunkIndex, text, qdrantPointId)

### 5C — FastAPI
- [ ] **[P5-AI-1]** Install `qdrant-client`, `elasticsearch`, `sentence-transformers`
- [ ] **[P5-AI-2]** Implement chunking strategy (512 tokens, 50 overlap)
- [ ] **[P5-AI-3]** Implement embedding generation (`all-MiniLM-L6-v2`)
- [ ] **[P5-AI-4]** Implement Qdrant indexing endpoint
- [ ] **[P5-AI-5]** Implement Elasticsearch indexing endpoint
- [ ] **[P5-AI-6]** Create `POST /search` endpoint — hybrid semantic + keyword search
- [ ] **[P5-AI-7]** Implement search filters (date, source, type, sensitivity)
- [ ] **[P5-AI-8]** Trigger indexing after document ingestion

### 5D — NestJS Backend
- [ ] **[P5-BE-1]** Create `SearchModule`, `SearchService`, `SearchController`
- [ ] **[P5-BE-2]** Create `POST /search` endpoint — proxy to FastAPI
- [ ] **[P5-BE-3]** Create `GET /search/suggest` — autocomplete

### 5E — Frontend
- [ ] **[P5-FE-1]** Create search bar component (global, in header)
- [ ] **[P5-FE-2]** Create `/search` results page with highlighted snippets
- [ ] **[P5-FE-3]** Add filter panel (date, source, type)

---

## PHASE 6 — RAG Assistant

### 6A — Database
- [ ] **[P6-DB-1]** Prisma migration: create `ConversationThread` + `Message` tables

### 6B — FastAPI
- [ ] **[P6-AI-1]** Install `llama-index-core`, `llama-index-vector-stores-qdrant`, `openai`
- [ ] **[P6-AI-2]** Configure LlamaIndex with Qdrant vector store
- [ ] **[P6-AI-3]** Implement RAG query pipeline (retrieve → prompt → generate)
- [ ] **[P6-AI-4]** Implement citation extraction from retrieved chunks
- [ ] **[P6-AI-5]** Create `POST /assistant/chat` endpoint
- [ ] **[P6-AI-6]** Implement SSE streaming response

### 6C — NestJS Backend
- [ ] **[P6-BE-1]** Create `AssistantModule`, `AssistantService`, `AssistantController`
- [ ] **[P6-BE-2]** Create `POST /assistant/chat` — stream response
- [ ] **[P6-BE-3]** Create `GET /assistant/history` — get threads
- [ ] **[P6-BE-4]** Create `DELETE /assistant/history/:threadId`

### 6D — Frontend
- [ ] **[P6-FE-1]** Create `/assistant` chat page
- [ ] **[P6-FE-2]** Implement streaming message rendering
- [ ] **[P6-FE-3]** Implement citation cards (expand to show source)
- [ ] **[P6-FE-4]** Implement conversation history sidebar

---

## PHASE 7 — Analytics Dashboard

### 7A — FastAPI
- [ ] **[P7-AI-1]** Install `bertopic`, `recharts` (frontend)
- [ ] **[P7-AI-2]** Implement BERTopic model training endpoint
- [ ] **[P7-AI-3]** Create `GET /analytics/corpus` — stats
- [ ] **[P7-AI-4]** Create `GET /analytics/topics` — topic model results
- [ ] **[P7-AI-5]** Create `GET /analytics/trends` — time-series
- [ ] **[P7-AI-6]** Create `GET /analytics/risks` — risk scoring

### 7B — NestJS Backend
- [ ] **[P7-BE-1]** Create `AnalyticsModule`, `AnalyticsService`, `AnalyticsController`
- [ ] **[P7-BE-2]** Proxy analytics endpoints from FastAPI

### 7C — Frontend
- [ ] **[P7-FE-1]** Install `recharts`
- [ ] **[P7-FE-2]** Implement Decision Maker dashboard — corpus stats
- [ ] **[P7-FE-3]** Implement topic distribution chart
- [ ] **[P7-FE-4]** Implement trend timeline chart
- [ ] **[P7-FE-5]** Implement risk indicator cards
- [ ] **[P7-FE-6]** Implement Executive summary page (US22-US24)

---

## ONGOING — Quality

- [ ] **[QA-1]** Write unit tests for `ScrapingService` (NestJS)
- [ ] **[QA-2]** Write unit tests for `AuthService`
- [ ] **[QA-3]** Write unit tests for `UsersService`
- [ ] **[QA-4]** Write integration tests for auth flow
- [ ] **[QA-5]** Write integration tests for scraping job lifecycle
- [ ] **[QA-6]** Add FastAPI pytest test suite
- [ ] **[QA-7]** Set up GitHub Actions CI (lint + test on push)
- [ ] **[QA-8]** Update `README.md` with full setup instructions after Phase 2

---

## SUMMARY COUNTS

| Phase | Tasks | Status |
|-------|-------|--------|
| Immediate (Debt) | 5 | Not started |
| Phase 2 — Scraper | 29 | Not started |
| Phase 3 — Ingestion | 18 | Not started |
| Phase 4 — NLP | 16 | Not started |
| Phase 5 — Search | 18 | Not started |
| Phase 6 — RAG | 16 | Not started |
| Phase 7 — Analytics | 14 | Not started |
| Ongoing QA | 8 | Not started |
| **Total** | **124** | **0 complete** |
