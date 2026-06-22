'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { fetchWithAuth } from '@/lib/apiClient';
import {
  Globe,
  Trash2,
  FileText,
  RefreshCw,
  Plus,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
} from 'lucide-react';

type JobStatus = 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'FAILED';

interface Job {
  id: number;
  name: string | null;
  url: string;
  mode: string;
  status: JobStatus;
  lastRunAt: string | null;
  createdAt: string;
  intervalSeconds: number | null;
  createdBy: { email: string };
  _count: { documents: number };
}

const STATUS_CONFIG: Record<JobStatus, { label: string; classes: string; Icon: typeof CheckCircle2 }> = {
  ACTIVE: { label: 'Active', classes: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20', Icon: CheckCircle2 },
  COMPLETED: { label: 'Completed', classes: 'text-sky-400 bg-sky-500/10 border-sky-500/20', Icon: CheckCircle2 },
  PAUSED: { label: 'Paused', classes: 'text-amber-400 bg-amber-500/10 border-amber-500/20', Icon: Clock },
  FAILED: { label: 'Failed', classes: 'text-red-400 bg-red-500/10 border-red-500/20', Icon: XCircle },
};

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function truncate(s: string, n = 55) {
  return s.length > n ? s.slice(0, n) + '…' : s;
}

export default function UrlJobsPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const loadJobs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth('/scraping-jobs');
      if (res.ok) setJobs(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this job and all its documents?')) return;
    setDeletingId(id);
    try {
      await fetchWithAuth(`/scraping-jobs/${id}`, { method: 'DELETE' });
      setJobs((prev) => prev.filter((j) => j.id !== id));
    } finally {
      setDeletingId(null);
    }
  };

  const active = jobs.filter((j) => j.status === 'ACTIVE').length;
  const totalDocs = jobs.reduce((s, j) => s + j._count.documents, 0);

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">URL Scraping Jobs</h1>
          <p className="text-neutral-400 mt-1">Manage your scheduled and one-time scraping jobs.</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={loadJobs}
            className="flex items-center gap-2 px-4 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-xl transition-colors"
          >
            <RefreshCw size={16} />
            Refresh
          </button>
          <Link
            href="/expert/url-scraper"
            className="flex items-center gap-2 px-5 py-2.5 bg-teal-600 hover:bg-teal-500 text-white font-medium rounded-xl shadow-lg shadow-teal-500/20 transition-all hover:scale-105"
          >
            <Plus size={18} />
            New Job
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-neutral-900/60 border border-white/10 rounded-2xl p-5">
          <p className="text-sm text-neutral-400">Total Jobs</p>
          <p className="text-3xl font-bold text-white mt-1">{jobs.length}</p>
        </div>
        <div className="bg-neutral-900/60 border border-white/10 rounded-2xl p-5">
          <p className="text-sm text-neutral-400">Active Jobs</p>
          <p className="text-3xl font-bold text-teal-400 mt-1">{active}</p>
        </div>
        <div className="bg-neutral-900/60 border border-white/10 rounded-2xl p-5">
          <p className="text-sm text-neutral-400">Documents Scraped</p>
          <p className="text-3xl font-bold text-indigo-400 mt-1">{totalDocs.toLocaleString()}</p>
        </div>
      </div>

      {/* Jobs table */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-neutral-500">
          <Loader2 size={24} className="animate-spin mr-2" />
          Loading jobs…
        </div>
      ) : jobs.length === 0 ? (
        <div className="text-center py-16 space-y-4">
          <Globe size={40} className="mx-auto text-neutral-600" />
          <p className="text-neutral-400">No URL scraping jobs yet.</p>
          <Link
            href="/expert/url-scraper"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-teal-600 hover:bg-teal-500 text-white rounded-xl transition-colors"
          >
            <Plus size={16} />
            Create your first job
          </Link>
        </div>
      ) : (
        <div className="bg-neutral-900/60 border border-white/10 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-neutral-400 text-left">
                <th className="px-5 py-3 font-medium">Job</th>
                <th className="px-5 py-3 font-medium">Mode</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Docs</th>
                <th className="px-5 py-3 font-medium">Last Run</th>
                <th className="px-5 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job, i) => {
                const cfg = STATUS_CONFIG[job.status] ?? STATUS_CONFIG.FAILED;
                const StatusIcon = cfg.Icon;
                return (
                  <tr
                    key={job.id}
                    className={`border-b border-white/5 hover:bg-white/5 transition-colors ${
                      i === jobs.length - 1 ? 'border-0' : ''
                    }`}
                  >
                    <td className="px-5 py-4">
                      <p className="text-white font-medium">{job.name || `Job #${job.id}`}</p>
                      <a
                        href={job.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-neutral-500 hover:text-teal-400 transition-colors text-xs mt-0.5 block"
                        title={job.url}
                      >
                        {truncate(job.url)}
                      </a>
                    </td>
                    <td className="px-5 py-4 text-neutral-400">
                      {job.mode === 'ONE_TIME' ? 'One-time' : `Every ${job.intervalSeconds}s`}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${cfg.classes}`}
                      >
                        <StatusIcon size={12} />
                        {cfg.label}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-neutral-300">{job._count.documents}</td>
                    <td className="px-5 py-4 text-neutral-400">{fmtDate(job.lastRunAt)}</td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/expert/url-jobs/${job.id}/documents`}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors text-xs"
                        >
                          <FileText size={13} />
                          Docs
                        </Link>
                        <button
                          onClick={() => handleDelete(job.id)}
                          disabled={deletingId === job.id}
                          className="p-1.5 rounded-lg text-neutral-500 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40"
                        >
                          {deletingId === job.id ? (
                            <Loader2 size={15} className="animate-spin" />
                          ) : (
                            <Trash2 size={15} />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
