'use client';

import { useState, useEffect } from 'react';
import { fetchWithAuth } from '@/lib/apiClient';

export interface SchemaChoice {
  templateId?: string;
  columns?: string[];
}

interface Template { id: string; name: string; columns: string[] }

/**
 * Lets an Expert choose how a document's tables are extracted:
 *   - Auto      → the AI chooses the columns (free-form)
 *   - Template  → reuse a saved column set, so similar documents match
 *   - Custom    → type the columns once; the AI fills only those
 */
export default function TableSchemaPicker({
  accent = '#10b981',
  onChange,
}: {
  accent?: string;
  onChange: (choice: SchemaChoice) => void;
}) {
  const [mode, setMode] = useState<'auto' | 'template' | 'custom'>('auto');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [columns, setColumns] = useState<string[]>([]);
  const [colInput, setColInput] = useState('');

  useEffect(() => {
    fetchWithAuth('/templates').then((r) => (r.ok ? r.json() : [])).then(setTemplates).catch(() => {});
  }, []);

  const emit = (m: typeof mode, tid: string, cols: string[]) => {
    if (m === 'auto') onChange({});
    else if (m === 'template') onChange({ templateId: tid || undefined });
    else onChange({ columns: cols.length ? cols : undefined });
  };
  const pickMode = (m: typeof mode) => { setMode(m); emit(m, templateId, columns); };
  const pickTemplate = (tid: string) => { setTemplateId(tid); emit('template', tid, columns); };
  const addCol = () => {
    const v = colInput.trim();
    if (v && !columns.some((c) => c.toLowerCase() === v.toLowerCase())) {
      const next = [...columns, v];
      setColumns(next); emit('custom', templateId, next);
    }
    setColInput('');
  };
  const removeCol = (c: string) => {
    const next = columns.filter((x) => x !== c);
    setColumns(next); emit('custom', templateId, next);
  };

  const seg = (m: typeof mode, label: string, icon: string) => (
    <button type="button" onClick={() => pickMode(m)}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[13px] font-medium transition-all"
      style={mode === m ? { background: accent, color: '#003824' } : { color: '#bbcabf' }}>
      <span className="material-symbols-outlined text-[16px]">{icon}</span>{label}
    </button>
  );

  return (
    <div className="space-y-3">
      <div>
        <p className="text-[12px] font-semibold uppercase tracking-wider mb-2" style={{ color: '#86948a' }}>
          Table extraction
        </p>
        <div className="inline-flex gap-1 rounded-lg p-1" style={{ background: '#242c27' }}>
          {seg('auto', 'Auto', 'auto_awesome')}
          {seg('template', 'Template', 'dataset')}
          {seg('custom', 'Custom columns', 'view_column')}
        </div>
      </div>

      {mode === 'auto' && (
        <p className="text-[12px]" style={{ color: '#86948a' }}>
          The AI decides the columns from each document's content.
        </p>
      )}

      {mode === 'template' && (
        templates.length > 0 ? (
          <select value={templateId} onChange={(e) => pickTemplate(e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-[13px] focus:outline-none"
            style={{ background: '#09100c', border: '1px solid #3c4a42', color: '#dde4dd' }}>
            <option value="">Select a template…</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.name} — {t.columns.join(', ')}</option>
            ))}
          </select>
        ) : (
          <p className="text-[12px]" style={{ color: '#86948a' }}>
            No templates yet. Create one in the Templates page, or use Custom columns.
          </p>
        )
      )}

      {mode === 'custom' && (
        <div>
          <div className="flex gap-2">
            <input value={colInput} onChange={(e) => setColInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCol(); } }}
              placeholder="Add a column, press Enter…"
              className="flex-1 rounded-lg px-3 py-2 text-[13px] focus:outline-none"
              style={{ background: '#09100c', border: '1px solid #3c4a42', color: '#dde4dd' }} />
            <button type="button" onClick={addCol} className="px-3 py-2 rounded-lg text-[13px] font-semibold"
              style={{ background: accent, color: '#003824' }}>Add</button>
          </div>
          {columns.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {columns.map((c) => (
                <span key={c} className="flex items-center gap-1 px-2 py-1 rounded-md text-[12px]"
                  style={{ background: `${accent}1f`, color: accent }}>
                  {c}
                  <button type="button" onClick={() => removeCol(c)} className="material-symbols-outlined text-[14px]">close</button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
