'use client';

import { useState, useEffect, useCallback, useRef, createContext, useContext } from 'react';
import { useRouter } from 'next/navigation';
import { fetchWithAuth } from '@/lib/apiClient';

/* Accent is provided per-portal so the explorer matches each theme. */
const AccentCtx = createContext('#10b981');
const useAccent = () => useContext(AccentCtx);

/* ── Types ──────────────────────────────────────────────── */
type AssetType = 'FILE' | 'FOLDER' | 'SCRAPED_PAGE' | 'SCRAPED_SITE' | 'GENERATED_DOCUMENT' | 'DATASET';
interface Asset {
  id: string;
  type: AssetType;
  name: string;
  parentId: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  metadata?: Record<string, any> | null;
  createdAt: string;
  updatedAt: string;
  _count?: { children: number };
  tags?: { tag: { id: string; name: string } }[];
  match?: string;
}
interface Crumb { id: string; name: string; }
interface Permission { id: string; level: string; user: { id: number; email: string; role: string }; }
interface PublicLink { id: string; token: string; url: string; hasPassword: boolean; expiresAt: string | null; }
interface Version { id: string; versionNumber: number; label?: string; createdAt: string; createdBy?: { email: string }; }

const CONTAINER: AssetType[] = ['FOLDER', 'SCRAPED_SITE'];

