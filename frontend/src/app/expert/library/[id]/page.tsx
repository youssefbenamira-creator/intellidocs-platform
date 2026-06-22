'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { fetchWithAuth } from '@/lib/apiClient';
import DocumentTables, { DocTable } from '@/components/DocumentTables';
import {
  ArrowLeft,
  FileText,
  User,
  Calendar,
  Hash,
  Globe,
  Loader2,
  Sparkles,
  Tag,
  BookOpen,
} from 'lucide-react';

interface Entity {
  text: string;
  label: string;
  start: number;
  end: number;
}

interface Doc {
  id: number;
  filename: string;
  mimeType: string;
  fileSize: number;
  extractedText: string;
  title: string | null;
  author: string | null;
  pageCount: number | null;
  language: string | null;
  summary: string | null;
  entities: Entity[] | null;
  keywords: string[];
  tables: DocTable[] | null;
  uploadedAt: string;
  uploadedBy: { email: string };
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'short' });
}

function wordCount(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// Color palette for NER labels
const LABEL_STYLES: Record<string, string> = {
  PERSON:  'bg-blue-900/60 text-blue-300 border-blue-700/40',
  PER:     'bg-blue-900/60 text-blue-300 border-blue-700/40',
  ORG:     'bg-purple-900/60 text-purple-300 border-purple-700/40',
  GPE:     'bg-emerald-900/60 text-emerald-300 border-emerald-700/40',
  LOC:     'bg-emerald-900/60 text-emerald-300 border-emerald-700/40',
  DATE:    'bg-yellow-900/60 text-yellow-300 border-yellow-700/40',
  TIME:    'bg-yellow-900/60 text-yellow-300 border-yellow-700/40',
  MONEY:   'bg-orange-900/60 text-orange-300 border-orange-700/40',
  PERCENT: 'bg-orange-900/60 text-orange-300 border-orange-700/40',
  NORP:    'bg-pink-900/60 text-pink-300 border-pink-700/40',
  MISC:    'bg-sky-900/60 text-sky-300 border-sky-700/40',
};
const LABEL_DEFAULT = 'bg-neutral-800 text-neutral-300 border-neutral-700/40';

const LABEL_NAMES: Record<string, string> = {
  PERSON: 'People',    PER:     'People',
  ORG:    'Orgs',      GPE:     'Places',
  LOC:    'Locations', DATE:    'Dates',
  TIME:   'Times',     MONEY:   'Money',
  PERCENT:'Percent',   NORP:    'Groups',
  MISC:   'Misc',
};

function groupEntities(entities: Entity[]): Record<string, string[]> {
  const groups: Record<string, string[]> = {};
  for (const ent of entities) {
    const label = ent.label;
    if (!groups[label]) groups[label] = [];
    if (!groups[label].includes(ent.text)) {
      groups[label].push(ent.text);
    }
  }
  return groups;
}

export default function DocumentViewerPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [doc, setDoc] = useState<Doc | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchWithAuth(`/documents/${id}`);
      if (!res.ok) { setError('Document not found.'); return; }
      setDoc(await res.json());
    } catch {
      setError('Failed to load document.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-neutral-500">
        <Loader2 size={24} className="animate-spin mr-2" />
        Loading document…
      </div>
    );
  }

  if (error || !doc) {
    return (
      <div className="text-center py-24 space-y-4">
        <FileText size={40} className="mx-auto text-neutral-600" />
        <p className="text-red-400">{error || 'Document not found.'}</p>
        <button onClick={() => router.back()} className="text-teal-400 hover:underline text-sm">
          ← Go back
        </button>
      </div>
    );
  }

  const entityGroups = groupEntities(doc.entities ?? []);
  const hasNlp = doc.summary || (doc.entities && doc.entities.length > 0) || doc.keywords?.length > 0;

  return (
    <div className="max-w-4xl space-y-8 animate-in fade-in duration-300">
      {/* Back */}
      <button
        onClick={() => router.back()}
        className="inline-flex items-center gap-1.5 text-neutral-400 hover:text-white text-sm transition-colors"
      >
        <ArrowLeft size={16} />
        Back to library
      </button>

      {/* Meta card */}
      <div className="bg-neutral-900/60 border border-white/10 rounded-2xl p-6 space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-white leading-snug">
            {doc.title || doc.filename}
          </h1>
          {doc.title && (
            <p className="text-neutral-500 text-sm mt-0.5">{doc.filename}</p>
          )}
        </div>

        <div className="flex flex-wrap gap-4 text-sm text-neutral-400">
          {doc.author && (
            <span className="flex items-center gap-1.5">
              <User size={14} />
              {doc.author}
            </span>
          )}
          {doc.pageCount && (
            <span className="flex items-center gap-1.5">
              <Hash size={14} />
              {doc.pageCount} page{doc.pageCount !== 1 ? 's' : ''}
            </span>
          )}
          {doc.language && (
            <span className="flex items-center gap-1.5">
              <Globe size={14} />
              {doc.language}
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <Calendar size={14} />
            {fmtDate(doc.uploadedAt)}
          </span>
          <span className="flex items-center gap-1.5">
            <FileText size={14} />
            {formatBytes(doc.fileSize)} · {wordCount(doc.extractedText).toLocaleString()} words
          </span>
        </div>

        <p className="text-xs text-neutral-600">
          Uploaded by {doc.uploadedBy.email}
        </p>
      </div>

      {/* NLP insights */}
      {hasNlp && (
        <div className="bg-neutral-900/60 border border-white/10 rounded-2xl p-6 space-y-6">
          <h2 className="flex items-center gap-2 text-xs font-semibold text-neutral-500 uppercase tracking-widest">
            <Sparkles size={14} className="text-teal-400" />
            NLP Insights
          </h2>

          {/* Summary */}
          {doc.summary && (
            <div className="space-y-2">
              <h3 className="flex items-center gap-1.5 text-xs font-medium text-neutral-400 uppercase tracking-wider">
                <BookOpen size={12} />
                Summary
              </h3>
              <p className="text-neutral-300 text-sm leading-relaxed bg-neutral-800/50 rounded-xl p-4 border border-white/5">
                {doc.summary}
              </p>
            </div>
          )}

          {/* Keywords */}
          {doc.keywords?.length > 0 && (
            <div className="space-y-2">
              <h3 className="flex items-center gap-1.5 text-xs font-medium text-neutral-400 uppercase tracking-wider">
                <Tag size={12} />
                Keywords
              </h3>
              <div className="flex flex-wrap gap-2">
                {doc.keywords.map((kw) => (
                  <span
                    key={kw}
                    className="px-2.5 py-1 rounded-lg bg-teal-900/40 text-teal-300 border border-teal-700/30 text-xs"
                  >
                    {kw}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Named entities grouped by label */}
          {Object.keys(entityGroups).length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-medium text-neutral-400 uppercase tracking-wider">
                Named Entities
              </h3>
              <div className="space-y-3">
                {Object.entries(entityGroups).map(([label, values]) => (
                  <div key={label} className="flex flex-wrap items-start gap-2">
                    <span className="mt-0.5 text-[10px] font-semibold text-neutral-500 uppercase tracking-widest w-16 shrink-0 pt-1">
                      {LABEL_NAMES[label] ?? label}
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {values.slice(0, 30).map((val) => (
                        <span
                          key={val}
                          className={`px-2 py-0.5 rounded-md border text-xs ${LABEL_STYLES[label] ?? LABEL_DEFAULT}`}
                        >
                          {val}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Extracted tables (dynamic columns) */}
      <DocumentTables tables={doc.tables} />

      {/* Extracted text */}
      <div className="bg-neutral-900/60 border border-white/10 rounded-2xl p-6">
        <h2 className="text-xs font-semibold text-neutral-500 uppercase tracking-widest mb-4">
          Extracted Text
        </h2>
        {doc.extractedText ? (
          <pre className="whitespace-pre-wrap break-words font-sans text-neutral-300 text-sm leading-relaxed">
            {doc.extractedText}
          </pre>
        ) : (
          <p className="text-neutral-500 text-sm italic">
            No text could be extracted from this document.
          </p>
        )}
      </div>
    </div>
  );
}
