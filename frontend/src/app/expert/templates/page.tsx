'use client';

import { useState, useEffect, useCallback } from 'react';
import { fetchWithAuth } from '@/lib/apiClient';

const ACCENT = '#10b981';

interface Template { id: string; name: string; description?: string; columns: string[]; }
interface DatasetRow { cells: string[]; sourceType: string; sourceId: number; sourceTitle: string; }
interface Dataset { name: string; columns: string[]; rows: DatasetRow[]; documentCount: number; }

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Template | null | 'new'>(null);
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [toast, setToast] = useState('');

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2500); };
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth('/templates');
      if (res.ok) setTemplates(await res.json());
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const remove = async (id: string) => {
    if (!confirm('Delete this template? Documents already extracted keep their tables.')) return;
    await fetchWithAuth(`/templates/${id}`, { method: 'DELETE' });
    flash('Template deleted'); load();
  };
  const viewDataset = async (id: string) => {
    const res = await fetchWithAuth(`/templates/${id}/dataset`);
    if (res.ok) setDataset(await res.json());
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[28px] font-bold" style={{ color: '#dde4dd', fontFamily: 'var(--font-geist-sans)' }}>Table Templates</h1>
          <p className="text-[14px] mt-1" style={{ color: '#bbcabf' }}>
            Reusable column sets so similar documents are extracted into matching tables.
          </p>
        </div>
        <button onClick={() => setEditing('new')}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-semibold"
          style={{ background: ACCENT, color: '#003824' }}>
          <span className="material-symbols-outlined text-[18px]">add</span> New Template
        </button>
      </div>

      {loading ? (
        <div className="py-16 text-center" style={{ color: '#86948a' }}>
          <span className="material-symbols-outlined text-[34px] animate-pulse block mb-2">hourglass_empty</span>Loading…
        </div>
      ) : templates.length === 0 ? (
        <div className="py-16 text-center glass-card rounded-2xl" style={{ color: '#86948a' }}>
          <span className="material-symbols-outlined text-[44px] block mb-3">dataset</span>
          <p className="text-[14px]">No templates yet. Create one to standardise extraction across similar documents.</p>
        </div>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
          {templates.map((t) => (
            <div key={t.id} className="glass-card rounded-2xl p-5 flex flex-col">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold truncate" style={{ color: '#dde4dd' }}>{t.name}</p>
                  {t.description && <p className="text-[12px] mt-0.5 truncate" style={{ color: '#86948a' }}>{t.description}</p>}
                </div>
                <span className="material-symbols-outlined text-[20px] shrink-0" style={{ color: ACCENT }}>dataset</span>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-3 flex-1">
                {t.columns.map((c) => (
                  <span key={c} className="px-2 py-0.5 rounded-md text-[11px]" style={{ background: `${ACCENT}1f`, color: ACCENT }}>{c}</span>
                ))}
              </div>
              <div className="flex items-center gap-2 mt-4 pt-3" style={{ borderTop: '1px solid #3c4a42' }}>
                <button onClick={() => viewDataset(t.id)} className="flex items-center gap-1 text-[12px] px-2 py-1 rounded" style={{ background: '#242c27', color: ACCENT }}>
                  <span className="material-symbols-outlined text-[15px]">table_view</span> Dataset
                </button>
                <button onClick={() => setEditing(t)} className="flex items-center gap-1 text-[12px] px-2 py-1 rounded" style={{ background: '#242c27', color: '#bbcabf' }}>
                  <span className="material-symbols-outlined text-[15px]">edit</span> Edit
                </button>
                <button onClick={() => remove(t.id)} className="flex items-center gap-1 text-[12px] px-2 py-1 rounded ml-auto" style={{ color: '#f87171' }}>
                  <span className="material-symbols-outlined text-[15px]">delete</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && <TemplateEditor template={editing === 'new' ? null : editing}
        onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); flash('Saved'); }} />}
      {dataset && <DatasetModal data={dataset} onClose={() => setDataset(null)} />}

      {toast && (
        <div className="fixed bottom-6 right-6 px-4 py-2 rounded-lg text-[13px] z-50" style={{ background: '#1a211d', border: `1px solid ${ACCENT}`, color: '#dde4dd' }}>{toast}</div>
      )}
    </div>
  );
}

