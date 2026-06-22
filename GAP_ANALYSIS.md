# GAP ANALYSIS — PFE Platform

**Date:** 2026-06-04  
**Analyst:** Senior Software Architect  
**Methodology:** Full repository inspection (backend, frontend, AI service, migrations, Docker config)

---

## 1. COMPLETED FEATURES

### Sprint 1 — Authentication & User Management ✅
| Feature | Status | Notes |
|---------|--------|-------|
| JWT authentication (access + refresh tokens) | Complete | 15min access / 7d refresh |
| bcrypt password hashing | Complete | salt=10 |
| Role-based access control (ADMIN / EXPERT / DECISION_MAKER) | Complete | RolesGuard + decorator pattern |
| User CRUD (ADMIN only) | Complete | Create, list, get, update, delete |
| Refresh token rotation | Complete | Stored hashed in DB |
| Activity logging (login, logout, user/job actions) | Complete | Fire-and-forget pattern |
| Admin user management UI | Complete | Table + create/toggle/delete modals |
| Admin activity logs UI | Complete | Filter, search, pagination |
| Role-based login redirect | Complete | Per-role dashboard routing |

### Sprint 2 — Web Scraping (CoinMarketCap) ✅
| Feature | Status | Notes |
|---------|--------|-------|
| Playwright browser automation | Complete | Headless Chromium, Docker-compatible |
| CoinMarketCap scraper (pages 1–3) | Complete | rank, price, marketCap, volume24h, %change, supply |
| APScheduler background jobs | Complete | BackgroundScheduler, CONTINUOUS mode |
| ONE_TIME / CONTINUOUS job modes | Complete | Interval in seconds |
| Job status machine (ACTIVE / PAUSED / COMPLETED / FAILED) | Complete | Pause, resume, stop |
| Job persistence (PostgreSQL via Prisma) | Complete | ScrapingJob + ScrapingResult models |
| Scheduler hot-reload on restart | Complete | Reloads ACTIVE CONTINUOUS jobs at startup |
| Expert scraping wizard (3-step modal) | Complete | Coin selection, attributes, mode/interval |
| Jobs dashboard (list, pause/resume/delete) | Complete | Expert role |
| Results visualization (Chart.js + table) | Complete | Filter by coin, date range |
| NestJS ↔ FastAPI HTTP bridge | Complete | POST /scraper/run |
| PostgreSQL adapter for Prisma | Complete | @prisma/adapter-pg |

---

## 2. PARTIALLY IMPLEMENTED FEATURES

### Decision Maker Dashboard ⚠️
- **What exists:** Placeholder page with hardcoded zero-value stat cards, empty layout.
- **What's missing:** All meaningful content — charts, insights, analytics, risk indicators.
- **Impact:** The entire DECISION_MAKER role has no functional UI.

### Market Data Page ⚠️
- **What exists:** A read-only ResultsPanel reused from the Expert view.
- **What's missing:** Role-based filtering, data enrichment, trend indicators.
- **Impact:** Functionally redundant with the Expert view.

### Swagger / OpenAPI Documentation ⚠️
- **What exists:** NestJS project but no `@nestjs/swagger` is installed or configured.
- **What's missing:** API documentation, decorators, setup in `main.ts`.
- **Impact:** No auto-generated API docs for collaborators or consumers.

### Tests ⚠️
- **What exists:** Spec files created for all NestJS modules (`.spec.ts`).
- **What's missing:** Actual test bodies — all tests are empty scaffolds (`it('should be defined')`).
- **Impact:** Zero test coverage.

---

## 3. MISSING FEATURES (By Phase)

### Phase 2 — Generic URL Scraper ❌
| Gap | Detail |
|-----|--------|
| Generic `scrape_url(url)` function | Scraper is 100% hardcoded to CoinMarketCap DOM selectors |
| URL validation | No URL input validation |
| Generic content extraction (title, meta, H1-H6, text) | Not implemented |
| Text cleaning pipeline | Not implemented |
| New Prisma models: ScrapingJob (url-based) + ScrapedDocument | Not implemented — current models are coin-specific |
| NestJS endpoints: POST/GET/DELETE /scraping-jobs | Partially exists but schema is wrong (targetCoins/attributes instead of url) |
| FastAPI endpoints: POST /scrape, POST /scrape/run-job | Not implemented |
| Frontend: URL Submission Page | Not implemented |
| Frontend: Generic Jobs Dashboard | Exists but coupled to CoinMarketCap domain |
| Frontend: Document Viewer | Not implemented |

### Phase 3 — Document Ingestion ❌
| Gap | Detail |
|-----|--------|
| File upload endpoint (PDF, DOCX, PPTX, XLSX, TXT) | Not implemented |
| Apache Tika integration | Not implemented |
| Tesseract OCR for scanned PDFs | Not implemented |
| Document text extraction pipeline | Not implemented |
| Document metadata storage | Not implemented (no Prisma model) |
| Frontend upload UI | Not implemented |

