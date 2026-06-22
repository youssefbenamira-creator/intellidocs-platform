'use client';

import { useState, useEffect, useCallback } from 'react';
import { fetchWithAuth } from '@/lib/apiClient';
import DocumentTables, { DocTable } from '@/components/DocumentTables';

const ACCENT = '#fc7c78';

interface ShareEntry {
  id: number;
  documentId: number;
  documentType: 'uploaded' | 'scraped';
  message?: string;
  createdAt: string;
  sharedBy: { email: string };
  document: {
    id: number;
    title?: string;
    filename?: string;
    url?: string;
    description?: string;
    mimeType?: string;
    fileSize?: number;
    uploadedAt?: string;
    scrapedAt?: string;
    tables?: DocTable[] | null;
  } | null;
}

function fileIcon(mime?: string) {
  if (!mime) return { icon: 'travel_explore', color: '#a78bfa' };
  if (mime.includes('pdf'))          return { icon: 'picture_as_pdf',  color: '#ef4444' };
  if (mime.includes('spreadsheet') || mime.includes('excel')) return { icon: 'table_chart', color: '#22c55e' };
  if (mime.includes('presentation')) return { icon: 'slideshow',       color: '#f97316' };
  if (mime.includes('word'))         return { icon: 'article',         color: '#38bdf8' };
  return { icon: 'description', color: '#a78bfa' };
}

function fmtSize(b?: number) {
  if (!b) return '—';
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}

