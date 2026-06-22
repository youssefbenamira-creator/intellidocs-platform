'use client';

import { useState } from 'react';
import { Table2 } from 'lucide-react';
import { fetchWithAuth } from '@/lib/apiClient';

export interface DocTable {
  title: string;
  columns: string[];
  rows: string[][];
}

/** Inline control that saves a table's columns as a reusable template. */
function SaveTemplateButton({ columns }: { columns: string[] }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [done, setDone] = useState(false);
  const save = async () => {
    if (!name.trim()) return;
    const res = await fetchWithAuth('/templates', {
      method: 'POST',
      body: JSON.stringify({ name: name.trim(), columns }),
    });
    if (res.ok) { setDone(true); setOpen(false); }
  };
  if (done) return <span className="text-xs text-emerald-400">Saved as template ✓</span>;
  return open ? (
    <span className="flex items-center gap-1">
      <input autoFocus value={name} onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && save()}
        placeholder="Template name" className="rounded px-2 py-0.5 text-xs bg-neutral-800 border border-white/10 text-white outline-none" />
      <button onClick={save} className="text-xs text-teal-400">Save</button>
      <button onClick={() => setOpen(false)} className="text-xs text-neutral-500">Cancel</button>
    </span>
  ) : (
    <button onClick={() => setOpen(true)} className="text-xs text-neutral-400 hover:text-teal-400 flex items-center gap-1">
      <Table2 size={12} /> Save as template
    </button>
  );
}

/**
 * Renders the LLM-extracted tables for a document. Columns are either dynamic
 * (free-form) or fixed by a template. Renders nothing when there are no tables.
 */
export default function DocumentTables({ tables, saveable = true }: { tables?: DocTable[] | null; saveable?: boolean }) {
  if (!tables || tables.length === 0) return null;

  return (
    <div className="bg-neutral-900/60 border border-white/10 rounded-2xl p-6 space-y-6">
      <h2 className="flex items-center gap-2 text-xs font-semibold text-neutral-500 uppercase tracking-widest">
        <Table2 size={14} className="text-teal-400" />
        Extracted Tables
      </h2>

      {tables.map((t, i) => (
        <div key={i} className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            {t.title ? <h3 className="text-sm font-medium text-neutral-300">{t.title}</h3> : <span />}
            {saveable && t.columns.length > 0 && <SaveTemplateButton columns={t.columns} />}
          </div>
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="bg-neutral-800/60">
                  {t.columns.map((c, ci) => (
                    <th
                      key={ci}
                      className="px-3 py-2 font-semibold text-neutral-200 border-b border-white/10 whitespace-nowrap"
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {t.rows.map((r, ri) => (
                  <tr key={ri} className="even:bg-white/[0.02]">
                    {r.map((cell, ci) => (
                      <td
                        key={ci}
                        className="px-3 py-2 text-neutral-400 border-b border-white/5 align-top"
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