### Phase 4 — NLP Pipeline ❌
| Gap | Detail |
|-----|--------|
| Automatic summarization (US11) | Not implemented |
| Named Entity Recognition (US12) | Not implemented |
| Metadata extraction (US13) | Not implemented |
| spaCy integration | Not installed |
| HuggingFace Transformers integration | Not installed |
| NLP result storage models | No Prisma models |
| NLP API endpoints | Not implemented |
| Frontend NLP result display | Not implemented |

### Phase 5 — Semantic Search ❌
| Gap | Detail |
|-----|--------|
| Sentence embeddings generation | Not implemented |
| Qdrant vector database setup | Not in Docker Compose |
| Elasticsearch setup | Not in Docker Compose |
| Hybrid search (semantic + keyword) | Not implemented |
| Search filter API (date, source, type, sensitivity) | Not implemented |
| Search UI | Not implemented |

### Phase 6 — RAG Assistant ❌
| Gap | Detail |
|-----|--------|
| LlamaIndex integration | Not installed |
| OpenAI API integration | Not installed |
| RAG pipeline (retrieve + generate) | Not implemented |
| Source citation system | Not implemented |
| Conversation history storage | No Prisma model |
| Chat UI | Not implemented |

### Phase 7 — Analytics Dashboard ❌
| Gap | Detail |
|-----|--------|
| Corpus statistics (US17) | Not implemented |
| Document distribution (US18) | Not implemented |
| Topic analysis — BERTopic (US19) | Not implemented |
| Trend detection (US20) | Not implemented |
| Risk indicators (US21) | Not implemented |
| Executive dashboards (US22-US24) | Not implemented |
| Recharts integration | Not installed |

---

## 4. TECHNICAL DEBT

| Item | Severity | Description |
|------|----------|-------------|
| Hardcoded CoinMarketCap selectors | HIGH | `scraper.py` uses DOM selectors specific to CoinMarketCap. Any site change breaks the scraper. |
| No URL validation in scraper | HIGH | No input sanitization on `target_coins` before Playwright requests |
| CORS wildcard in production | MEDIUM | `app.enableCors()` with no origin restriction — acceptable for dev, dangerous in prod |
| No rate limiting | MEDIUM | No throttling guard on any NestJS endpoint |
| Secrets in docker-compose.yml | MEDIUM | `JWT_REFRESH_SECRET` and database passwords are hardcoded in compose file |
| Empty test suites | MEDIUM | All `.spec.ts` files exist but contain zero meaningful assertions |
| No error boundary in frontend | LOW | No React error boundaries — unhandled exceptions crash the whole page |
| localStorage for JWT storage | LOW | Tokens stored in `localStorage` are vulnerable to XSS — consider HttpOnly cookies |
| No Swagger/OpenAPI | LOW | No auto-generated API documentation |
| Prisma client re-instantiation risk | LOW | `new PrismaClient()` pattern with adapter; ensure connection pool limits are set |
| `any` type usage in frontend | LOW | Several `any` casts in component files |

---

## 5. ARCHITECTURE ASSESSMENT

### Strengths
- Clean module separation in NestJS (auth, users, scraping, activity-logs)
- Prisma provides type-safe database access with migration support
- APScheduler integration is solid with hot-reload pattern
- Docker Compose orchestrates all services cleanly
- Role-based access is consistently enforced at guard level

### Risks
- The AI microservice (FastAPI) is tightly coupled to the CoinMarketCap domain
- No message queue between NestJS and FastAPI — direct HTTP calls will fail silently under load
- No logging/observability stack (no Winston config, no Prometheus, no structured logs in FastAPI)
- No CI/CD pipeline

---

## 6. DEPENDENCY AUDIT

### Backend — Missing for Future Phases
- `@nestjs/swagger` + `swagger-ui-express` — API docs
- `multer` + `@types/multer` — file uploads
- Rate limiting: `@nestjs/throttler`

### AI Service — Missing for Future Phases
- `spacy` + `fr_core_news_sm` / `en_core_web_sm` models
- `transformers` (HuggingFace)
- `llama-index` / `llama-index-core`
- `openai`
- `qdrant-client`
- `elasticsearch`
- `bertopic`
- `python-docx`, `python-pptx`, `openpyxl`, `pypdf2`
- `pytesseract`, `pillow`
- `tika`

### Frontend — Missing for Future Phases
- `recharts` — analytics charts
- `@tanstack/react-query` — recommended for data fetching
- File upload component library

---

## SUMMARY SCORECARD

| Phase | Completion |
|-------|-----------|
| Sprint 1 — Auth & User Management | 100% |
| Sprint 2 — CoinMarketCap Scraper | 95% (Swagger/tests missing) |
| Phase 2 — Generic URL Scraper | 0% |
| Phase 3 — Document Ingestion | 0% |
| Phase 4 — NLP Pipeline | 0% |
| Phase 5 — Semantic Search | 0% |
| Phase 6 — RAG Assistant | 0% |
| Phase 7 — Analytics Dashboard | 0% |
| **Overall** | **~20%** |
