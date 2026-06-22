'use client';

import { useState, useEffect } from 'react';
import { fetchWithAuth } from '@/lib/apiClient';
import ResultsPanel from '@/app/expert/components/ResultsPanel';

export default function MarketDataPage() {
  const [jobs, setJobs] = useState<any[]>([]);

  useEffect(() => {
    fetchWithAuth('/scraping/jobs')
      .then(res => res.ok ? res.json() : [])
      .then(setJobs)
      .catch(() => setJobs([]));
  }, []);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div>
        <h1 className="text-3xl font-bold text-white">Market Data</h1>
        <p className="text-neutral-400 mt-1">Real-time cryptocurrency data scraped from CoinMarketCap.</p>
      </div>
      <ResultsPanel jobs={jobs} initialJobId={null} />
    </div>
  );
}
