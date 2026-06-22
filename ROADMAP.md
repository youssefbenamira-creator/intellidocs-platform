# ROADMAP — PFE Platform

**Date:** 2026-06-04  
**Status:** Active development  
**Target:** Production-ready AI-powered document intelligence platform

---

## VISION

Transform the current CoinMarketCap scraper into a full-stack **Document Intelligence Platform** that ingests content from any URL or uploaded file, processes it through an NLP pipeline, indexes it for semantic search, and exposes it through a RAG-powered assistant and analytics dashboard.

---

## MILESTONE MAP

```
DONE          IN PROGRESS      UPCOMING
───────────   ─────────────    ─────────────────────────────────────────
Sprint 1      Sprint 2 (95%)   Phase 2  →  Phase 3  →  Phase 4  →  Phase 5  →  Phase 6  →  Phase 7
Auth/RBAC     CMC Scraper      Generic     Document    NLP         Semantic    RAG         Analytics
                               Scraper     Ingestion   Pipeline    Search      Assistant   Dashboard
```

---

## PHASE 2 — GENERIC URL SCRAPER

**Goal:** Replace hardcoded CoinMarketCap scraper with a URL-agnostic content extractor.

**Scope:**
- New Prisma models: `ScrapingJob` (url-based) + `ScrapedDocument`
- FastAPI: generic `scrape_url(url)` using Playwright
- NestJS: CRUD endpoints for scraping jobs + document retrieval
- Frontend: URL submission form, jobs dashboard, document viewer