function fmtDate(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function DecisionMakerDocumentsPage() {
  const [shares,  setShares]  = useState<ShareEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState('');
  const [tab,     setTab]     = useState<'all' | 'uploaded' | 'scraped'>('all');
  const [preview, setPreview] = useState<ShareEntry | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth('/shares/received');
      if (res.ok) setShares(await res.json());
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const q = search.toLowerCase();
  const filtered = shares.filter(s => {
    if (tab === 'uploaded' && s.documentType !== 'uploaded') return false;
    if (tab === 'scraped'  && s.documentType !== 'scraped')  return false;
    const label = s.document?.title || s.document?.filename || s.document?.url || '';
    return label.toLowerCase().includes(q) || s.sharedBy.email.toLowerCase().includes(q);
  });

  const uploadedCount = shares.filter(s => s.documentType === 'uploaded').length;
  const scrapedCount  = shares.filter(s => s.documentType === 'scraped').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-[28px] font-bold" style={{ color: '#dde4dd', fontFamily: 'var(--font-geist-sans)' }}>
          Shared Documents
        </h1>
        <p className="text-[14px] mt-1" style={{ color: '#bbcabf' }}>
          Documents that have been shared with you by the administrator.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Shared',  value: shares.length,  icon: 'folder_shared',  color: ACCENT },
          { label: 'Uploaded Docs', value: uploadedCount,  icon: 'upload_file',    color: '#06b6d4' },
          { label: 'Scraped Docs',  value: scrapedCount,   icon: 'travel_explore', color: '#a78bfa' },
        ].map(({ label, value, icon, color }) => (
          <div key={label} className="glass-card rounded-2xl p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center"
                style={{ background: `${color}15`, color }}>
                <span className="material-symbols-outlined text-[20px]">{icon}</span>
              </div>
              <p className="text-[13px]" style={{ color: '#bbcabf' }}>{label}</p>
            </div>
            <p className="text-[32px] font-bold leading-none" style={{ color: '#dde4dd' }}>{value}</p>
          </div>
        ))}
      </div>

      {/* Table card */}
      <div className="glass-card rounded-2xl overflow-hidden">
        {/* Tabs + search */}
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid #3c4a42' }}>
          <div className="flex gap-1 rounded-lg p-1" style={{ background: '#242c27' }}>
            {(['all', 'uploaded', 'scraped'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className="px-4 py-1.5 rounded-md text-[13px] font-medium transition-all capitalize"
                style={tab === t ? { background: ACCENT, color: '#410005' } : { color: '#bbcabf' }}
              >{t}</button>
            ))}
          </div>
          <div className="relative">
            <span className="absolute inset-y-0 left-3 flex items-center pointer-events-none"
              style={{ color: '#86948a' }}><span className="material-symbols-outlined text-[16px]">search</span></span>
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Filter documents…"
              className="rounded-lg pl-9 pr-4 py-1.5 text-[13px] w-52 focus:outline-none"
              style={{ background: '#09100c', border: '1px solid #3c4a42', color: '#dde4dd' }}
              onFocus={e => (e.currentTarget.style.borderColor = ACCENT)}
              onBlur={e => (e.currentTarget.style.borderColor = '#3c4a42')}
            />
          </div>
        </div>

        {loading ? (
          <div className="py-16 text-center" style={{ color: '#86948a' }}>
            <span className="material-symbols-outlined text-[36px] animate-pulse block mb-2">hourglass_empty</span>
            Loading shared documents…
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center" style={{ color: '#86948a' }}>
            <span className="material-symbols-outlined text-[40px] block mb-3">folder_off</span>
            <p className="text-[14px]">
              {shares.length === 0 ? 'No documents have been shared with you yet.' : 'No results match your filter.'}
            </p>
          </div>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr style={{ background: '#242c27', borderBottom: '1px solid #3c4a42' }}>
                {['Document', 'Type', 'Shared By', 'Date', 'Actions'].map(h => (
                  <th key={h} className="px-5 py-3 text-[11px] font-bold uppercase tracking-wider"
                    style={{ color: '#86948a' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => {
                const doc    = s.document;
                const label  = doc?.title || doc?.filename || doc?.url || `Document #${s.documentId}`;
                const { icon, color } = fileIcon(doc?.mimeType);
                return (
                  <tr key={s.id} style={{ borderBottom: '1px solid rgba(60,74,66,0.4)' }}
                    onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.02)')}
                    onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = '')}>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <span className="material-symbols-outlined text-[22px]" style={{ color }}>{icon}</span>
                        <div>
                          <p className="text-[13px] font-medium max-w-[260px] truncate" style={{ color: '#dde4dd' }}>{label}</p>
                          {s.message && (
                            <p className="text-[11px] mt-0.5 max-w-[260px] truncate italic" style={{ color: '#86948a' }}>
                              "{s.message}"
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className="px-2 py-0.5 rounded-full text-[11px] font-semibold capitalize"
                        style={s.documentType === 'uploaded'
                          ? { background: 'rgba(6,182,212,0.12)', color: '#06b6d4' }
                          : { background: 'rgba(167,139,250,0.12)', color: '#a78bfa' }
                        }
                      >{s.documentType}</span>
                    </td>
                    <td className="px-5 py-4 text-[13px]" style={{ color: '#bbcabf' }}>{s.sharedBy.email}</td>
                    <td className="px-5 py-4 text-[13px]" style={{ color: '#bbcabf' }}>
                      {fmtDate(s.documentType === 'uploaded' ? doc?.uploadedAt : doc?.scrapedAt)}
                    </td>
                    <td className="px-5 py-4">
                      <button
                        onClick={() => setPreview(s)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all"
                        style={{ background: `${ACCENT}15`, color: ACCENT }}
                        onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = `${ACCENT}25`)}
                        onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = `${ACCENT}15`)}
                      >
                        <span className="material-symbols-outlined text-[15px]">open_in_new</span> Preview
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Preview panel */}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full max-w-lg rounded-2xl overflow-hidden" style={{ background: '#1a211d', border: '1px solid #3c4a42' }}>
            <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid #3c4a42' }}>
              <h3 className="text-[16px] font-semibold" style={{ color: '#dde4dd' }}>Document Preview</h3>
              <button onClick={() => setPreview(null)} className="material-symbols-outlined text-[20px]"
                style={{ color: '#86948a' }}>close</button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto" style={{ maxHeight: '70vh' }}>
              {/* Doc info */}
              {[
                { label: 'Title',     value: preview.document?.title || preview.document?.filename || '—' },
                { label: 'Type',      value: preview.documentType === 'uploaded' ? 'Uploaded Document' : 'Scraped Document' },
                { label: 'Shared by', value: preview.sharedBy.email },
                { label: 'Shared on', value: fmtDate(preview.createdAt) },
                ...(preview.documentType === 'uploaded'
                  ? [
                      { label: 'File size', value: fmtSize(preview.document?.fileSize) },
                      { label: 'Uploaded',  value: fmtDate(preview.document?.uploadedAt) },
                    ]
                  : [
                      { label: 'URL',      value: preview.document?.url || '—' },
                      { label: 'Scraped',  value: fmtDate(preview.document?.scrapedAt) },
                    ]),
              ].map(({ label, value }) => (
                <div key={label} className="flex gap-4">
                  <span className="text-[12px] w-24 shrink-0 font-medium" style={{ color: '#86948a' }}>{label}</span>
                  <span className="text-[13px] break-all" style={{ color: '#dde4dd' }}>{value}</span>
                </div>
              ))}
              {preview.document?.description && (
                <div>
                  <p className="text-[12px] font-medium mb-1" style={{ color: '#86948a' }}>Description</p>
                  <p className="text-[13px] leading-relaxed" style={{ color: '#bbcabf' }}>{preview.document.description}</p>
                </div>
              )}
              {preview.message && (
                <div className="rounded-lg px-4 py-3" style={{ background: `${ACCENT}10`, border: `1px solid ${ACCENT}30` }}>
                  <p className="text-[12px] font-medium mb-1" style={{ color: ACCENT }}>Note from admin</p>
                  <p className="text-[13px] italic" style={{ color: '#dde4dd' }}>{preview.message}</p>
                </div>
              )}

              {preview.document?.tables && preview.document.tables.length > 0 && (
                <DocumentTables tables={preview.document.tables} saveable={false} />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
