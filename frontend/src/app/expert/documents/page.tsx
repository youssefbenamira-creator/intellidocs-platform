'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { fetchWithAuth } from '@/lib/apiClient';
import {
  Search,
  FileText,
  FileSpreadsheet,
  Presentation,
  Globe,
  Loader2,
  SlidersHorizontal,
  ExternalLink,
  Plus,
  UploadCloud,
  Calendar,
  User,
  Hash,
  X,
  Users,
} from 'lucide-react';

// ---- Types ----

interface UploadedDoc {
  id: number;
  filename: string;
  mimeType: string;
  fileSize: number;
  title: string | null;
  author: string | null;
  pageCount: number | null;
  language: string | null;
  uploadedAt: string;
  uploadedBy: { email: string };
}

interface ScrapedDoc {
  id: number;
  url: string;
  title: string | null;
  description: string | null;
  content: string;
  scrapedAt: string;
  jobId: number;
  jobName: string | null;
}

interface SearchResult {
  doc_id: number;
  type: 'uploaded' | 'scraped';
  title: string;
  snippet: string;
  filename: string;
  url: string;
  score: number;
}

interface ScrapingJobSummary {
  id: number;
  name: string | null;
  _count: { documents: number };
}

interface ScrapingJobDetail {
  id: number;
  name: string | null;
  documents: Omit<ScrapedDoc, 'jobId' | 'jobName'>[];
}

type DocTypeFilter = 'all' | 'uploaded' | 'scraped';
type SortOrder = 'newest' | 'oldest';

// ---- Helper components ----

function TypeBadge({ type }: { type: 'uploaded' | 'scraped' }) {
  return type === 'uploaded' ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-900/50 text-blue-300 border border-blue-700/30 text-[11px] font-medium flex-shrink-0">
      <FileText size={10} />
      Uploaded
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-900/50 text-purple-300 border border-purple-700/30 text-[11px] font-medium flex-shrink-0">
      <Globe size={10} />
      Scraped
    </span>
  );
}

function ScoreBar({ score }: { score: number }) {
  const pct = Math.min(100, Math.round(score * 100));
  return (
    <div className="flex items-center gap-2 flex-shrink-0">
      <div className="w-16 h-1.5 bg-neutral-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-teal-500 rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[11px] text-neutral-500 tabular-nums w-9 text-right">{score.toFixed(3)}</span>
    </div>
  );
}

function getMimeIcon(mimeType: string) {
  if (mimeType === 'application/pdf') return { Icon: FileText, color: 'text-red-400' };
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel'))
    return { Icon: FileSpreadsheet, color: 'text-emerald-400' };
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint'))
    return { Icon: Presentation, color: 'text-orange-400' };
  return { Icon: FileText, color: 'text-sky-400' };
}

