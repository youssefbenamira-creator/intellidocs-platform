'use client';

import { useState, useEffect, useCallback } from 'react';
import { fetchWithAuth } from '@/lib/apiClient';
import LaunchScrapingModal from './components/LaunchScrapingModal';
import JobsTable from './components/JobsTable';
import ResultsPanel from './components/ResultsPanel';
import { Zap, List, BarChart2 } from 'lucide-react';

type Tab = 'jobs' | 'results';

export default function ExpertDashboard() {
  const [tab, setTab] = useState<Tab>('jobs');
  const [showModal, setShowModal] = useState(false);
  const [jobs, setJobs] = useState<any[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);

  const loadJobs = useCallback(async () => {
    setLoadingJobs(true);
    try {
      const res = await fetchWithAuth('/scraping/jobs');
      if (res.ok) setJobs(await res.json());
    } finally {
      setLoadingJobs(false);
    }
  }, []);

  useEffect(() => { loadJobs(); }, [loadJobs]);

  const activeCount = jobs.filter(j => j.status === 'ACTIVE').length;
  const totalResults = jobs.reduce((sum, j) => sum + (j._count?.results ?? 0), 0);

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Web Scraping</h1>
          <p className="text-neutral-400 mt-1">Collect real-time cryptocurrency data from CoinMarketCap.</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-teal-600 hover:bg-teal-500 text-white font-medium rounded-xl shadow-lg shadow-teal-500/20 transition-all hover:scale-105 active:scale-95"
        >
          <Zap size={18} />
          Launch Scraping
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-neutral-900/60 border border-white/10 rounded-2xl p-5">
          <p className="text-sm text-neutral-400">Total Jobs</p>
          <p className="text-3xl font-bold text-white mt-1">{jobs.length}</p>
        </div>
        <div className="bg-neutral-900/60 border border-white/10 rounded-2xl p-5">
          <p className="text-sm text-neutral-400">Active Jobs</p>
          <p className="text-3xl font-bold text-teal-400 mt-1">{activeCount}</p>
        </div>
        <div className="bg-neutral-900/60 border border-white/10 rounded-2xl p-5">
          <p className="text-sm text-neutral-400">Data Points</p>
          <p className="text-3xl font-bold text-indigo-400 mt-1">{totalResults.toLocaleString()}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-neutral-900/60 border border-white/10 rounded-xl p-1 w-fit">
        {([['jobs', 'Jobs', List], ['results', 'Results', BarChart2]] as const).map(([id, label, Icon]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === id
                ? 'bg-teal-600 text-white shadow'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === 'jobs' && (
        loadingJobs
          ? <div className="py-12 text-center text-neutral-500 animate-pulse">Loading jobs...</div>
          : <JobsTable 
              jobs={jobs} 
              onRefresh={loadJobs} 
              onViewResults={(id) => { setSelectedJobId(id); setTab('results'); }}
            />
      )}
      {tab === 'results' && <ResultsPanel jobs={jobs} initialJobId={selectedJobId} />}

      {/* Modal */}
      {showModal && (
        <LaunchScrapingModal
          onClose={() => setShowModal(false)}
          onCreated={() => { loadJobs(); setTab('jobs'); }}
        />
      )}
    </div>
  );
}
