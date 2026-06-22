'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { fetchWithAuth } from '@/lib/apiClient';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

interface Result {
  id: number;
  coin: string;
  price: number | null;
  marketCap: number | null;
  volume24h: number | null;
  percentChange24h: number | null;
  circulatingSupply: number | null;
  rank: number | null;
  scrapedAt: string;
  job: { name: string | null };
}

const COLORS = ['#14b8a6', '#6366f1', '#f59e0b', '#ef4444', '#8b5cf6', '#10b981', '#f97316', '#ec4899'];

const METRIC_OPTIONS = [
  { key: 'price', label: 'Price ($)' },
  { key: 'marketCap', label: 'Market Cap ($)' },
  { key: 'volume24h', label: '24h Volume ($)' },
  { key: 'percentChange24h', label: '24h Change (%)' },
];

interface JobSummary {
  id: number;
  name: string | null;
}

interface Props {
  jobs: JobSummary[];
  initialJobId: number | null;
}

export default function ResultsPanel({ jobs, initialJobId }: Props) {
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(true);
  const [coinFilter, setCoinFilter] = useState('');
  const [metric, setMetric] = useState('price');
  const [page, setPage] = useState(1);
  const [currentJobId, setCurrentJobId] = useState<number | null>(initialJobId);
  const PER_PAGE = 20;

  useEffect(() => { setCurrentJobId(initialJobId); }, [initialJobId]);

  const loadResults = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (coinFilter && !currentJobId) params.set('coin', coinFilter);
      
      const endpoint = currentJobId 
        ? `/scraping/results/${currentJobId}`
        : `/scraping/results?${params.toString()}`;
        
      const res = await fetchWithAuth(endpoint);
      if (res.ok) setResults(await res.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadResults(); }, [coinFilter, currentJobId]);

  // Group results by coin for chart
  const coins = [...new Set(results.map(r => r.coin))];

  const chartData = {
    labels: [...new Set(results.map(r => new Date(r.scrapedAt).toLocaleString()))].slice(-30),
    datasets: coins.slice(0, 8).map((coin, i) => {
      const coinResults = results
        .filter(r => r.coin === coin)
        .sort((a, b) => new Date(a.scrapedAt).getTime() - new Date(b.scrapedAt).getTime())
        .slice(-30);
      return {
        label: coin,
        data: coinResults.map(r => (r as any)[metric]),
        borderColor: COLORS[i % COLORS.length],
        backgroundColor: COLORS[i % COLORS.length] + '20',
        borderWidth: 2,
        pointRadius: 3,
        tension: 0.3,
        fill: false,
      };
    }),
  };

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: { labels: { color: '#94a3b8', font: { size: 12 } } },
      tooltip: { mode: 'index' as const, intersect: false },
    },
    scales: {
      x: {
        ticks: { color: '#475569', maxTicksLimit: 8 },
        grid: { color: '#1e293b' },
      },
      y: {
        ticks: { color: '#475569' },
        grid: { color: '#1e293b' },
      },
    },
  };

  const filtered = results.filter(r =>
    !coinFilter || r.coin.toLowerCase().includes(coinFilter.toLowerCase())
  );
  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const totalPages = Math.ceil(filtered.length / PER_PAGE);

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <input
          placeholder="Filter by coin..."
          value={coinFilter}
          onChange={e => { setCoinFilter(e.target.value); setPage(1); }}
          className="bg-slate-800 border border-white/10 rounded-lg px-4 py-2 text-white text-sm outline-none focus:border-teal-500 transition w-48"
        />
        <select
          value={currentJobId || ''}
          onChange={e => { setCurrentJobId(e.target.value ? Number(e.target.value) : null); setPage(1); }}
          className="bg-slate-800 border border-white/10 rounded-lg px-4 py-2 text-white text-sm outline-none focus:border-teal-500 transition max-w-xs"
        >
          <option value="">All Jobs</option>
          {jobs.map(j => (
            <option key={j.id} value={j.id}>{j.name || `Job #${j.id}`}</option>
          ))}
        </select>
        <select
          value={metric}
          onChange={e => setMetric(e.target.value)}
          className="bg-slate-800 border border-white/10 rounded-lg px-4 py-2 text-white text-sm outline-none focus:border-teal-500 transition"
        >
          {METRIC_OPTIONS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
        </select>
        <button onClick={loadResults} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm transition">
          ↻ Refresh
        </button>
        <span className="text-slate-400 text-sm ml-auto">{filtered.length.toLocaleString()} results</span>
      </div>

      {/* Chart */}
      {results.length > 0 && (
        <div className="bg-slate-800/40 border border-white/10 rounded-2xl p-6">
          <h3 className="text-sm font-medium text-slate-400 mb-4">
            {METRIC_OPTIONS.find(m => m.key === metric)?.label} — Over Time
          </h3>
          <Line data={chartData} options={chartOptions} />
        </div>
      )}

      {/* Table */}
      <div className="bg-slate-800/40 border border-white/10 rounded-2xl overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="bg-white/5 border-b border-white/10 text-slate-400 text-xs uppercase tracking-wider">
            <tr>
              <th className="px-4 py-3">Coin</th>
              <th className="px-4 py-3">Rank</th>
              <th className="px-4 py-3">Price</th>
              <th className="px-4 py-3">Market Cap</th>
              <th className="px-4 py-3">24h Vol</th>
              <th className="px-4 py-3">24h %</th>
              <th className="px-4 py-3">Scraped At</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="py-8 text-center text-slate-500 animate-pulse">Loading results...</td></tr>
            ) : paginated.length === 0 ? (
              <tr><td colSpan={7} className="py-8 text-center text-slate-500">No results yet. Launch a scraping job!</td></tr>
            ) : paginated.map(r => (
              <tr key={r.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                <td className="px-4 py-3 font-medium text-white">{r.coin}</td>
                <td className="px-4 py-3 text-slate-400">{r.rank ?? '—'}</td>
                <td className="px-4 py-3 text-teal-400">{r.price != null ? `$${r.price.toLocaleString()}` : '—'}</td>
                <td className="px-4 py-3 text-slate-300">{r.marketCap != null ? `$${(r.marketCap / 1e9).toFixed(2)}B` : '—'}</td>
                <td className="px-4 py-3 text-slate-300">{r.volume24h != null ? `$${(r.volume24h / 1e9).toFixed(2)}B` : '—'}</td>
                <td className={`px-4 py-3 font-medium ${r.percentChange24h != null ? (r.percentChange24h >= 0 ? 'text-emerald-400' : 'text-red-400') : 'text-slate-400'}`}>
                  {r.percentChange24h != null ? `${r.percentChange24h >= 0 ? '+' : ''}${r.percentChange24h.toFixed(2)}%` : '—'}
                </td>
                <td className="px-4 py-3 text-slate-500 text-xs">{new Date(r.scrapedAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-white/10">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 bg-slate-700 rounded text-sm text-white disabled:opacity-40">← Prev</button>
            <span className="text-slate-400 text-sm">Page {page} of {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-3 py-1 bg-slate-700 rounded text-sm text-white disabled:opacity-40">Next →</button>
          </div>
        )}
      </div>
    </div>
  );
}
