'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { fetchWithAuth } from '@/lib/apiClient';
import {
  Search,
  FileText,
  Globe,
  Loader2,
  SlidersHorizontal,
  ExternalLink,
} from 'lucide-react';

interface SearchResult {
  doc_id: number;
  type: 'uploaded' | 'scraped';
  title: string;
  snippet: string;
  filename: string;
  url: string;
  score: number;
}

const TYPE_OPTIONS = [
  { value: 'all',      label: 'All documents' },
  { value: 'uploaded', label: 'Uploaded files' },
  { value: 'scraped',  label: 'Scraped pages'  },
];

function ScoreBar({ score }: { score: number }) {
  const pct = Math.min(100, Math.round(score * 100));
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-1.5 bg-neutral-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-teal-500 rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[11px] text-neutral-500">{score.toFixed(3)}</span>
    </div>
  );
}

function TypeBadge({ type }: { type: string }) {
  return type === 'uploaded' ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-900/50 text-blue-300 border border-blue-700/30 text-[11px] font-medium">
      <FileText size={10} />
      Uploaded
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-900/50 text-purple-300 border border-purple-700/30 text-[11px] font-medium">
      <Globe size={10} />
      Scraped
    </span>
  );
}

export default function SearchPage() {
  const [query, setQuery]     = useState('');
  const [type, setType]       = useState('all');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = async (q: string, t: string) => {
    if (!q.trim()) { setResults([]); setSearched(false); return; }
    setLoading(true);
    setSearched(true);
    try {
      const params = new URLSearchParams({ q: q.trim(), limit: '15', type: t });
      const res = await fetchWithAuth(`/search?${params}`);
      if (res.ok) {
        const data = await res.json();
        setResults(data.results ?? []);
      }
    } catch { setResults([]); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(query, type), 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, type]);

  const docLink = (r: SearchResult) =>
    r.type === 'uploaded'
      ? `/expert/library/${r.doc_id}`
      : `/expert/documents/${r.doc_id}`;

  return (
    <div className="max-w-3xl space-y-6 animate-in fade-in duration-300">
      <div>
        <h1 className="text-3xl font-bold text-white">Semantic Search</h1>
        <p className="text-neutral-400 mt-1 text-sm">
          Hybrid dense + sparse search across all uploaded documents and scraped pages.
        </p>
      </div>

      {/* Search bar */}
      <div className="bg-neutral-900/60 border border-white/10 rounded-2xl p-4 space-y-3">
        <div className="relative">
          <Search
            size={18}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by meaning, topic, keywords…"
            className="w-full bg-neutral-800 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white placeholder-neutral-500 text-sm focus:outline-none focus:border-teal-500/50 transition-colors"
            autoFocus
          />
          {loading && (
            <Loader2
              size={16}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-teal-400 animate-spin"
            />
          )}
        </div>

        {/* Type filter */}
        <div className="flex items-center gap-2">
          <SlidersHorizontal size={13} className="text-neutral-500" />
          <div className="flex gap-1.5">
            {TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setType(opt.value)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                  type === opt.value
                    ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30'
                    : 'text-neutral-400 hover:text-white hover:bg-neutral-800 border border-transparent'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Results */}
      {searched && !loading && results.length === 0 && (
        <div className="text-center py-16 space-y-2">
          <Search size={36} className="mx-auto text-neutral-700" />
          <p className="text-neutral-400 text-sm">No results found.</p>
          <p className="text-neutral-600 text-xs">
            Try different keywords, or upload / scrape more documents.
          </p>
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs text-neutral-500 px-1">
            {results.length} result{results.length !== 1 ? 's' : ''}
          </p>
          {results.map((r, i) => (
            <Link
              key={`${r.type}-${r.doc_id}-${i}`}
              href={docLink(r)}
              className="block bg-neutral-900/60 border border-white/10 hover:border-teal-500/30 rounded-2xl p-5 transition-all hover:bg-neutral-900/80 group space-y-3"
            >
              {/* Header */}
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

              {/* Snippet */}
              {r.snippet && (
                <p className="text-neutral-400 text-xs leading-relaxed line-clamp-3">
                  {r.snippet}
                </p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
