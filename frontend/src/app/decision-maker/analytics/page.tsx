'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
  Title,
} from 'chart.js';
import { Bar, Pie } from 'react-chartjs-2';
import { fetchWithAuth } from '@/lib/apiClient';
import { RefreshCw, Loader2, Brain, Tag, Globe, TrendingUp, FileText } from 'lucide-react';

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend, Title);

interface Overview {
  total: number;
  total_uploaded: number;
  total_scraped: number;
  docs_by_week: { week: string; uploaded: number; scraped: number }[];
  language_distribution: { language: string; count: number }[];
  top_keywords: { word: string; count: number }[];
  top_entities: { text: string; label: string; count: number }[];
}

interface Topic {
  id: number;
  label: string;
  keywords: string[];
  doc_count: number;
  representative_docs: string[];
}

const ENTITY_COLORS: Record<string, string> = {
  PER: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
  ORG: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  LOC: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  MISC: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
};

const LABEL_NAMES: Record<string, string> = {
  PER: 'Persons',
  ORG: 'Organizations',
  LOC: 'Locations',
  MISC: 'Miscellaneous',
};

export default function AnalyticsDashboard() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [topics, setTopics] = useState<Topic[] | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [loadingTopics, setLoadingTopics] = useState(false);
  const [topicsMessage, setTopicsMessage] = useState('');

  const fetchOverview = async () => {
    setLoadingOverview(true);
    try {
      const res = await fetchWithAuth('/analytics/overview');
      if (!res.ok) throw new Error('Failed');
      const data: Overview = await res.json();
      setOverview(data);
    } catch (e) {
      console.error('Failed to load analytics overview', e);
    } finally {
      setLoadingOverview(false);
    }
  };

  const fetchTopics = async () => {
    setLoadingTopics(true);
    setTopicsMessage('');
    try {
      const res = await fetchWithAuth('/analytics/topics', { method: 'POST' });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setTopics(data.topics || []);
      if (data.message) setTopicsMessage(data.message);
      if (data.error) setTopicsMessage(`Error: ${data.error}`);
    } catch (e) {
      setTopicsMessage('Failed to compute topics.');
    } finally {
      setLoadingTopics(false);
    }
  };

  useEffect(() => {
    fetchOverview();
  }, []);

  if (loadingOverview) {
    return (
      <div className="flex items-center justify-center h-64 text-neutral-400">
        <Loader2 className="animate-spin mr-2" size={20} />
        Loading analytics…
      </div>
    );
  }

  if (!overview) {
    return (
      <div className="text-neutral-400 text-center py-20">
        Could not load analytics data. Make sure the AI service is running.
      </div>
    );
  }

  // --- chart data ---
  const weeklyData = {
    labels: overview.docs_by_week.map((w) => w.week),
    datasets: [
      {
        label: 'Uploaded',
        data: overview.docs_by_week.map((w) => w.uploaded),
        backgroundColor: 'rgba(249, 115, 22, 0.7)',
        borderRadius: 4,
      },
      {
        label: 'Scraped',
        data: overview.docs_by_week.map((w) => w.scraped),
        backgroundColor: 'rgba(99, 102, 241, 0.7)',
        borderRadius: 4,
      },
    ],
  };

  const langData = {
    labels: overview.language_distribution.map((l) => l.language),
    datasets: [
      {
        data: overview.language_distribution.map((l) => l.count),
        backgroundColor: [
          'rgba(59, 130, 246, 0.8)',
          'rgba(249, 115, 22, 0.8)',
          'rgba(107, 114, 128, 0.8)',
        ],
        borderColor: ['#1d4ed8', '#c2410c', '#374151'],
        borderWidth: 1,
      },
    ],
  };

  const kwData = {
    labels: overview.top_keywords.slice(0, 15).map((k) => k.word),
    datasets: [
      {
        label: 'Occurrences',
        data: overview.top_keywords.slice(0, 15).map((k) => k.count),
        backgroundColor: 'rgba(16, 185, 129, 0.7)',
        borderRadius: 4,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: { labels: { color: '#a3a3a3' } },
    },
    scales: {
      x: { ticks: { color: '#737373' }, grid: { color: '#262626' } },
      y: { ticks: { color: '#737373' }, grid: { color: '#262626' } },
    },
  } as const;

  const pieOptions = {
    responsive: true,
    plugins: {
      legend: { labels: { color: '#a3a3a3' }, position: 'bottom' as const },
    },
  };

  // group entities by label
  const entityGroups: Record<string, typeof overview.top_entities> = {};
  for (const ent of overview.top_entities) {
    const label = ent.label || 'MISC';
    if (!entityGroups[label]) entityGroups[label] = [];
    if (entityGroups[label].length < 8) entityGroups[label].push(ent);
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Analytics Dashboard</h1>
          <p className="text-neutral-400 mt-1">Corpus intelligence across {overview.total} documents</p>
        </div>
        <button
          onClick={fetchOverview}
          className="flex items-center gap-2 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 rounded-xl text-sm text-neutral-300 transition-colors"
        >
          <RefreshCw size={15} />
          Refresh
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Documents', value: overview.total, icon: FileText, color: 'text-white' },
          { label: 'Uploaded', value: overview.total_uploaded, icon: FileText, color: 'text-orange-400' },
          { label: 'Scraped', value: overview.total_scraped, icon: Globe, color: 'text-indigo-400' },
          {
            label: 'Languages',
            value: overview.language_distribution.filter((l) => l.count > 0).length,
            icon: Globe,
            color: 'text-emerald-400',
          },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5">
            <div className="flex items-center gap-2 text-neutral-400 text-sm mb-2">
              <Icon size={14} />
              {label}
            </div>
            <p className={`text-3xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Weekly timeline + Language pie */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-neutral-900 border border-neutral-800 rounded-2xl p-6">
          <h2 className="font-semibold text-neutral-200 mb-4">Documents per Week</h2>
          <Bar data={weeklyData} options={chartOptions} />
        </div>
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6">
          <h2 className="font-semibold text-neutral-200 mb-4">Language Distribution</h2>
          <Pie data={langData} options={pieOptions} />
        </div>
      </div>

      {/* Top keywords */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <Tag size={16} className="text-emerald-400" />
          <h2 className="font-semibold text-neutral-200">Top Keywords</h2>
        </div>
        {overview.top_keywords.length > 0 ? (
          <Bar
            data={kwData}
            options={{
              ...chartOptions,
              indexAxis: 'y' as const,
              plugins: { legend: { display: false } },
            }}
          />
        ) : (
          <p className="text-neutral-500 text-sm">No keywords extracted yet.</p>
        )}
      </div>

      {/* Named entities */}
      {Object.keys(entityGroups).length > 0 && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-5">
            <TrendingUp size={16} className="text-violet-400" />
            <h2 className="font-semibold text-neutral-200">Named Entities</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {Object.entries(entityGroups).map(([label, entities]) => (
              <div key={label}>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-3">
                  {LABEL_NAMES[label] || label}
                </h3>
                <div className="space-y-2">
                  {entities.map((ent) => (
                    <div key={ent.text} className="flex items-center justify-between">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full border ${ENTITY_COLORS[label] || ENTITY_COLORS.MISC}`}
                      >
                        {ent.text}
                      </span>
                      <div className="flex items-center gap-2">
                        <div
                          className="h-1.5 rounded-full bg-neutral-700"
                          style={{ width: 80 }}
                        >
                          <div
                            className="h-1.5 rounded-full bg-violet-500"
                            style={{
                              width: `${Math.min(100, (ent.count / (entities[0]?.count || 1)) * 100)}%`,
                            }}
                          />
                        </div>
                        <span className="text-xs text-neutral-500 w-5 text-right">{ent.count}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* BERTopic clusters */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Brain size={16} className="text-orange-400" />
            <h2 className="font-semibold text-neutral-200">Topic Clusters</h2>
            <span className="text-xs text-neutral-500 ml-1">(BERTopic)</span>
          </div>
          <button
            onClick={fetchTopics}
            disabled={loadingTopics}
            className="flex items-center gap-2 px-4 py-2 bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border border-orange-500/20 rounded-xl text-sm transition-colors disabled:opacity-50"
          >
            {loadingTopics ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Brain size={14} />
            )}
            {loadingTopics ? 'Computing…' : topics === null ? 'Run Topic Modeling' : 'Recompute'}
          </button>
        </div>

        {topics === null && !loadingTopics && (
          <p className="text-neutral-500 text-sm text-center py-8">
            Click "Run Topic Modeling" to cluster documents with BERTopic. This may take 30–60 seconds.
          </p>
        )}

        {topicsMessage && (
          <p className="text-amber-400 text-sm mb-4">{topicsMessage}</p>
        )}

        {topics !== null && topics.length === 0 && !topicsMessage && (
          <p className="text-neutral-500 text-sm">No topics found.</p>
        )}

        {topics && topics.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {topics.map((topic) => (
              <div
                key={topic.id}
                className="bg-neutral-800/50 border border-neutral-700/50 rounded-xl p-4"
              >
                <div className="flex items-start justify-between mb-3">
                  <h3 className="font-medium text-white text-sm leading-snug">{topic.label}</h3>
                  <span className="ml-2 text-xs bg-orange-500/20 text-orange-300 border border-orange-500/30 px-2 py-0.5 rounded-full whitespace-nowrap">
                    {topic.doc_count} docs
                  </span>
                </div>
                <div className="flex flex-wrap gap-1 mb-3">
                  {topic.keywords.map((kw) => (
                    <span
                      key={kw}
                      className="text-xs bg-neutral-700 text-neutral-300 px-2 py-0.5 rounded-full"
                    >
                      {kw}
                    </span>
                  ))}
                </div>
                {topic.representative_docs.length > 0 && (
                  <div className="border-t border-neutral-700 pt-2 mt-2">
                    <p className="text-xs text-neutral-500 mb-1">Representative documents:</p>
                    {topic.representative_docs.map((title, i) => (
                      <p key={i} className="text-xs text-neutral-400 truncate">
                        · {title}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
