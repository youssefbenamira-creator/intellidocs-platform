'use client';

import { useState } from 'react';
import { X, ChevronRight, ChevronLeft, Loader2 } from 'lucide-react';
import { fetchWithAuth } from '@/lib/apiClient';

const AVAILABLE_COINS = [
  'Bitcoin', 'Ethereum', 'Solana', 'BNB', 'XRP',
  'Cardano', 'Dogecoin', 'Avalanche', 'Polkadot', 'Chainlink',
  'Litecoin', 'Polygon', 'Tron', 'Shiba Inu', 'Uniswap',
];

const AVAILABLE_ATTRIBUTES = [
  { key: 'price', label: 'Current Price' },
  { key: 'marketCap', label: 'Market Cap' },
  { key: 'volume24h', label: '24h Volume' },
  { key: 'percentChange24h', label: '24h % Change' },
  { key: 'circulatingSupply', label: 'Circulating Supply' },
  { key: 'rank', label: 'Rank' },
];

const INTERVALS = [
  { label: 'Live (Every 15 seconds)', value: 15 },
  { label: 'Every 1 minute', value: 60 },
  { label: 'Every 5 minutes', value: 300 },
  { label: 'Every 15 minutes', value: 900 },
  { label: 'Every 30 minutes', value: 1800 },
  { label: 'Every hour', value: 3600 },
];

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