function TemplateEditor({ template, onClose, onSaved }: { template: Template | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(template?.name ?? '');
  const [description, setDescription] = useState(template?.description ?? '');
  const [columns, setColumns] = useState<string[]>(template?.columns ?? []);
  const [colInput, setColInput] = useState('');
  const [error, setError] = useState('');

  const addCol = () => {
    const v = colInput.trim();
    if (v && !columns.some((c) => c.toLowerCase() === v.toLowerCase())) setColumns([...columns, v]);
    setColInput('');
  };
  const save = async () => {
    if (!name.trim()) { setError('Name is required'); return; }
    if (columns.length === 0) { setError('Add at least one column'); return; }
    const body = JSON.stringify({ name, description: description || undefined, columns });
    const res = template
      ? await fetchWithAuth(`/templates/${template.id}`, { method: 'PATCH', body })
      : await fetchWithAuth('/templates', { method: 'POST', body });
    if (res.ok) onSaved(); else setError('Save failed');
  };

  return (
    <Modal title={template ? 'Edit template' : 'New template'} onClose={onClose}>
      <div className="space-y-4">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Template name"
          className="w-full rounded-lg px-3 py-2 text-[14px] focus:outline-none" style={{ background: '#09100c', border: '1px solid #3c4a42', color: '#dde4dd' }} />
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description (optional)"
          className="w-full rounded-lg px-3 py-2 text-[13px] focus:outline-none" style={{ background: '#09100c', border: '1px solid #3c4a42', color: '#dde4dd' }} />
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-wider mb-2" style={{ color: '#86948a' }}>Columns</p>
          <div className="flex gap-2">
            <input value={colInput} onChange={(e) => setColInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCol(); } }}
              placeholder="Add a column, press Enter…"
              className="flex-1 rounded-lg px-3 py-2 text-[13px] focus:outline-none" style={{ background: '#09100c', border: '1px solid #3c4a42', color: '#dde4dd' }} />
            <button onClick={addCol} className="px-3 py-2 rounded-lg text-[13px] font-semibold" style={{ background: ACCENT, color: '#003824' }}>Add</button>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {columns.map((c) => (
              <span key={c} className="flex items-center gap-1 px-2 py-1 rounded-md text-[12px]" style={{ background: `${ACCENT}1f`, color: ACCENT }}>
                {c}<button onClick={() => setColumns(columns.filter((x) => x !== c))} className="material-symbols-outlined text-[14px]">close</button>
              </span>
            ))}
          </div>
        </div>
        {error && <p className="text-[12px]" style={{ color: '#f87171' }}>{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-[13px]" style={{ background: '#242c27', color: '#bbcabf' }}>Cancel</button>
          <button onClick={save} className="px-4 py-2 rounded-lg text-[13px] font-semibold" style={{ background: ACCENT, color: '#003824' }}>Save</button>
        </div>
      </div>
    </Modal>
  );
}

function DatasetModal({ data, onClose }: { data: Dataset; onClose: () => void }) {
  const csv = () => {
    const head = ['Source', ...data.columns].join(',');
    const lines = data.rows.map((r) => [r.sourceTitle, ...r.cells].map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','));
    const blob = new Blob([[head, ...lines].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${data.name}.csv`; a.click();
  };
  return (
    <Modal title={`Dataset — ${data.name}`} onClose={onClose} wide>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[13px]" style={{ color: '#bbcabf' }}>{data.rows.length} rows from {data.documentCount} document(s)</p>
        {data.rows.length > 0 && (
          <button onClick={csv} className="flex items-center gap-1 text-[12px] px-2 py-1 rounded" style={{ background: '#242c27', color: ACCENT }}>
            <span className="material-symbols-outlined text-[15px]">download</span> CSV
          </button>
        )}
      </div>
      {data.rows.length === 0 ? (
        <p className="text-[13px] py-6 text-center" style={{ color: '#86948a' }}>No documents have been extracted with this template yet.</p>
      ) : (
        <div className="overflow-auto rounded-lg" style={{ border: '1px solid #3c4a42', maxHeight: '55vh' }}>
          <table className="w-full text-left text-[12px] border-collapse">
            <thead>
              <tr style={{ background: '#242c27' }}>
                <th className="px-3 py-2 font-semibold whitespace-nowrap" style={{ color: '#86948a' }}>Source</th>
                {data.columns.map((c) => <th key={c} className="px-3 py-2 font-semibold whitespace-nowrap" style={{ color: '#dde4dd' }}>{c}</th>)}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r, i) => (
                <tr key={i} className="even:bg-white/[0.02]">
                  <td className="px-3 py-2 max-w-[180px] truncate" style={{ color: '#86948a', borderBottom: '1px solid rgba(60,74,66,0.4)' }}>{r.sourceTitle}</td>
                  {data.columns.map((_, ci) => (
                    <td key={ci} className="px-3 py-2" style={{ color: '#bbcabf', borderBottom: '1px solid rgba(60,74,66,0.4)' }}>{r.cells[ci] ?? ''}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
      <div className={`w-full ${wide ? 'max-w-4xl' : 'max-w-lg'} rounded-2xl overflow-hidden`} style={{ background: '#1a211d', border: '1px solid #3c4a42' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid #3c4a42' }}>
          <h3 className="text-[16px] font-semibold" style={{ color: '#dde4dd' }}>{title}</h3>
          <button onClick={onClose} className="material-symbols-outlined text-[20px]" style={{ color: '#86948a' }}>close</button>
        </div>
        <div className="p-6 overflow-y-auto" style={{ maxHeight: '75vh' }}>{children}</div>
      </div>
    </div>
  );
}
