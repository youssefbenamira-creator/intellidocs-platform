'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { fetchWithAuth } from '@/lib/apiClient';
import {
  ArrowLeft,
  FileText,
  Globe,
  Calendar,
  Loader2,
  ExternalLink,
  ChevronRight,
} from 'lucide-react';

interface Document {
  id: number;
  url: string;
  title: string | null;
  description: string | null;
  content: string;
  scrapedAt: string;
}

interface JobDetail {
  id: number;
  name: string | null;
  url: string;
  status: string;
  documents: Document[];
  _count: { documents: number };
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function preview(text: string, n = 180) {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > n ? flat.slice(0, n) + '…' : flat;
}

export default function JobDocumentsPage() {
  const { id } = useParams<{ id: string }>();
  const [job, setJob] = useState<JobDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadJob = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchWithAuth(`/scraping-jobs/${id}`);
      if (!res.ok) {
        setError('Job not found or access denied.');
        return;
      }
      setJob(await res.json());
    } catch {
      setError('Failed to load job.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadJob();
  }, [loadJob]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-neutral-500">
        <Loader2 size={24} className="animate-spin mr-2" />
        Loading…
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="text-center py-24 space-y-4">
        <p className="text-red-400">{error || 'Job not found.'}</p>
        <Link href="/expert/url-jobs" className="text-teal-400 hover:underline text-sm">
          ← Back to jobs
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Back + header */}
      <div className="space-y-4">
        <Link
          href="/expert/url-jobs"
          className="inline-flex items-center gap-1.5 text-neutral-400 hover:text-white text-sm transition-colors"
        >
          <ArrowLeft size={16} />
          Back to jobs
        </Link>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">{job.name || `Job #${job.id}`}</h1>
            <a
              href={job.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-teal-400 hover:text-teal-300 text-sm mt-1 transition-colors"
            >
              <Globe size={14} />
              {job.url}
              <ExternalLink size={12} />
            </a>
          </div>
          <div className="text-right">
            <p className="text-neutral-400 text-sm">
              {job._count.documents} document{job._count.documents !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
      </div>

      {/* Documents */}
      {job.documents.length === 0 ? (
        <div className="text-center py-16 space-y-2">
          <FileText size={40} className="mx-auto text-neutral-600" />
          <p className="text-neutral-400">No documents scraped yet.</p>
          <p className="text-neutral-500 text-sm">
            The job is {job.status.toLowerCase()} — documents will appear after the next run.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {job.documents.map((doc) => (
            <Link
              key={doc.id}
              href={`/expert/documents/${doc.id}`}
              className="block bg-neutral-900/60 border border-white/10 hover:border-teal-500/30 rounded-2xl p-5 transition-all hover:bg-neutral-900/80 group"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0 space-y-1.5">
                  <p className="text-white font-medium truncate">
                    {doc.title || 'Untitled document'}
                  </p>
                  {doc.description && (
                    <p className="text-neutral-400 text-sm line-clamp-1">{doc.description}</p>
                  )}
                  <p className="text-neutral-500 text-sm line-clamp-2">{preview(doc.content)}</p>
                  <div className="flex items-center gap-4 text-xs text-neutral-500 pt-1">
                    <span className="flex items-center gap-1">
                      <Calendar size={12} />
                      {fmtDate(doc.scrapedAt)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Globe size={12} />
                      <span className="truncate max-w-[200px]">{doc.url}</span>
                    </span>
                  </div>
                </div>
                <ChevronRight
                  size={18}
                  className="text-neutral-600 group-hover:text-teal-400 flex-shrink-0 transition-colors mt-1"
                />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
