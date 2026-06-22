'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { fetchWithAuth } from '@/lib/apiClient';
import { Globe, Clock, Zap, CheckCircle, AlertCircle } from 'lucide-react';
import TableSchemaPicker, { SchemaChoice } from '@/components/TableSchemaPicker';

const INTERVALS = [
  { label: '5 minutes', value: 300 },
  { label: '15 minutes', value: 900 },
  { label: '30 minutes', value: 1800 },
  { label: '1 hour', value: 3600 },
  { label: '6 hours', value: 21600 },
  { label: '24 hours', value: 86400 },
];

export default function UrlScraperPage() {
  const router = useRouter();

  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [mode, setMode] = useState<'ONE_TIME' | 'CONTINUOUS'>('ONE_TIME');
  const [intervalSeconds, setIntervalSeconds] = useState(3600);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [schema, setSchema] = useState<SchemaChoice>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!url.trim()) {
      setError('URL is required');
      return;
    }

    try {
      new URL(url);
    } catch {
      setError('Please enter a valid URL (e.g. https://example.com)');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetchWithAuth('/scraping-jobs', {
        method: 'POST',
        body: JSON.stringify({
          url: url.trim(),
          name: name.trim() || undefined,
          mode,
          intervalSeconds: mode === 'CONTINUOUS' ? intervalSeconds : undefined,
          templateId: schema.templateId,
          columns: schema.columns,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.message || `Error ${res.status}`);
        return;
      }

      const job = await res.json();
      setSuccess(`Job #${job.id} created — scraping has started.`);
      setUrl('');
      setName('');
      setMode('ONE_TIME');

      setTimeout(() => router.push('/expert/url-jobs'), 1500);
    } catch {
      setError('Failed to connect to the server.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-8 animate-in fade-in duration-300">
      <div>
        <h1 className="text-3xl font-bold text-white">New Scraping Job</h1>
        <p className="text-neutral-400 mt-1">
          Provide any public URL and the platform will extract and store its content.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* URL */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-neutral-300 flex items-center gap-2">
            <Globe size={16} />
            Target URL <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/article"
            className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-4 py-3 text-white placeholder-neutral-500 focus:outline-none focus:border-teal-500 transition-colors"
          />
        </div>

        {/* Name */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-neutral-300">
            Job Name <span className="text-neutral-500">(optional)</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Daily Tech News"
            className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-4 py-3 text-white placeholder-neutral-500 focus:outline-none focus:border-teal-500 transition-colors"
          />
        </div>

        {/* Mode */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-neutral-300 flex items-center gap-2">
            <Clock size={16} />
            Execution Mode
          </label>
          <div className="grid grid-cols-2 gap-3">
            {(['ONE_TIME', 'CONTINUOUS'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`px-4 py-3 rounded-xl border text-sm font-medium transition-all ${
                  mode === m
                    ? 'bg-teal-600/20 border-teal-500 text-teal-400'
                    : 'bg-neutral-900 border-neutral-700 text-neutral-400 hover:border-neutral-500'
                }`}
              >
                {m === 'ONE_TIME' ? 'One-time' : 'Scheduled (recurring)'}
              </button>
            ))}
          </div>
        </div>

        {/* Frequency — only for CONTINUOUS */}
        {mode === 'CONTINUOUS' && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-neutral-300">
              Scraping Frequency
            </label>
            <select
              value={intervalSeconds}
              onChange={(e) => setIntervalSeconds(Number(e.target.value))}
              className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-teal-500 transition-colors"
            >
              {INTERVALS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  Every {opt.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Table extraction schema */}
        <div className="bg-neutral-900/60 border border-white/10 rounded-2xl p-5">
          <TableSchemaPicker accent="#10b981" onChange={setSchema} />
        </div>

        {/* Feedback */}
        {error && (
          <div className="flex items-center gap-2 text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm">
            <AlertCircle size={16} />
            {error}
          </div>
        )}
        {success && (
          <div className="flex items-center gap-2 text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3 text-sm">
            <CheckCircle size={16} />
            {success}
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={submitting}
          className="flex items-center gap-2 px-6 py-3 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-xl shadow-lg shadow-teal-500/20 transition-all hover:scale-105 active:scale-95"
        >
          <Zap size={18} />
          {submitting ? 'Creating job…' : 'Create Job'}
        </button>
      </form>
    </div>
  );
}