function getMimeLabel(mimeType: string) {
  if (mimeType === 'application/pdf') return 'PDF';
  if (mimeType.includes('wordprocessingml') || mimeType.includes('msword')) return 'DOCX';
  if (mimeType.includes('presentationml') || mimeType.includes('powerpoint')) return 'PPTX';
  if (mimeType.includes('spreadsheetml') || mimeType.includes('excel')) return 'XLSX';
  if (mimeType === 'text/plain') return 'TXT';
  return 'DOC';
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

function textPreview(text: string, n = 160) {
  return text.replace(/\s+/g, ' ').trim().slice(0, n) + (text.length > n ? '…' : '');
}

// ---- Page ----

interface SharedEntry {
  id: number;
  documentId: number;
  documentType: 'uploaded' | 'scraped';
  message?: string;
  createdAt: string;
  sharedBy: { email: string };
  document: {
    id: number; title?: string; filename?: string; url?: string;
    description?: string; mimeType?: string; fileSize?: number;
    uploadedAt?: string; scrapedAt?: string;
  } | null;
}

export default function DocumentsPage() {
  const [uploadedDocs, setUploadedDocs] = useState<UploadedDoc[]>([]);
  const [scrapedDocs, setScrapedDocs] = useState<ScrapedDoc[]>([]);
  const [loadingBrowse, setLoadingBrowse] = useState(true);
  const [sharedDocs, setSharedDocs] = useState<SharedEntry[]>([]);

  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<DocTypeFilter>('all');
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest');

  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [searched, setSearched] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSearchMode = query.trim() !== '';

  // ── Load all documents (browse mode) ──────────────────────────────────────

  const loadAll = useCallback(async () => {
    setLoadingBrowse(true);
    try {
      const [docsRes, jobsRes] = await Promise.all([
        fetchWithAuth('/documents'),
        fetchWithAuth('/scraping-jobs'),
      ]);

      const docs: UploadedDoc[] = docsRes.ok ? await docsRes.json() : [];
      const jobs: ScrapingJobSummary[] = jobsRes.ok ? await jobsRes.json() : [];
      setUploadedDocs(docs);

      const jobsWithDocs = jobs.filter((j) => j._count.documents > 0);
      if (jobsWithDocs.length === 0) {
        setScrapedDocs([]);
        return;
      }

      const details: (ScrapingJobDetail | null)[] = await Promise.all(
        jobsWithDocs.map((j) =>
          fetchWithAuth(`/scraping-jobs/${j.id}`).then((r) => (r.ok ? r.json() : null))
        )
      );

      const allScraped: ScrapedDoc[] = [];
      for (const detail of details) {
        if (detail?.documents) {
          for (const doc of detail.documents) {
            allScraped.push({ ...doc, jobId: detail.id, jobName: detail.name });
          }
        }
      }
      setScrapedDocs(allScraped);
    } finally {
      setLoadingBrowse(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    fetchWithAuth('/shares/received')
      .then(r => r.ok ? r.json() : [])
      .then(setSharedDocs)
      .catch(() => {});
  }, []);

  // ── Semantic search ────────────────────────────────────────────────────────

  const runSearch = async (q: string, t: DocTypeFilter) => {
    if (!q.trim()) {
      setSearchResults([]);
      setSearched(false);
      return;
    }
    setLoadingSearch(true);
    setSearched(true);
    try {
      const params = new URLSearchParams({ q: q.trim(), limit: '20', type: t });
      const res = await fetchWithAuth(`/search?${params}`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.results ?? []);
      }
    } catch {
      setSearchResults([]);
    } finally {
      setLoadingSearch(false);
    }
  };

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(query, typeFilter), 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, typeFilter]);

  // ── Merged + sorted list for browse mode ──────────────────────────────────

  type BrowseItem =
    | { kind: 'uploaded'; doc: UploadedDoc; date: number }
    | { kind: 'scraped'; doc: ScrapedDoc; date: number };

  const browseItems: BrowseItem[] = (() => {
    const items: BrowseItem[] = [];
    if (typeFilter !== 'scraped') {
      for (const doc of uploadedDocs)
        items.push({ kind: 'uploaded', doc, date: new Date(doc.uploadedAt).getTime() });
    }
    if (typeFilter !== 'uploaded') {
      for (const doc of scrapedDocs)
        items.push({ kind: 'scraped', doc, date: new Date(doc.scrapedAt).getTime() });
    }
    items.sort((a, b) => (sortOrder === 'newest' ? b.date - a.date : a.date - b.date));
    return items;
  })();

  const totalCount = uploadedDocs.length + scrapedDocs.length;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">Documents</h1>
          <p className="text-neutral-400 mt-1 text-sm">
            {loadingBrowse
              ? 'Loading…'
              : `${uploadedDocs.length} uploaded · ${scrapedDocs.length} scraped`}
          </p>
        </div>
        <div className="flex gap-2.5 flex-shrink-0">
          <Link
            href="/expert/url-scraper"
            className="flex items-center gap-2 px-4 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-xl transition-colors text-sm"
          >
            <Globe size={15} />
            New Scraping Job
          </Link>
          <Link
            href="/expert/upload"
            className="flex items-center gap-2 px-4 py-2.5 bg-teal-600 hover:bg-teal-500 text-white font-medium rounded-xl shadow-lg shadow-teal-500/20 transition-all hover:scale-105 text-sm"
          >
            <UploadCloud size={15} />
            Upload
          </Link>
        </div>
      </div>

      {/* ── Stats ── */}
      {!loadingBrowse && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-neutral-900/60 border border-white/10 rounded-2xl p-4">
            <p className="text-xs text-neutral-400">Total</p>
            <p className="text-2xl font-bold text-white mt-1">{totalCount}</p>
          </div>
          <div className="bg-neutral-900/60 border border-blue-500/10 rounded-2xl p-4">
            <p className="text-xs text-neutral-400">Uploaded files</p>
            <p className="text-2xl font-bold text-blue-400 mt-1">{uploadedDocs.length}</p>
          </div>
          <div className="bg-neutral-900/60 border border-purple-500/10 rounded-2xl p-4">
            <p className="text-xs text-neutral-400">Scraped pages</p>
            <p className="text-2xl font-bold text-purple-400 mt-1">{scrapedDocs.length}</p>
          </div>
        </div>
      )}

      {/* ── Search + Filters ── */}
      <div className="bg-neutral-900/60 border border-white/10 rounded-2xl p-4 space-y-3">
        {/* Search input */}
        <div className="relative">
          <Search
            size={17}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by meaning, topic, or keywords…"
            className="w-full bg-neutral-800 border border-white/10 rounded-xl pl-10 pr-10 py-3 text-white placeholder-neutral-500 text-sm focus:outline-none focus:border-teal-500/50 transition-colors"
          />
          {loadingSearch && (
            <Loader2
              size={15}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-teal-400 animate-spin"
            />
          )}
          {query && !loadingSearch && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-white transition-colors"
            >
              <X size={15} />
            </button>
          )}
        </div>

        {/* Filter row */}
        <div className="flex items-center justify-between gap-3">
          {/* Type filter */}
          <div className="flex items-center gap-2">
            <SlidersHorizontal size={13} className="text-neutral-500 flex-shrink-0" />
            <div className="flex gap-1.5">
              {(
                [
                  { value: 'all', label: 'All' },
                  { value: 'uploaded', label: 'Uploaded' },
                  { value: 'scraped', label: 'Scraped' },
                ] as const
              ).map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => setTypeFilter(value)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                    typeFilter === value
                      ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30'
                      : 'text-neutral-400 hover:text-white hover:bg-neutral-800 border border-transparent'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Sort (browse mode only) / search indicator */}
          {isSearchMode ? (
            <span className="text-xs text-teal-600 flex items-center gap-1.5">
              <Search size={11} />
              Semantic search
            </span>
          ) : (
            <div className="flex gap-1.5">
              {(
                [
                  { value: 'newest', label: 'Newest' },
                  { value: 'oldest', label: 'Oldest' },
                ] as const
              ).map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => setSortOrder(value)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                    sortOrder === value
                      ? 'bg-neutral-700 text-white border border-neutral-600'
                      : 'text-neutral-500 hover:text-white hover:bg-neutral-800 border border-transparent'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Results ── */}

      {isSearchMode ? (
        /* Search results */
        loadingSearch ? (
          <div className="flex items-center justify-center py-16 text-neutral-500">
            <Loader2 size={22} className="animate-spin mr-2" />
            Searching…
          </div>
        ) : searched && searchResults.length === 0 ? (
          <div className="text-center py-16 space-y-2">
            <Search size={36} className="mx-auto text-neutral-700" />
            <p className="text-neutral-400 text-sm">No results found.</p>
            <p className="text-neutral-600 text-xs">
              Try different keywords, or upload / scrape more documents.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {searchResults.length > 0 && (
              <p className="text-xs text-neutral-500 px-1">
                {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
              </p>
            )}
            {searchResults.map((r, i) => (
              <Link
                key={`${r.type}-${r.doc_id}-${i}`}
                href={
                  r.type === 'uploaded'
                    ? `/expert/library/${r.doc_id}`
                    : `/expert/documents/${r.doc_id}`
                }
                className="block bg-neutral-900/60 border border-white/10 hover:border-teal-500/30 rounded-2xl p-5 transition-all hover:bg-neutral-900/80 group space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <TypeBadge type={r.type} />
                      <p className="text-white font-medium text-sm truncate group-hover:text-teal-300 transition-colors">
                        {r.title || r.filename || 'Untitled'}
                      </p>
                    </div>
                    {r.type === 'scraped' && r.url && (
                      <p className="text-teal-600 text-xs truncate flex items-center gap-1">
                        <ExternalLink size={10} />
                        {r.url}
                      </p>
                    )}
                    {r.type === 'uploaded' && r.filename && r.filename !== r.title && (
                      <p className="text-neutral-600 text-xs">{r.filename}</p>
                    )}
                  </div>
                  <ScoreBar score={r.score} />
                </div>
                {r.snippet && (
                  <p className="text-neutral-400 text-xs leading-relaxed line-clamp-3">
                    {r.snippet}
                  </p>
                )}
              </Link>
            ))}
          </div>
        )
      ) : (
        /* Browse mode */
        loadingBrowse ? (
          <div className="flex items-center justify-center py-20 text-neutral-500">
            <Loader2 size={24} className="animate-spin mr-2" />
            Loading documents…
          </div>
        ) : browseItems.length === 0 ? (
          <div className="text-center py-20 space-y-4">
            <FileText size={44} className="mx-auto text-neutral-600" />
            <p className="text-neutral-400">No documents yet.</p>
            <div className="flex items-center justify-center gap-3">
              <Link
                href="/expert/upload"
                className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-xl transition-colors text-sm"
              >
                <Plus size={14} />
                Upload a document
              </Link>
              <Link
                href="/expert/url-scraper"
                className="inline-flex items-center gap-2 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-xl transition-colors text-sm"
              >
                <Globe size={14} />
                Create a scraping job
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-neutral-500 px-1">
              {browseItems.length} document{browseItems.length !== 1 ? 's' : ''}
            </p>
            {browseItems.map((item) => {
              if (item.kind === 'uploaded') {
                const doc = item.doc;
                const { Icon, color } = getMimeIcon(doc.mimeType);
                return (
                  <Link
                    key={`u-${doc.id}`}
                    href={`/expert/library/${doc.id}`}
                    className="flex items-center gap-4 bg-neutral-900/60 border border-white/10 hover:border-blue-500/30 rounded-2xl p-5 transition-all hover:bg-neutral-900/80 group"
                  >
                    <div
                      className={`flex-shrink-0 w-10 h-10 rounded-xl bg-neutral-800 flex items-center justify-center ${color}`}
                    >
                      <Icon size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <TypeBadge type="uploaded" />
                        <p className="text-white font-medium text-sm truncate group-hover:text-blue-300 transition-colors">
                          {doc.title || doc.filename}
                        </p>
                        <span className="text-[11px] px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400 font-mono flex-shrink-0">
                          {getMimeLabel(doc.mimeType)}
                        </span>
                      </div>
                      {doc.title && (
                        <p className="text-neutral-500 text-xs truncate mt-0.5">{doc.filename}</p>
                      )}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-xs text-neutral-500">
                        {doc.author && (
                          <span className="flex items-center gap-1">
                            <User size={11} />
                            {doc.author}
                          </span>
                        )}
                        {doc.pageCount && (
                          <span className="flex items-center gap-1">
                            <Hash size={11} />
                            {doc.pageCount}p
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Calendar size={11} />
                          {fmtDate(doc.uploadedAt)}
                        </span>
                        <span>{formatBytes(doc.fileSize)}</span>
                      </div>
                    </div>
                  </Link>
                );
              }

              const doc = item.doc;
              return (
                <Link
                  key={`s-${doc.id}`}
                  href={`/expert/documents/${doc.id}`}
                  className="flex items-start gap-4 bg-neutral-900/60 border border-white/10 hover:border-purple-500/30 rounded-2xl p-5 transition-all hover:bg-neutral-900/80 group"
                >
                  <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-neutral-800 flex items-center justify-center text-purple-400">
                    <Globe size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <TypeBadge type="scraped" />
                      <p className="text-white font-medium text-sm truncate group-hover:text-purple-300 transition-colors">
                        {doc.title || 'Untitled page'}
                      </p>
                    </div>
                    <p className="text-teal-600/80 text-xs truncate mt-0.5 flex items-center gap-1">
                      <ExternalLink size={10} />
                      {doc.url}
                    </p>
                    {(doc.description || doc.content) && (
                      <p className="text-neutral-500 text-xs mt-1 line-clamp-1">
                        {doc.description || textPreview(doc.content)}
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-xs text-neutral-500">
                      <span className="flex items-center gap-1">
                        <Calendar size={11} />
                        {fmtDate(doc.scrapedAt)}
                      </span>
                      {doc.jobName && (
                        <span className="text-neutral-600">via {doc.jobName}</span>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )
      )}

      {/* ── Shared with Me ── */}
      {!isSearchMode && sharedDocs.length > 0 && (
        <div className="space-y-3 pt-4">
          <div className="flex items-center gap-2 pb-1 border-b border-white/5">
            <Users size={15} className="text-amber-400" />
            <h2 className="text-sm font-semibold text-amber-400">Shared with Me</h2>
            <span className="text-xs text-neutral-500 ml-auto">
              {sharedDocs.length} document{sharedDocs.length !== 1 ? 's' : ''}
            </span>
          </div>
          {sharedDocs.map(s => {
            const doc   = s.document;
            const label = doc?.title || doc?.filename || doc?.url || `Document #${s.documentId}`;
            if (s.documentType === 'uploaded') {
              const { Icon, color } = getMimeIcon(doc?.mimeType || '');
              return (
                <Link
                  key={`sh-u-${s.id}`}
                  href={`/expert/library/${s.documentId}`}
                  className="flex items-center gap-4 bg-amber-950/20 border border-amber-500/20 hover:border-amber-400/40 rounded-2xl p-5 transition-all group"
                >
                  <div className={`flex-shrink-0 w-10 h-10 rounded-xl bg-neutral-800 flex items-center justify-center ${color}`}>
                    <Icon size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-900/50 text-amber-300 border border-amber-700/30 text-[11px] font-medium">
                        <Users size={9} /> Shared
                      </span>
                      <p className="text-white font-medium text-sm truncate group-hover:text-amber-300 transition-colors">
                        {label}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 mt-1.5 text-xs text-neutral-500">
                      <span>from {s.sharedBy.email}</span>
                      {doc?.uploadedAt && <span className="flex items-center gap-1"><Calendar size={11} />{fmtDate(doc.uploadedAt)}</span>}
                      {doc?.fileSize && <span>{formatBytes(doc.fileSize)}</span>}
                    </div>
                    {s.message && <p className="text-amber-600/80 text-xs mt-1 italic">"{s.message}"</p>}
                  </div>
                </Link>
              );
            }
            return (
              <Link
                key={`sh-s-${s.id}`}
                href={`/expert/documents/${s.documentId}`}
                className="flex items-start gap-4 bg-amber-950/20 border border-amber-500/20 hover:border-amber-400/40 rounded-2xl p-5 transition-all group"
              >
                <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-neutral-800 flex items-center justify-center text-amber-400">
                  <Globe size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-900/50 text-amber-300 border border-amber-700/30 text-[11px] font-medium">
                      <Users size={9} /> Shared
                    </span>
                    <p className="text-white font-medium text-sm truncate group-hover:text-amber-300 transition-colors">
                      {label}
                    </p>
                  </div>
                  {doc?.url && (
                    <p className="text-teal-600/80 text-xs truncate mt-0.5 flex items-center gap-1">
                      <ExternalLink size={10} />{doc.url}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-x-4 mt-1.5 text-xs text-neutral-500">
                    <span>from {s.sharedBy.email}</span>
                    {doc?.scrapedAt && <span className="flex items-center gap-1"><Calendar size={11} />{fmtDate(doc.scrapedAt)}</span>}
                  </div>
                  {s.message && <p className="text-amber-600/80 text-xs mt-1 italic">"{s.message}"</p>}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