function icon(t: AssetType, accent: string): { name: string; color: string } {
  switch (t) {
    case 'FOLDER':            return { name: 'folder', color: '#fbbf24' };
    case 'SCRAPED_SITE':      return { name: 'travel_explore', color: '#a78bfa' };
    case 'SCRAPED_PAGE':      return { name: 'language', color: '#a78bfa' };
    case 'GENERATED_DOCUMENT':return { name: 'auto_awesome', color: accent };
    case 'DATASET':           return { name: 'dataset', color: '#06b6d4' };
    default:                  return { name: 'description', color: '#38bdf8' };
  }
}
function fmtSize(b?: number | null) {
  if (!b) return '—';
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * Reusable Drive-style content explorer.
 * @param accent  portal accent colour (#10b981 expert / #06b6d4 admin / #fc7c78 decision-maker)
 * @param base    route prefix for opening document viewers (e.g. "/expert", "/admin")
 */
export default function Explorer({ accent = '#10b981', base }: { accent?: string; base: string }) {
  const ACCENT = accent;
  const router = useRouter();
  const [workspaceId, setWorkspaceId] = useState('');
  const [parentId, setParentId] = useState<string | null>(null);
  const [crumbs, setCrumbs] = useState<Crumb[]>([]);
  const [items, setItems] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [trashView, setTrashView] = useState(false);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [searching, setSearching] = useState(false);
  const [menu, setMenu] = useState<{ asset: Asset; x: number; y: number } | null>(null);
  const [shareFor, setShareFor] = useState<Asset | null>(null);
  const [versionsFor, setVersionsFor] = useState<Asset | null>(null);
  const [moveFor, setMoveFor] = useState<Asset[] | null>(null);
  const [nameDialog, setNameDialog] = useState<{ title: string; initial: string; submit: (v: string) => void } | null>(null);
  const [toast, setToast] = useState('');
  const dragId = useRef<string | null>(null);

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2500); };
  const selBg = `${ACCENT}14`;

  /* ── Data loading ── */
  const loadChildren = useCallback(async (ws: string, pid: string | null, trashed: boolean) => {
    setLoading(true);
    setSelected(new Set());
    try {
      const qs = new URLSearchParams({ workspaceId: ws });
      if (pid) qs.set('parentId', pid);
      if (trashed) qs.set('trashed', 'true');
      const res = await fetchWithAuth(`/assets?${qs}`);
      if (res.ok) setItems(await res.json());
      if (pid) {
        const bRes = await fetchWithAuth(`/assets/${pid}/breadcrumbs`);
        if (bRes.ok) setCrumbs(await bRes.json());
      } else setCrumbs([]);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    (async () => {
      const res = await fetchWithAuth('/workspaces/default');
      if (res.ok) { const ws = await res.json(); setWorkspaceId(ws.id); }
    })();
  }, []);

  useEffect(() => {
    if (workspaceId && !search) loadChildren(workspaceId, parentId, trashView);
  }, [workspaceId, parentId, trashView, search, loadChildren]);

  /* ── Search (fast structural as-you-type; deep content search on demand) ── */
  const doSearch = useCallback(async (term: string, semantic: boolean) => {
    setSearching(true);
    if (semantic) setLoading(true);     // only block the view for the slow semantic pass
    setSelected(new Set());
    try {
      const qs = new URLSearchParams({ q: term });
      if (semantic) qs.set('semantic', 'true');
      const res = await fetchWithAuth(`/explorer/search?${qs}`);
      if (res.ok) setItems(await res.json());
    } finally { setSearching(false); setLoading(false); }
  }, []);
  const runDeep = () => { const t = search.trim(); if (t) doSearch(t, true); };
  const clearSearch = () => { setSearch(''); loadChildren(workspaceId, parentId, trashView); };

  // Debounced structural search runs instantly as the user types
  useEffect(() => {
    const term = search.trim();
    if (!workspaceId || !term) return;
    const t = setTimeout(() => doSearch(term, false), 250);
    return () => clearTimeout(t);
  }, [search, workspaceId, doSearch]);

  /* ── Navigation (double-click to open) ── */
  const open = (a: Asset) => {
    if (CONTAINER.includes(a.type)) { setSearch(''); setParentId(a.id); return; }
    if (trashView) return; // don't open trashed items
    const md = a.metadata || {};
    if ((a.type === 'FILE' || a.type === 'GENERATED_DOCUMENT') && md.uploadedDocumentId) {
      router.push(`${base}/library/${md.uploadedDocumentId}`);
    } else if (a.type === 'SCRAPED_PAGE' && md.scrapedDocumentId) {
      router.push(`${base}/documents/${md.scrapedDocumentId}`);
    }
  };
  const goRoot = () => { setSearch(''); setParentId(null); };
  const goCrumb = (id: string) => { setSearch(''); setParentId(id); };

  /* ── Mutations ── */
  const reload = () => loadChildren(workspaceId, parentId, trashView);

  const newFolder = () => setNameDialog({
    title: 'New folder', initial: 'Untitled folder',
    submit: async (name) => {
      const res = await fetchWithAuth('/assets/folder', {
        method: 'POST', body: JSON.stringify({ workspaceId, parentId, name }),
      });
      if (res.ok) { flash('Folder created'); reload(); } else flash('Failed to create folder');
    },
  });
  const rename = (a: Asset) => setNameDialog({
    title: 'Rename', initial: a.name,
    submit: async (name) => {
      if (name === a.name) return;
      const res = await fetchWithAuth(`/assets/${a.id}`, { method: 'PATCH', body: JSON.stringify({ name }) });
      if (res.ok) { flash('Renamed'); reload(); } else flash('Rename failed');
    },
  });
  const trash = async (ids: string[]) => {
    for (const id of ids) await fetchWithAuth(`/assets/${id}`, { method: 'DELETE' });
    flash(`Moved ${ids.length} item(s) to trash`); reload();
  };
  const restore = async (ids: string[]) => {
    for (const id of ids) await fetchWithAuth(`/assets/${id}/restore`, { method: 'POST' });
    flash(`Restored ${ids.length} item(s)`); reload();
  };
  const purge = async (ids: string[]) => {
    if (!confirm(`Permanently delete ${ids.length} item(s)? This cannot be undone.`)) return;
    for (const id of ids) await fetchWithAuth(`/assets/${id}/purge`, { method: 'DELETE' });
    flash('Deleted permanently'); reload();
  };
  const copy = async (a: Asset) => {
    const res = await fetchWithAuth(`/assets/${a.id}/copy`, { method: 'POST', body: JSON.stringify({ parentId }) });
    if (res.ok) { flash('Copied'); reload(); } else flash('Copy failed');
  };
  const doMove = async (ids: string[], targetId: string | null) => {
    for (const id of ids) {
      await fetchWithAuth(`/assets/${id}/move`, { method: 'POST', body: JSON.stringify({ parentId: targetId }) });
    }
    flash(`Moved ${ids.length} item(s)`); setMoveFor(null); reload();
  };

  /* ── Selection ── */
  const toggleSel = (id: string) => setSelected((s) => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  /* ── Drag & drop move ── */
  const onDrop = (target: Asset) => {
    if (!dragId.current || dragId.current === target.id) return;
    if (!CONTAINER.includes(target.type)) return;
    doMove([dragId.current], target.id);
    dragId.current = null;
  };

  /* ── Render helpers ── */
  const Toolbar = (
    <div className="flex items-center gap-3 flex-wrap">
      <button onClick={newFolder} disabled={trashView || !!search}
        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-semibold disabled:opacity-40"
        style={{ background: ACCENT, color: '#003824' }}>
        <span className="material-symbols-outlined text-[18px]">create_new_folder</span> New Folder
      </button>
      <div className="relative flex-1 min-w-[220px]">
        <span className="absolute inset-y-0 left-3 flex items-center pointer-events-none" style={{ color: '#86948a' }}><span className="material-symbols-outlined text-[18px]">search</span></span>
        <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && runDeep()}
          placeholder="Search by name…"
          className="w-full rounded-lg pl-10 pr-28 py-2 text-[13px] focus:outline-none"
          style={{ background: '#09100c', border: '1px solid #3c4a42', color: '#dde4dd' }} />
        <div className="absolute inset-y-0 right-2 flex items-center gap-1.5">
          {searching && <span className="material-symbols-outlined text-[16px] animate-spin" style={{ color: '#86948a' }}>progress_activity</span>}
          {search && <button onClick={clearSearch} title="Clear" className="material-symbols-outlined text-[18px]" style={{ color: '#86948a' }}>close</button>}
          <button onClick={runDeep} title="Search inside file contents (slower)"
            className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold"
            style={{ background: `${ACCENT}22`, color: ACCENT }}>
            <span className="material-symbols-outlined text-[14px]">travel_explore</span> Content
          </button>
        </div>
      </div>
      <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
        className="rounded-lg px-2 py-2 text-[13px]" style={{ background: '#09100c', border: '1px solid #3c4a42', color: '#dde4dd' }}>
        <option value="">All types</option>
        <option value="FOLDER">Folders</option>
        <option value="FILE">Files</option>
        <option value="SCRAPED_SITE">Scraped sites</option>
        <option value="SCRAPED_PAGE">Scraped pages</option>
      </select>
      <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid #3c4a42' }}>
        {(['grid', 'list'] as const).map((v) => (
          <button key={v} onClick={() => setView(v)} className="px-2.5 py-2"
            style={{ background: view === v ? ACCENT : 'transparent', color: view === v ? '#003824' : '#bbcabf' }}>
            <span className="material-symbols-outlined text-[18px]">{v === 'grid' ? 'grid_view' : 'view_list'}</span>
          </button>
        ))}
      </div>
      <button onClick={() => { setTrashView((t) => !t); setSearch(''); }}
        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px]"
        style={{ background: trashView ? 'rgba(239,68,68,0.15)' : '#242c27', color: trashView ? '#f87171' : '#bbcabf' }}>
        <span className="material-symbols-outlined text-[18px]">delete</span> {trashView ? 'Exit Trash' : 'Trash'}
      </button>
    </div>
  );

  // Instant client-side type filter over whatever is currently shown
  const shown = items.filter((a) => !typeFilter || a.type === typeFilter);

  const itemMenu = (a: Asset) => (
    <>
      {CONTAINER.includes(a.type) && !trashView && <MenuItem icon="folder_open" label="Open" onClick={() => open(a)} />}
      {!trashView && <MenuItem icon="edit" label="Rename" onClick={() => rename(a)} />}
      {!trashView && <MenuItem icon="person_add" label="Share" onClick={() => setShareFor(a)} />}
      {!trashView && a.type === 'FILE' && <MenuItem icon="history" label="Version history" onClick={() => setVersionsFor(a)} />}
      {!trashView && <MenuItem icon="content_copy" label="Make a copy" onClick={() => copy(a)} />}
      {!trashView && <MenuItem icon="drive_file_move" label="Move to…" onClick={() => setMoveFor([a])} />}
      {!trashView
        ? <MenuItem icon="delete" label="Move to trash" danger onClick={() => trash([a.id])} />
        : (<>
            <MenuItem icon="restore_from_trash" label="Restore" onClick={() => restore([a.id])} />
            <MenuItem icon="delete_forever" label="Delete forever" danger onClick={() => purge([a.id])} />
          </>)}
    </>
  );

  return (
    <AccentCtx.Provider value={ACCENT}>
    <div className="space-y-5" onClick={() => setMenu(null)}>
      {/* Header */}
      <div>
        <h1 className="text-[28px] font-bold" style={{ color: '#dde4dd', fontFamily: 'var(--font-geist-sans)' }}>Content Explorer</h1>
        <p className="text-[14px] mt-1" style={{ color: '#bbcabf' }}>Organize files, scraped sites and generated assets. <span style={{ color: '#5c6b60' }}>Double-click to open.</span></p>
      </div>

      {Toolbar}

      {/* Breadcrumbs */}
      {!search && !trashView && (
        <div className="flex items-center gap-1 text-[13px]" style={{ color: '#bbcabf' }}>
          <button onClick={goRoot} className="flex items-center gap-1 hover:underline" style={{ color: parentId ? '#bbcabf' : ACCENT }}>
            <span className="material-symbols-outlined text-[18px]">home</span> Home
          </button>
          {crumbs.map((c) => (
            <span key={c.id} className="flex items-center gap-1">
              <span className="material-symbols-outlined text-[16px]" style={{ color: '#5c6b60' }}>chevron_right</span>
              <button onClick={() => goCrumb(c.id)} className="hover:underline" style={{ color: c.id === parentId ? ACCENT : '#bbcabf' }}>{c.name}</button>
            </span>
          ))}
        </div>
      )}
      {search && <p className="text-[13px]" style={{ color: '#86948a' }}>Search results for “{search}” {searching && '…'}</p>}
      {trashView && <p className="text-[13px]" style={{ color: '#f87171' }}>Trash — items here can be restored or permanently deleted.</p>}

      {/* Floating selection bar — fixed so it never reflows the grid */}
      {selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-4 py-2.5 rounded-xl shadow-2xl"
          style={{ background: '#1a211d', border: `1px solid ${ACCENT}60` }}>
          <button onClick={() => setSelected(new Set())} className="material-symbols-outlined text-[18px]" style={{ color: '#86948a' }}>close</button>
          <span className="text-[13px] font-semibold" style={{ color: ACCENT }}>{selected.size} selected</span>
          <span style={{ width: 1, height: 20, background: '#3c4a42' }} />
          {!trashView ? (<>
            <BulkBtn icon="drive_file_move" label="Move" onClick={() => setMoveFor(items.filter((i) => selected.has(i.id)))} />
            <BulkBtn icon="delete" label="Trash" onClick={() => trash([...selected])} />
          </>) : (<>
            <BulkBtn icon="restore_from_trash" label="Restore" onClick={() => restore([...selected])} />
            <BulkBtn icon="delete_forever" label="Delete forever" onClick={() => purge([...selected])} />
          </>)}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="py-20 text-center" style={{ color: '#86948a' }}>
          <span className="material-symbols-outlined text-[36px] animate-pulse block mb-2">hourglass_empty</span>Loading…
        </div>
      ) : shown.length === 0 ? (
        <div className="py-20 text-center" style={{ color: '#86948a' }}>
          <span className="material-symbols-outlined text-[44px] block mb-3">{trashView ? 'delete' : 'folder_open'}</span>
          <p className="text-[14px]">{trashView ? 'Trash is empty.' : search ? 'No results.' : typeFilter ? 'Nothing of this type here.' : 'This folder is empty.'}</p>
        </div>
      ) : view === 'grid' ? (
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
          {shown.map((a) => {
            const ic = icon(a.type, ACCENT); const sel = selected.has(a.id);
            return (
              <div key={a.id}
                draggable={!trashView && !search}
                onDragStart={() => (dragId.current = a.id)}
                onDragOver={(e) => CONTAINER.includes(a.type) && e.preventDefault()}
                onDrop={() => onDrop(a)}
                onDoubleClick={() => open(a)}
                onContextMenu={(e) => { e.preventDefault(); setMenu({ asset: a, x: e.clientX, y: e.clientY }); }}
                className="group relative glass-card rounded-xl p-4 cursor-pointer transition-all overflow-hidden select-none"
                style={{ border: sel ? `1px solid ${ACCENT}` : '1px solid #262c36', background: sel ? selBg : undefined }}>
                <div className="absolute top-2 left-2 z-10"><SelectCircle selected={sel} onToggle={() => toggleSel(a.id)} /></div>
                <button onClick={(e) => { e.stopPropagation(); setMenu({ asset: a, x: e.clientX, y: e.clientY }); }}
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 material-symbols-outlined text-[18px]" style={{ color: '#86948a' }}>more_vert</button>
                <div className="flex flex-col items-center text-center mt-2 w-full overflow-hidden">
                  <span className="material-symbols-outlined text-[40px]" style={{ color: ic.color }}>{ic.name}</span>
                  <p className="text-[13px] font-medium mt-2 w-full line-clamp-2"
                    style={{ color: '#dde4dd', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{a.name}</p>
                  <p className="text-[11px] mt-1 w-full truncate" style={{ color: '#86948a' }}>
                    {CONTAINER.includes(a.type) ? `${a._count?.children ?? 0} items` : fmtSize(a.sizeBytes)}
                    {a.match === 'content' && <span style={{ color: ACCENT }}> · content</span>}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="glass-card rounded-xl overflow-hidden">
          <table className="w-full text-left text-[13px]">
            <thead><tr style={{ background: '#242c27', color: '#86948a' }}>
              <th className="px-4 py-2 w-8"></th><th className="px-4 py-2">Name</th><th className="px-4 py-2">Type</th>
              <th className="px-4 py-2">Size</th><th className="px-4 py-2">Modified</th><th className="px-4 py-2 w-10"></th>
            </tr></thead>
            <tbody>
              {shown.map((a) => {
                const ic = icon(a.type, ACCENT); const sel = selected.has(a.id);
                return (
                  <tr key={a.id} className="group cursor-pointer select-none"
                    draggable={!trashView && !search}
                    onDragStart={() => (dragId.current = a.id)}
                    onDragOver={(e) => CONTAINER.includes(a.type) && e.preventDefault()}
                    onDrop={() => onDrop(a)}
                    onDoubleClick={() => open(a)}
                    onContextMenu={(e) => { e.preventDefault(); setMenu({ asset: a, x: e.clientX, y: e.clientY }); }}
                    style={{ borderBottom: '1px solid rgba(60,74,66,0.4)', background: sel ? selBg : '' }}>
                    <td className="px-4 py-2" onClick={(e) => e.stopPropagation()}><SelectCircle selected={sel} onToggle={() => toggleSel(a.id)} /></td>
                    <td className="px-4 py-2" style={{ maxWidth: 360 }}>
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="material-symbols-outlined text-[20px] shrink-0" style={{ color: ic.color }}>{ic.name}</span>
                        <span className="truncate" style={{ color: '#dde4dd' }}>{a.name}</span>
                        {a.match === 'content' && <span className="text-[10px] shrink-0" style={{ color: ACCENT }}>content</span>}
                      </div>
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap" style={{ color: '#86948a' }}>{a.type.replace('_', ' ').toLowerCase()}</td>
                    <td className="px-4 py-2 whitespace-nowrap" style={{ color: '#86948a' }}>{CONTAINER.includes(a.type) ? '—' : fmtSize(a.sizeBytes)}</td>
                    <td className="px-4 py-2 whitespace-nowrap" style={{ color: '#86948a' }}>{fmtDate(a.updatedAt)}</td>
                    <td className="px-4 py-2">
                      <button onClick={(e) => { e.stopPropagation(); setMenu({ asset: a, x: e.clientX, y: e.clientY }); }}
                        className="material-symbols-outlined text-[18px]" style={{ color: '#86948a' }}>more_vert</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Context menu */}
      {menu && (
        <div className="fixed z-50 rounded-lg py-1 shadow-xl" style={{ left: Math.min(menu.x, window.innerWidth - 200), top: Math.min(menu.y, window.innerHeight - 280), background: '#1a211d', border: '1px solid #3c4a42', minWidth: 180 }} onClick={(e) => e.stopPropagation()}>
          {itemMenu(menu.asset)}
        </div>
      )}

      {/* Dialogs */}
      {shareFor && <ShareDialog asset={shareFor} onClose={() => setShareFor(null)} flash={flash} />}
      {versionsFor && <VersionsDialog asset={versionsFor} onClose={() => setVersionsFor(null)} flash={flash} />}
      {moveFor && <MoveDialog assets={moveFor} workspaceId={workspaceId} onClose={() => setMoveFor(null)} onMove={(t) => doMove(moveFor.map((a) => a.id), t)} />}
      {nameDialog && <NameDialog title={nameDialog.title} initial={nameDialog.initial} onClose={() => setNameDialog(null)} onSubmit={nameDialog.submit} />}

      {toast && (
        <div className="fixed bottom-6 right-6 px-4 py-2 rounded-lg text-[13px] z-50" style={{ background: '#1a211d', border: `1px solid ${ACCENT}`, color: '#dde4dd' }}>{toast}</div>
      )}
    </div>
    </AccentCtx.Provider>
  );
}

/* ── Small components ── */
function SelectCircle({ selected, onToggle }: { selected: boolean; onToggle: () => void }) {
  const ACCENT = useAccent();
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      aria-label={selected ? 'Deselect' : 'Select'}
      className={`w-5 h-5 rounded-full flex items-center justify-center transition-all ${selected ? 'opacity-100 scale-100' : 'opacity-0 group-hover:opacity-100 scale-90 group-hover:scale-100'}`}
      style={selected
        ? { background: ACCENT, boxShadow: `0 0 0 1px ${ACCENT}` }
        : { border: '2px solid #86948a', background: 'rgba(14,21,17,0.7)' }}
    >
      {selected && <span className="material-symbols-outlined text-[14px] font-bold" style={{ color: '#003824' }}>check</span>}
    </button>
  );
}

function NameDialog({ title, initial, onClose, onSubmit }: { title: string; initial: string; onClose: () => void; onSubmit: (v: string) => void }) {
  const ACCENT = useAccent();
  const [value, setValue] = useState(initial);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const t = setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select(); }, 50);
    return () => clearTimeout(t);
  }, []);
  const submit = () => { const v = value.trim(); if (v) onSubmit(v); onClose(); };
  return (
    <Modal title={title} onClose={onClose}>
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onClose(); }}
        className="w-full rounded-lg px-3 py-2.5 text-[14px] focus:outline-none"
        style={{ background: '#09100c', border: `1px solid ${ACCENT}`, color: '#dde4dd' }}
      />
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className="px-4 py-2 rounded-lg text-[13px]" style={{ background: '#242c27', color: '#bbcabf' }}>Cancel</button>
        <button onClick={submit} className="px-4 py-2 rounded-lg text-[13px] font-semibold" style={{ background: ACCENT, color: '#003824' }}>Save</button>
      </div>
    </Modal>
  );
}

function MenuItem({ icon, label, onClick, danger }: { icon: string; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} className="flex items-center gap-2 w-full px-3 py-2 text-[13px] text-left hover:bg-white/5"
      style={{ color: danger ? '#f87171' : '#dde4dd' }}>
      <span className="material-symbols-outlined text-[18px]">{icon}</span>{label}
    </button>
  );
}
function BulkBtn({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[12px] font-medium" style={{ background: '#242c27', color: '#dde4dd' }}>
      <span className="material-symbols-outlined text-[16px]">{icon}</span>{label}
    </button>
  );
}

/* ── Share dialog ── */
function ShareDialog({ asset, onClose, flash }: { asset: Asset; onClose: () => void; flash: (m: string) => void }) {
  const ACCENT = useAccent();
  const [perms, setPerms] = useState<Permission[]>([]);
  const [links, setLinks] = useState<PublicLink[]>([]);
  const [users, setUsers] = useState<{ id: number; email: string; role: string }[]>([]);
  const [selectedUser, setSelectedUser] = useState('');
  const [level, setLevel] = useState('VIEWER');
  const [pw, setPw] = useState('');
  const [expiry, setExpiry] = useState('');

  const load = useCallback(async () => {
    const [p, l] = await Promise.all([
      fetchWithAuth(`/assets/${asset.id}/permissions`),
      fetchWithAuth(`/assets/${asset.id}/public-links`),
    ]);
    if (p.ok) setPerms(await p.json());
    if (l.ok) setLinks(await l.json());
  }, [asset.id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { fetchWithAuth('/explorer/users').then((r) => (r.ok ? r.json() : [])).then(setUsers).catch(() => {}); }, []);

  const grant = async () => {
    if (!selectedUser) return;
    const res = await fetchWithAuth(`/assets/${asset.id}/permissions`, { method: 'POST', body: JSON.stringify({ userId: parseInt(selectedUser, 10), level }) });
    if (res.ok) { setSelectedUser(''); load(); flash('Shared'); } else flash('Share failed (you must be the owner)');
  };
  const myId = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('user') || '{}').id : null;
  const sharedIds = new Set(perms.map((p) => p.user.id));
  const available = users.filter((u) => u.id !== myId && !sharedIds.has(u.id));
  const revoke = async (uid: number) => { await fetchWithAuth(`/assets/${asset.id}/permissions/${uid}`, { method: 'DELETE' }); load(); };
  const createLink = async () => {
    const res = await fetchWithAuth(`/assets/${asset.id}/public-links`, { method: 'POST', body: JSON.stringify({ password: pw || undefined, expiresAt: expiry || undefined }) });
    if (res.ok) { setPw(''); setExpiry(''); load(); flash('Public link created'); }
  };
  const revokeLink = async (id: string) => { await fetchWithAuth(`/assets/${asset.id}/public-links/${id}`, { method: 'DELETE' }); load(); };
  const fullUrl = (u: string) => `${window.location.origin}${u}`;

  return (
    <Modal title={`Share “${asset.name}”`} onClose={onClose}>
      <Section label="People with access">
        {perms.length === 0 && <p className="text-[12px]" style={{ color: '#86948a' }}>Only you (owner).</p>}
        {perms.map((p) => (
          <div key={p.id} className="flex items-center justify-between py-1.5">
            <span className="text-[13px]" style={{ color: '#dde4dd' }}>{p.user.email} <span style={{ color: '#86948a' }}>· {p.level.toLowerCase()}</span></span>
            <button onClick={() => revoke(p.user.id)} className="text-[12px]" style={{ color: '#f87171' }}>Remove</button>
          </div>
        ))}
        {available.length > 0 ? (
          <div className="flex gap-2 mt-2">
            <select value={selectedUser} onChange={(e) => setSelectedUser(e.target.value)} className="flex-1 rounded px-2 py-1.5 text-[13px] min-w-0" style={{ background: '#09100c', border: '1px solid #3c4a42', color: '#dde4dd' }}>
              <option value="">Select a person by email…</option>
              {available.map((u) => <option key={u.id} value={u.id}>{u.email} · {u.role.toLowerCase().replace('_', ' ')}</option>)}
            </select>
            <select value={level} onChange={(e) => setLevel(e.target.value)} className="rounded px-2 py-1.5 text-[13px]" style={{ background: '#09100c', border: '1px solid #3c4a42', color: '#dde4dd' }}>
              <option>VIEWER</option><option>EDITOR</option><option>OWNER</option>
            </select>
            <button onClick={grant} disabled={!selectedUser} className="px-3 py-1.5 rounded text-[13px] font-semibold disabled:opacity-40" style={{ background: ACCENT, color: '#003824' }}>Share</button>
          </div>
        ) : (
          <p className="text-[12px] mt-2" style={{ color: '#86948a' }}>Everyone already has access to this item.</p>
        )}
      </Section>
      <Section label="Public links (read-only)">
        {links.map((l) => (
          <div key={l.id} className="flex items-center justify-between py-1.5 gap-2">
            <span className="text-[12px] truncate" style={{ color: '#bbcabf' }}>{fullUrl(l.url)} {l.hasPassword && '🔒'}{l.expiresAt && ` · exp ${fmtDate(l.expiresAt)}`}</span>
            <div className="flex gap-2 shrink-0">
              <button onClick={() => { navigator.clipboard.writeText(fullUrl(l.url)); flash('Link copied'); }} className="material-symbols-outlined text-[16px]" style={{ color: ACCENT }}>content_copy</button>
              <button onClick={() => revokeLink(l.id)} className="text-[12px]" style={{ color: '#f87171' }}>Revoke</button>
            </div>
          </div>
        ))}
        <div className="flex gap-2 mt-2">
          <input value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Password (optional)" className="flex-1 rounded px-2 py-1.5 text-[13px]" style={{ background: '#09100c', border: '1px solid #3c4a42', color: '#dde4dd' }} />
          <input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} className="rounded px-2 py-1.5 text-[13px]" style={{ background: '#09100c', border: '1px solid #3c4a42', color: '#dde4dd' }} />
          <button onClick={createLink} className="px-3 py-1.5 rounded text-[13px] font-semibold" style={{ background: '#242c27', color: '#dde4dd' }}>Create</button>
        </div>
      </Section>
    </Modal>
  );
}

/* ── Versions dialog ── */
function VersionsDialog({ asset, onClose, flash }: { asset: Asset; onClose: () => void; flash: (m: string) => void }) {
  const ACCENT = useAccent();
  const [versions, setVersions] = useState<Version[]>([]);
  const load = useCallback(async () => {
    const res = await fetchWithAuth(`/assets/${asset.id}/versions`);
    if (res.ok) setVersions(await res.json());
  }, [asset.id]);
  useEffect(() => { load(); }, [load]);
  const rollback = async (n: number) => {
    const res = await fetchWithAuth(`/assets/${asset.id}/versions/${n}/rollback`, { method: 'POST' });
    if (res.ok) { flash(`Rolled back to v${n}`); load(); }
  };
  return (
    <Modal title={`Version history — ${asset.name}`} onClose={onClose}>
      {versions.length === 0 && <p className="text-[13px]" style={{ color: '#86948a' }}>No versions recorded yet.</p>}
      {versions.map((v) => (
        <div key={v.id} className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid rgba(60,74,66,0.4)' }}>
          <div>
            <p className="text-[13px] font-medium" style={{ color: '#dde4dd' }}>v{v.versionNumber} {v.label && <span style={{ color: '#86948a' }}>· {v.label}</span>}</p>
            <p className="text-[11px]" style={{ color: '#86948a' }}>{fmtDate(v.createdAt)} {v.createdBy && `· ${v.createdBy.email}`}</p>
          </div>
          <button onClick={() => rollback(v.versionNumber)} className="text-[12px] px-2 py-1 rounded" style={{ background: '#242c27', color: ACCENT }}>Restore</button>
        </div>
      ))}
    </Modal>
  );
}

/* ── Move dialog (folder picker) ── */
function MoveDialog({ assets, workspaceId, onClose, onMove }: { assets: Asset[]; workspaceId: string; onClose: () => void; onMove: (target: string | null) => void }) {
  const ACCENT = useAccent();
  const [folders, setFolders] = useState<Asset[]>([]);
  const [pid, setPid] = useState<string | null>(null);
  const [path, setPath] = useState<Crumb[]>([]);
  const load = useCallback(async (p: string | null) => {
    const qs = new URLSearchParams({ workspaceId }); if (p) qs.set('parentId', p);
    const res = await fetchWithAuth(`/assets?${qs}`);
    if (res.ok) { const all: Asset[] = await res.json(); setFolders(all.filter((a) => CONTAINER.includes(a.type))); }
  }, [workspaceId]);
  useEffect(() => { load(pid); }, [pid, load]);
  const movingIds = new Set(assets.map((a) => a.id));
  return (
    <Modal title="Move to…" onClose={onClose}>
      <div className="flex items-center gap-1 text-[12px] mb-2" style={{ color: '#bbcabf' }}>
        <button onClick={() => { setPid(null); setPath([]); }} style={{ color: ACCENT }}>Home</button>
        {path.map((c, i) => (<span key={c.id}>/ <button onClick={() => { setPid(c.id); setPath(path.slice(0, i + 1)); }}>{c.name}</button></span>))}
      </div>
      <div className="rounded-lg max-h-60 overflow-y-auto" style={{ border: '1px solid #3c4a42' }}>
        {folders.length === 0 && <p className="text-[12px] p-3" style={{ color: '#86948a' }}>No subfolders here.</p>}
        {folders.map((f) => (
          <button key={f.id} disabled={movingIds.has(f.id)} onClick={() => { setPid(f.id); setPath([...path, { id: f.id, name: f.name }]); }}
            className="flex items-center gap-2 w-full px-3 py-2 text-[13px] text-left hover:bg-white/5 disabled:opacity-30" style={{ color: '#dde4dd' }}>
            <span className="material-symbols-outlined text-[18px]" style={{ color: '#fbbf24' }}>folder</span>{f.name}
          </button>
        ))}
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className="px-3 py-1.5 rounded text-[13px]" style={{ background: '#242c27', color: '#bbcabf' }}>Cancel</button>
        <button onClick={() => onMove(pid)} className="px-3 py-1.5 rounded text-[13px] font-semibold" style={{ background: ACCENT, color: '#003824' }}>
          Move here {path.length ? `→ ${path[path.length - 1].name}` : '→ Home'}
        </button>
      </div>
    </Modal>
  );
}

/* ── Modal shell ── */
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl overflow-hidden" style={{ background: '#1a211d', border: '1px solid #3c4a42' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid #3c4a42' }}>
          <h3 className="text-[16px] font-semibold" style={{ color: '#dde4dd' }}>{title}</h3>
          <button onClick={onClose} className="material-symbols-outlined text-[20px]" style={{ color: '#86948a' }}>close</button>
        </div>
        <div className="p-6 space-y-5 overflow-y-auto" style={{ maxHeight: '70vh' }}>{children}</div>
      </div>
    </div>
  );
}
function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: '#86948a' }}>{label}</p>
      {children}
    </div>
  );
}