export default function LaunchScrapingModal({ onClose, onCreated }: Props) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [jobName, setJobName] = useState('');
  const [selectedCoins, setSelectedCoins] = useState<string[]>([]);
  const [selectedAttrs, setSelectedAttrs] = useState<string[]>(['price', 'marketCap', 'percentChange24h']);
  const [mode, setMode] = useState<'ONE_TIME' | 'CONTINUOUS'>('ONE_TIME');
  const [intervalSeconds, setIntervalSeconds] = useState(15);

  const toggleCoin = (coin: string) =>
    setSelectedCoins(prev => prev.includes(coin) ? prev.filter(c => c !== coin) : [...prev, coin]);

  const toggleAttr = (attr: string) =>
    setSelectedAttrs(prev => prev.includes(attr) ? prev.filter(a => a !== attr) : [...prev, attr]);

  const handleSubmit = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchWithAuth('/scraping/jobs', {
        method: 'POST',
        body: JSON.stringify({
          name: jobName || undefined,
          targetCoins: selectedCoins,
          attributes: selectedAttrs,
          mode,
          intervalSeconds: mode === 'CONTINUOUS' ? intervalSeconds : undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(Array.isArray(err.message) ? err.message[0] : err.message);
      }
      onCreated();
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <div>
            <h2 className="text-xl font-bold text-white">Launch Scraping Job</h2>
            <p className="text-sm text-slate-400 mt-0.5">Step {step} of 3</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex px-6 pt-4 gap-2">
          {[1, 2, 3].map(s => (
            <div key={s} className={`h-1 flex-1 rounded-full transition-all ${s <= step ? 'bg-teal-500' : 'bg-slate-700'}`} />
          ))}
        </div>

        <div className="p-6 space-y-5">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">{error}</div>
          )}

          {/* Step 1 — Coins */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Job Name (optional)</label>
                <input
                  value={jobName}
                  onChange={e => setJobName(e.target.value)}
                  placeholder="e.g. Daily Crypto Scan"
                  className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2 text-white outline-none focus:border-teal-500 transition"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Target Coins <span className="text-teal-400">({selectedCoins.length} selected)</span>
                </label>
                <div className="grid grid-cols-3 gap-2 max-h-52 overflow-y-auto pr-1">
                  {AVAILABLE_COINS.map(coin => (
                    <button
                      key={coin}
                      onClick={() => toggleCoin(coin)}
                      className={`px-3 py-2 rounded-lg text-sm font-medium border transition-all ${
                        selectedCoins.includes(coin)
                          ? 'bg-teal-500/20 border-teal-500/50 text-teal-300'
                          : 'bg-slate-800 border-white/10 text-slate-400 hover:border-slate-500'
                      }`}
                    >
                      {coin}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 2 — Attributes */}
          {step === 2 && (
            <div className="space-y-3">
              <label className="block text-sm font-medium text-slate-300">
                Attributes to Scrape <span className="text-teal-400">({selectedAttrs.length} selected)</span>
              </label>
              {AVAILABLE_ATTRIBUTES.map(({ key, label }) => (
                <label key={key} className="flex items-center gap-3 cursor-pointer group">
                  <div
                    onClick={() => toggleAttr(key)}
                    className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                      selectedAttrs.includes(key)
                        ? 'bg-teal-500 border-teal-500'
                        : 'border-slate-600 group-hover:border-slate-400'
                    }`}
                  >
                    {selectedAttrs.includes(key) && <span className="text-white text-xs">✓</span>}
                  </div>
                  <span className="text-slate-300">{label}</span>
                </label>
              ))}
            </div>
          )}

          {/* Step 3 — Mode */}
          {step === 3 && (
            <div className="space-y-4">
              <label className="block text-sm font-medium text-slate-300">Scraping Mode</label>
              <div className="grid grid-cols-2 gap-3">
                {(['ONE_TIME', 'CONTINUOUS'] as const).map(m => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className={`p-4 rounded-xl border-2 text-sm font-medium transition-all ${
                      mode === m
                        ? 'border-teal-500 bg-teal-500/10 text-teal-300'
                        : 'border-slate-700 text-slate-400 hover:border-slate-500'
                    }`}
                  >
                    <div className="text-2xl mb-1">{m === 'ONE_TIME' ? '⚡' : '🔄'}</div>
                    {m === 'ONE_TIME' ? 'One-Time' : 'Continuous'}
                    <div className="text-xs mt-1 opacity-70">
                      {m === 'ONE_TIME' ? 'Run once immediately' : 'Repeat on interval'}
                    </div>
                  </button>
                ))}
              </div>

              {mode === 'CONTINUOUS' && (
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Frequency</label>
                  <select
                    value={intervalSeconds}
                    onChange={e => setIntervalSeconds(Number(e.target.value))}
                    className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2 text-white outline-none focus:border-teal-500"
                  >
                    {INTERVALS.map(i => (
                      <option key={i.value} value={i.value}>{i.label}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Summary */}
              <div className="bg-slate-800/50 rounded-xl p-4 text-sm space-y-1 border border-white/5">
                <p className="text-slate-400">Coins: <span className="text-white">{selectedCoins.join(', ')}</span></p>
                <p className="text-slate-400">Attributes: <span className="text-white">{selectedAttrs.length} selected</span></p>
                <p className="text-slate-400">Mode: <span className="text-teal-400">{mode === 'ONE_TIME' ? 'One-Time' : `Every ${intervalSeconds >= 60 ? intervalSeconds/60 + ' min' : intervalSeconds + ' sec'}`}</span></p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center p-6 border-t border-white/10">
          <button
            onClick={() => step > 1 ? setStep(s => s - 1) : onClose()}
            className="flex items-center gap-2 px-4 py-2 text-slate-400 hover:text-white transition-colors"
          >
            <ChevronLeft size={16} /> {step === 1 ? 'Cancel' : 'Back'}
          </button>
          {step < 3 ? (
            <button
              onClick={() => setStep(s => s + 1)}
              disabled={step === 1 && selectedCoins.length === 0}
              className="flex items-center gap-2 px-5 py-2 bg-teal-600 hover:bg-teal-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-all"
            >
              Next <ChevronRight size={16} />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={loading || selectedCoins.length === 0 || selectedAttrs.length === 0}
              className="flex items-center gap-2 px-5 py-2 bg-teal-600 hover:bg-teal-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-all"
            >
              {loading ? <><Loader2 size={16} className="animate-spin" /> Launching...</> : '🚀 Launch Job'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