**Key Decisions:**
- Keep APScheduler; add cron-expression support alongside interval-seconds
- Preserve existing CoinMarketCap flow during migration (don't break Sprint 2 work)
- Store raw HTML + extracted text separately for reprocessing

**Deliverables:**
- `POST /scraping-jobs` — create a scraping job with URL + frequency
- `GET /scraping-jobs` — list jobs
- `GET /scraping-jobs/:id` — get job + its documents
- `DELETE /scraping-jobs/:id` — delete job
- `POST /scrape` — trigger immediate scrape
- `POST /scrape/run-job` — run a scheduled job
- Frontend: 3 new pages (URL form, jobs dashboard, document viewer)

**Database Migration:** Add `ScrapedDocument` table; rename/extend `ScrapingJob`

---

## PHASE 3 — DOCUMENT INGESTION

**Goal:** Allow users to upload files (PDF, DOCX, PPTX, XLSX, TXT) and have them processed into searchable documents.

**Scope:**
- NestJS: multipart file upload endpoint
- FastAPI: extraction pipeline using Apache Tika
- OCR fallback: Tesseract for scanned PDFs
- Metadata storage: filename, MIME type, page count, author, created date

**Key Decisions:**
- Tika runs as a sidecar container (Java-based) — add to Docker Compose
- All extracted content feeds the same `ScrapedDocument` schema as Phase 2
- Virus scan consideration: validate MIME type at upload boundary

**Deliverables:**
- `POST /documents/upload` — multipart upload
- `GET /documents` — list documents with metadata
- `GET /documents/:id` — get document + extracted content
- `DELETE /documents/:id` — delete
- FastAPI: `/extract` endpoint using Tika
- Frontend: upload UI with drag-and-drop, document list, viewer

**Docker Addition:** Apache Tika container

---

## PHASE 4 — NLP PIPELINE

**Goal:** Enrich every document (from scraping or upload) with automatic summaries, named entities, and structured metadata.

**Scope:**
- FastAPI: NLP processing pipeline triggered post-ingestion
- spaCy for NER (organizations, persons, locations, dates)
- HuggingFace Transformers for abstractive summarization
- Store NLP artifacts in dedicated tables

**Key Decisions:**
- Pipeline is async: ingestion returns immediately; NLP runs in background via APScheduler or Celery task
- Store multiple NLP runs per document (allow re-processing with different models)
- Language detection before model selection

**Deliverables:**
- `POST /nlp/process/:documentId` — trigger NLP on a document
- `GET /nlp/results/:documentId` — get NLP results
- Prisma models: `NlpResult` (summary, entities JSON, keywords, language)
- Frontend: NLP results panel in document viewer

**Model Choices:**
- Summarization: `facebook/bart-large-cnn` or `sshleifer/distilbart-cnn-12-6`
- NER: spaCy `en_core_web_sm` + `fr_core_news_sm`

---

## PHASE 5 — SEMANTIC SEARCH

**Goal:** Enable users to search across all documents using natural language queries.

**Scope:**
- Sentence embeddings for all document chunks
- Qdrant for vector similarity search
- Elasticsearch for keyword/BM25 search
- Hybrid search API combining both

**Key Decisions:**
- Chunk documents at ingestion time (512-token windows, 50-token overlap)
- Embedding model: `sentence-transformers/all-MiniLM-L6-v2` (lightweight, multilingual ok)
- Re-index triggered on document ingest or NLP completion
- Search filters: date range, source URL, document type, sensitivity level

**Deliverables:**
- `POST /search` — hybrid search query
- `GET /search/suggest` — autocomplete
- Prisma model: `DocumentChunk` (text, embedding ref, doc FK)
- Qdrant collection setup scripts
- Elasticsearch index mapping
- Frontend: search bar, results list with highlighted snippets, filter panel

**Docker Additions:** Qdrant container, Elasticsearch container

---

## PHASE 6 — RAG ASSISTANT

**Goal:** Provide a conversational AI assistant grounded in the platform's document corpus.

**Scope:**
- LlamaIndex for retrieval-augmented generation
- OpenAI API (GPT-4o or GPT-4o-mini) for generation
- Conversation history persistence
- Source citation in every response

**Key Decisions:**
- Use Qdrant as LlamaIndex vector store (built-in connector)
- Store conversation threads per user in PostgreSQL
- Citations include: document title, source URL, chunk excerpt
- Stream responses via SSE (Server-Sent Events) for better UX

**Deliverables:**
- `POST /assistant/chat` — send message, get streamed response + citations
- `GET /assistant/history` — conversation history
- `DELETE /assistant/history/:threadId` — clear thread
- Prisma models: `ConversationThread`, `Message`
- Frontend: chat UI with message bubbles, citation cards, history panel

---

## PHASE 7 — ANALYTICS DASHBOARD

**Goal:** Provide executive-level insights over the document corpus: trends, topics, risks.

**Scope:**
- Corpus statistics (document count, source distribution, language distribution)
- Topic modeling using BERTopic
- Trend detection over time (volume, sentiment, keyword frequency)
- Risk indicators (sensitivity scoring)
- Executive dashboard per role

**Key Decisions:**
- BERTopic runs as a scheduled batch job (nightly or on-demand)
- Topics stored in PostgreSQL; visualized with Recharts
- Decision Maker dashboard is the primary consumer of this phase

**Deliverables:**
- `GET /analytics/corpus` — aggregate stats
- `GET /analytics/topics` — topic model results
- `GET /analytics/trends` — time-series data
- `GET /analytics/risks` — risk-scored documents
- Prisma models: `TopicModel`, `TopicDocument`
- Frontend: Decision Maker dashboard fully implemented with Recharts

---

## CROSS-CUTTING CONCERNS (All Phases)

| Concern | Action |
|---------|--------|
| Swagger/OpenAPI | Add `@nestjs/swagger` — Phase 2 start |
| Rate limiting | Add `@nestjs/throttler` — Phase 2 start |
| Structured logging | Configure Winston in NestJS — Phase 2 start |
| Error handling | Global exception filter in NestJS — Phase 2 start |
| Tests | Write unit + integration tests per phase |
| CI/CD | GitHub Actions pipeline — after Phase 3 |
| Secrets management | Move secrets to `.env` files, out of docker-compose — Phase 2 start |

---

## TIMELINE ESTIMATE

| Phase | Complexity | Estimated Duration |
|-------|-----------|-------------------|
| Phase 2 — Generic Scraper | Medium | 1–2 weeks |
| Phase 3 — Document Ingestion | Medium | 1 week |
| Phase 4 — NLP Pipeline | High | 1–2 weeks |
| Phase 5 — Semantic Search | High | 1–2 weeks |
| Phase 6 — RAG Assistant | Very High | 2–3 weeks |
| Phase 7 — Analytics | High | 1–2 weeks |
| **Total** | | **~8–12 weeks** |

---

## DEPENDENCY GRAPH

```
Phase 2 (Scraper) ──┐
Phase 3 (Docs)   ───┤──► Phase 4 (NLP) ──► Phase 5 (Search) ──► Phase 6 (RAG)
                    │                                                    │
                    └────────────────────────────────────────────────────┴──► Phase 7 (Analytics)
```

Phases 2 and 3 can be developed in parallel. Phase 4 requires both as inputs. Phases 5, 6, 7 depend on Phase 4.
