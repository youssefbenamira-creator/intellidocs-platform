'use client';

import { Pause, Play, Trash2, Loader2 } from 'lucide-react';
import { fetchWithAuth } from '@/lib/apiClient';
import { useState } from 'react';

interface Job {
  id: number;
  name: string | null;
  targetCoins: string[];
  attributes: string[];
  mode: string;
  intervalSeconds: number | null;
  status: string;
  lastRunAt: string | null;
  createdAt: string;
  createdBy: { email: string };
  _count: { results: number };
}

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  PAUSED: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  COMPLETED: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  FAILED: 'bg-red-500/20 text-red-400 border-red-500/30',
};

interface Props {
  jobs: Job[];
  onRefresh: () => void;
  onViewResults: (id: number) => void;
}

export default function JobsTable({ jobs, onRefresh, onViewResults }: Props) {
  const [actionId, setActionId] = useState<number | null>(null);

  const handlePause = async (id: number) => {
    setActionId(id);
    await fetchWithAuth(`/scraping/jobs/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'PAUSED' }),
    });
    onRefresh();
    setActionId(null);
  };

  const handleResume = async (id: number) => {
    setActionId(id);
    await fetchWithAuth(`/scraping/jobs/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'ACTIVE' }),
    });
    onRefresh();
    setActionId(null);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this scraping job and all its results?')) return;
    setActionId(id);
    await fetchWithAuth(`/scraping/jobs/${id}`, { method: 'DELETE' });
    onRefresh();
    setActionId(null);
  };

  if (jobs.length === 0) {
    return (
      <div className="text-center py-12 text-slate-500">
        <div className="text-4xl mb-3">🔍</div>
        No scraping jobs yet. Launch one to get started!
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-white/10">
      <table className="w-full text-left text-sm">
        <thead className="bg-white/5 border-b border-white/10 text-slate-400 uppercase text-xs tracking-wider">
          <tr>
            <th className="px-5 py-3">Job</th>
            <th className="px-5 py-3">Coins</th>
            <th className="px-5 py-3">Mode</th>
            <th className="px-5 py-3">Status</th>
            <th className="px-5 py-3">Results</th>
            <th className="px-5 py-3">Last Run</th>
            <th className="px-5 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map(job => (
            <tr key={job.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
              <td className="px-5 py-4">
                <div className="font-medium text-white">{job.name || `Job #${job.id}`}</div>
                <div className="text-xs text-slate-500 mt-0.5">{job.createdBy.email}</div>
              </td>
              <td className="px-5 py-4">
                <div className="flex flex-wrap gap-1">
                  {job.targetCoins.slice(0, 3).map(c => (
                    <span key={c} className="px-2 py-0.5 bg-slate-800 text-slate-300 rounded text-xs">{c}</span>
                  ))}
                  {job.targetCoins.length > 3 && (
                    <span className="px-2 py-0.5 bg-slate-800 text-slate-500 rounded text-xs">+{job.targetCoins.length - 3}</span>
                  )}
                </div>
              </td>
              <td className="px-5 py-4 text-slate-300">
                {job.mode === 'ONE_TIME' ? '⚡ One-Time' : `🔄 ${job.intervalSeconds! >= 60 ? job.intervalSeconds! / 60 + 'm' : job.intervalSeconds + 's'}`}
              </td>
              <td className="px-5 py-4">
                <span className={`px-2.5 py-1 text-xs font-bold rounded-full border ${STATUS_STYLES[job.status] || ''}`}>
                  {job.status}
                </span>
              </td>
              <td className="px-5 py-4 text-slate-300">{job._count.results.toLocaleString()}</td>
              <td className="px-5 py-4 text-slate-400 text-xs">
                {job.lastRunAt ? new Date(job.lastRunAt).toLocaleString() : '—'}
              </td>
              <td className="px-5 py-4 text-right">
                <div className="flex items-center justify-end gap-2">
                  {actionId === job.id ? (
                    <Loader2 size={16} className="animate-spin text-slate-400" />
                  ) : (
                    <>
                      {job.mode === 'CONTINUOUS' && job.status === 'ACTIVE' && (
                        <button onClick={() => handlePause(job.id)} title="Pause" className="p-1.5 rounded-lg hover:bg-yellow-500/10 text-slate-400 hover:text-yellow-400 transition-colors">
                          <Pause size={15} />
                        </button>
                      )}
                      {job.mode === 'CONTINUOUS' && job.status === 'PAUSED' && (
                        <button onClick={() => handleResume(job.id)} title="Resume" className="p-1.5 rounded-lg hover:bg-emerald-500/10 text-slate-400 hover:text-emerald-400 transition-colors">
                          <Play size={15} />
                        </button>
                      )}
                      <button onClick={() => handleDelete(job.id)} title="Delete" className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-400 hover:text-red-400 transition-colors">
                        <Trash2 size={15} />
                      </button>
                      <button 
                        onClick={() => onViewResults(job.id)} 
                        title="View Results" 
                        className="ml-2 px-3 py-1 bg-teal-500/20 text-teal-400 text-xs font-medium rounded hover:bg-teal-500/30 transition"
                      >
                        Results →
                      </button>
                    </>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
