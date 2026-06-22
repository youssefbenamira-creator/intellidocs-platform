'use client';

import { useState, useEffect, useCallback } from 'react';
import { fetchWithAuth } from '@/lib/apiClient';

const ACCENT = '#06b6d4';

/* ── Types ─────────────────────────────────────────────── */
interface UploadedDoc {
  id: number; filename: string; title?: string; mimeType: string;
  fileSize: number; uploadedAt: string; uploadedBy: { email: string };
}
interface ScrapedDoc {
  id: number; title?: string; url: string; description?: string; scrapedAt: string;
}
interface User { id: number; email: string; role: string; }
interface Share { id: number; sharedWith: { id: number; email: string; role: string }; createdAt: string; }

/* ── Helpers ────────────────────────────────────────────── */
function fileIcon(mime: string) {
  if (mime.includes('pdf'))         return { icon: 'picture_as_pdf', color: '#ef4444' };
  if (mime.includes('spreadsheet') || mime.includes('excel')) return { icon: 'table_chart', color: '#22c55e' };
  if (mime.includes('presentation')) return { icon: 'slideshow', color: '#f97316' };
  if (mime.includes('word'))        return { icon: 'article', color: '#38bdf8' };
  return { icon: 'description', color: '#a78bfa' };
}
function fmtSize(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b/1024).toFixed(1)} KB`;
  return `${(b/1048576).toFixed(1)} MB`;
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
}
function roleBadge(role: string) {
  const map: Record<string,{bg:string;color:string}> = {
    EXPERT:         { bg: 'rgba(16,185,129,0.12)', color: '#10b981' },
    DECISION_MAKER: { bg: 'rgba(252,124,120,0.12)', color: '#fc7c78' },
    ADMIN:          { bg: 'rgba(6,182,212,0.12)',   color: '#06b6d4' },
  };
  const s = map[role] ?? { bg: '#242c27', color: '#bbcabf' };
  return (
    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase" style={s}>
      {role.replace('_', ' ')}
    </span>
  );
}

/* ── Share Modal ───────────────────────────────────────── */
function ShareModal({
  doc, type, users, onClose,
}: {
  doc: { id: number; label: string };
  type: 'uploaded' | 'scraped';
  users: User[];
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<number[]>([]);
  const [message,  setMessage]  = useState('');
  const [existing, setExisting] = useState<Share[]>([]);
  const [saving,   setSaving]   = useState(false);
  const [revoking, setRevoking] = useState<number | null>(null);
  const [error,    setError]    = useState('');
  const [success,  setSuccess]  = useState('');

  useEffect(() => {
    fetchWithAuth(`/shares/document?id=${doc.id}&type=${type}`)
      .then(r => r.json()).then(setExisting).catch(() => {});
  }, [doc.id, type]);

  const toggle = (id: number) =>
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const submit = async () => {
    if (!selected.length) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetchWithAuth('/shares', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId: doc.id,
          documentType: type,
          sharedWithIds: selected,
          message: message || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        setError(`Share failed (${res.status})${body ? ': ' + body : ''}. Try restarting the backend.`);
        return;
      }
      const sharesRes = await fetchWithAuth(`/shares/document?id=${doc.id}&type=${type}`);
      if (sharesRes.ok) setExisting(await sharesRes.json());
      setSelected([]);
      setMessage('');
      setSuccess(`Shared with ${selected.length} user${selected.length > 1 ? 's' : ''} successfully.`);
    } catch (e) {
      setError('Network error — could not reach the backend.');
    } finally {
      setSaving(false);
    }
  };

  const revoke = async (shareId: number) => {
    setRevoking(shareId);
    setError('');
    try {
      const res = await fetchWithAuth(`/shares/${shareId}`, { method: 'DELETE' });
      if (res.ok) {
        setExisting(prev => prev.filter(s => s.id !== shareId));
      } else {
        setError(`Revoke failed (${res.status}).`);
      }
    } finally { setRevoking(null); }
  };

  const alreadySharedIds = new Set(existing.map(s => s.sharedWith.id));
  // Exclude ADMIN users — they can access all documents already
  const available = users.filter(u => u.role !== 'ADMIN' && !alreadySharedIds.has(u.id));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="w-full max-w-lg rounded-2xl overflow-hidden" style={{ background: '#1a211d', border: '1px solid #3c4a42' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid #3c4a42' }}>
          <div>
            <h3 className="text-[16px] font-semibold" style={{ color: '#dde4dd' }}>Share Document</h3>
            <p className="text-[12px] mt-0.5 truncate max-w-[340px]" style={{ color: '#86948a' }}>{doc.label}</p>
          </div>
          <button onClick={onClose} className="material-symbols-outlined text-[20px]" style={{ color: '#86948a' }}>close</button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto" style={{ maxHeight: '70vh' }}>
          {/* Error / success feedback */}
          {error && (
            <div className="rounded-lg px-4 py-3 text-[13px]"
              style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}>
              {error}
            </div>
          )}
          {success && (
            <div className="rounded-lg px-4 py-3 text-[13px]"
              style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', color: '#10b981' }}>
              {success}
            </div>
          )}

          {/* Currently shared with */}
          {existing.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: '#86948a' }}>
                Currently shared with
              </p>
              <div className="space-y-2">
                {existing.map(s => (
                  <div key={s.id} className="flex items-center justify-between rounded-lg px-3 py-2"
                    style={{ background: '#242c27' }}>
                    <div>
                      <span className="text-[13px]" style={{ color: '#dde4dd' }}>{s.sharedWith.email}</span>
                      <span className="ml-2">{roleBadge(s.sharedWith.role)}</span>
                    </div>
                    <button
                      onClick={() => revoke(s.id)}
                      disabled={revoking === s.id}
                      className="text-[12px] transition-colors px-2 py-1 rounded"
                      style={{ color: '#f87171', background: 'rgba(239,68,68,0.08)' }}
                    >
                      {revoking === s.id ? '…' : 'Revoke'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Select users */}
          {available.length > 0 ? (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: '#86948a' }}>
                Share with
              </p>
              <div className="space-y-1 max-h-48 overflow-y-auto rounded-lg" style={{ border: '1px solid #3c4a42' }}>
                {available.map(u => (
                  <label key={u.id}
                    className="flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors"
                    style={{ background: selected.includes(u.id) ? `${ACCENT}10` : 'transparent' }}
                    onMouseEnter={e => { if (!selected.includes(u.id)) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = selected.includes(u.id) ? `${ACCENT}10` : 'transparent'; }}
                  >
                    <input
                      type="checkbox" checked={selected.includes(u.id)}
                      onChange={() => toggle(u.id)}
                      className="rounded"
                      style={{ accentColor: ACCENT }}
                    />
                    <span className="text-[13px] flex-1" style={{ color: '#dde4dd' }}>{u.email}</span>
                    {roleBadge(u.role)}
                  </label>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-[13px] text-center py-2" style={{ color: '#86948a' }}>
              {existing.length > 0
                ? 'All eligible users already have access to this document.'
                : 'No users available to share with.'}
            </p>
          )}

          {/* Message */}
          {available.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: '#86948a' }}>
                Message (optional)
              </p>
              <textarea
                value={message} onChange={e => setMessage(e.target.value)}
                rows={2} placeholder="Add a note for the recipients…"
                className="w-full rounded-lg px-3 py-2 text-[13px] resize-none focus:outline-none"
                style={{ background: '#242c27', border: '1px solid #3c4a42', color: '#dde4dd' }}
                onFocus={e => (e.currentTarget.style.borderColor = ACCENT)}
                onBlur={e => (e.currentTarget.style.borderColor = '#3c4a42')}
              />
            </div>
          )}

          {/* Actions */}
          {available.length > 0 && (
            <div className="flex justify-end gap-3 pt-1">
              <button onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] transition-colors"
                style={{ color: '#bbcabf', background: '#242c27' }}>
                Cancel
              </button>
              <button
                onClick={submit} disabled={!selected.length || saving}
                className="px-4 py-2 rounded-lg text-[13px] font-semibold transition-all disabled:opacity-40"
                style={{ background: ACCENT, color: '#001f26' }}
              >
                {saving ? 'Sharing…' : `Share with ${selected.length || ''} ${selected.length === 1 ? 'user' : 'users'}`}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Main Page ──────────────────────────────────────────── */
export default function AdminDocumentsPage() {
  const [tab,      setTab]      = useState<'uploaded' | 'scraped'>('uploaded');
  const [uploaded, setUploaded] = useState<UploadedDoc[]>([]);
  const [scraped,  setScraped]  = useState<ScrapedDoc[]>([]);
  const [users,    setUsers]    = useState<User[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState('');
  const [sharing,  setSharing]  = useState<{ id: number; label: string; type: 'uploaded'|'scraped' } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [uRes, jobsRes, usersRes] = await Promise.all([
        fetchWithAuth('/documents'),
        fetchWithAuth('/scraping-jobs'),
        fetchWithAuth('/shares/users'),
      ]);
      if (uRes.ok)     setUploaded(await uRes.json());
      if (usersRes.ok) setUsers(await usersRes.json());

      // Collect all scraped documents from each URL scraping job
      if (jobsRes.ok) {
        const jobs: any[] = await jobsRes.json();
        const allDocs: ScrapedDoc[] = [];
        await Promise.all(jobs.map(async j => {
          const r = await fetchWithAuth(`/scraping-jobs/${j.id}/documents`);
          if (!r.ok) return;
          const docs = await r.json();
          if (Array.isArray(docs)) allDocs.push(...docs);
        }));
        setScraped(allDocs);
      }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const q = search.toLowerCase();
  const filteredUploaded = uploaded.filter(d =>
    (d.title || d.filename).toLowerCase().includes(q) || d.uploadedBy.email.toLowerCase().includes(q)
  );
  const filteredScraped = scraped.filter(d =>
    (d.title || d.url).toLowerCase().includes(q)
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[28px] font-bold" style={{ color: '#dde4dd', fontFamily: 'var(--font-geist-sans)' }}>
            Document Management
          </h1>
          <p className="text-[14px] mt-1" style={{ color: '#bbcabf' }}>
            View all platform documents and manage access sharing.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div
            className="px-3 py-1.5 rounded-lg text-[13px] font-medium"
            style={{ background: 'rgba(6,182,212,0.1)', color: ACCENT }}
          >
            {uploaded.length + scraped.length} total docs
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Uploaded Documents', value: uploaded.length, icon: 'upload_file',  color: ACCENT },
          { label: 'Scraped Documents',  value: scraped.length,  icon: 'travel_explore', color: '#a78bfa' },
          { label: 'Active Users',       value: users.length,    icon: 'group',         color: '#10b981' },
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
            {(['uploaded', 'scraped'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className="px-4 py-1.5 rounded-md text-[13px] font-medium transition-all capitalize"
                style={tab === t
                  ? { background: ACCENT, color: '#001f26' }
                  : { color: '#bbcabf' }
                }
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

        {/* Table */}
        {loading ? (
          <div className="py-16 text-center" style={{ color: '#86948a' }}>
            <span className="material-symbols-outlined text-[36px] animate-pulse block mb-2">hourglass_empty</span>
            Loading documents…
          </div>
        ) : tab === 'uploaded' ? (
          <table className="w-full text-left">
            <thead>
              <tr style={{ background: '#242c27', borderBottom: '1px solid #3c4a42' }}>
                {['Document', 'Uploaded By', 'Size', 'Date', 'Actions'].map(h => (
                  <th key={h} className="px-5 py-3 text-[11px] font-bold uppercase tracking-wider"
                    style={{ color: '#86948a' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredUploaded.length === 0 ? (
                <tr><td colSpan={5} className="py-10 text-center text-[13px]" style={{ color: '#86948a' }}>
                  No uploaded documents found.
                </td></tr>
              ) : filteredUploaded.map(d => {
                const { icon, color } = fileIcon(d.mimeType);
                return (
                  <tr key={d.id} style={{ borderBottom: '1px solid rgba(60,74,66,0.4)' }}
                    onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.02)')}
                    onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = '')}>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <span className="material-symbols-outlined text-[22px]" style={{ color }}>{icon}</span>
                        <div>
                          <p className="text-[13px] font-medium" style={{ color: '#dde4dd' }}>{d.title || d.filename}</p>
                          {d.title && <p className="text-[11px]" style={{ color: '#86948a' }}>{d.filename}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-[13px]" style={{ color: '#bbcabf' }}>{d.uploadedBy.email}</td>
                    <td className="px-5 py-4 text-[13px]" style={{ color: '#bbcabf', fontFamily: 'var(--font-jetbrains-mono)' }}>{fmtSize(d.fileSize)}</td>
                    <td className="px-5 py-4 text-[13px]" style={{ color: '#bbcabf' }}>{fmtDate(d.uploadedAt)}</td>
                    <td className="px-5 py-4">
                      <button
                        onClick={() => setSharing({ id: d.id, label: d.title || d.filename, type: 'uploaded' })}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all"
                        style={{ background: `${ACCENT}15`, color: ACCENT }}
                        onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = `${ACCENT}25`)}
                        onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = `${ACCENT}15`)}
                      >
                        <span className="material-symbols-outlined text-[15px]">share</span> Share
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr style={{ background: '#242c27', borderBottom: '1px solid #3c4a42' }}>
                {['Document', 'URL', 'Date', 'Actions'].map(h => (
                  <th key={h} className="px-5 py-3 text-[11px] font-bold uppercase tracking-wider"
                    style={{ color: '#86948a' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredScraped.length === 0 ? (
                <tr><td colSpan={4} className="py-10 text-center text-[13px]" style={{ color: '#86948a' }}>
                  No scraped documents found.
                </td></tr>
              ) : filteredScraped.map(d => (
                <tr key={d.id} style={{ borderBottom: '1px solid rgba(60,74,66,0.4)' }}
                  onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.02)')}
                  onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = '')}>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <span className="material-symbols-outlined text-[22px]" style={{ color: '#a78bfa' }}>travel_explore</span>
                      <p className="text-[13px] font-medium" style={{ color: '#dde4dd' }}>{d.title || 'Untitled'}</p>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-[12px] max-w-[220px]" style={{ color: '#86948a', fontFamily: 'var(--font-jetbrains-mono)' }}>
                    <span className="truncate block">{d.url}</span>
                  </td>
                  <td className="px-5 py-4 text-[13px]" style={{ color: '#bbcabf' }}>{fmtDate(d.scrapedAt)}</td>
                  <td className="px-5 py-4">
                    <button
                      onClick={() => setSharing({ id: d.id, label: d.title || d.url, type: 'scraped' })}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all"
                      style={{ background: `${ACCENT}15`, color: ACCENT }}
                      onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = `${ACCENT}25`)}
                      onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = `${ACCENT}15`)}
                    >
                      <span className="material-symbols-outlined text-[15px]">share</span> Share
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {sharing && (
        <ShareModal
          doc={{ id: sharing.id, label: sharing.label }}
          type={sharing.type}
          users={users}
          onClose={() => setSharing(null)}
        />
      )}
    </div>
  );
}
