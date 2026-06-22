'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { fetchWithAuth } from '@/lib/apiClient';
import {
  FileText,
  FileSpreadsheet,
  Presentation,
  Trash2,
  Plus,
  RefreshCw,
  Loader2,
  User,
  Calendar,
  Hash,
} from 'lucide-react';

interface Doc {
  id: number;
  filename: string;
  mimeType: string;
  fileSize: number;
  title: string | null;
  author: string | null;
  pageCount: number | null;
  language: string | null;
  uploadedAt: string;
  uploadedBy: { email: string };
}

function getMimeIcon(mimeType: string) {
  if (mimeType === 'application/pdf') return { Icon: FileText, color: 'text-red-400' };
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel'))
    return { Icon: FileSpreadsheet, color: 'text-emerald-400' };
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint'))
    return { Icon: Presentation, color: 'text-orange-400' };
  return { Icon: FileText, color: 'text-sky-400' };
}

function getMimeLabel(mimeType: string) {
  if (mimeType === 'application/pdf') return 'PDF';
  if (mimeType.includes('wordprocessingml') || mimeType.includes('msword')) return 'DOCX';
  if (mimeType.includes('presentationml') || mimeType.includes('powerpoint')) return 'PPTX';
  if (mimeType.includes('spreadsheetml') || mimeType.includes('excel')) return 'XLSX';
  if (mimeType === 'text/plain') return 'TXT';
  return 'DOC';
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

export default function LibraryPage() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth('/documents');
      if (res.ok) setDocs(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    setDeletingId(id);
    try {
      await fetchWithAuth(`/documents/${id}`, { method: 'DELETE' });
      setDocs((prev) => prev.filter((d) => d.id !== id));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Document Library</h1>
          <p className="text-neutral-400 mt-1">
            {docs.length} document{docs.length !== 1 ? 's' : ''} uploaded
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={load}
            className="flex items-center gap-2 px-4 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-xl transition-colors"
          >
            <RefreshCw size={16} />
            Refresh
          </button>
          <Link
            href="/expert/upload"
            className="flex items-center gap-2 px-5 py-2.5 bg-teal-600 hover:bg-teal-500 text-white font-medium rounded-xl shadow-lg shadow-teal-500/20 transition-all hover:scale-105"
          >
            <Plus size={18} />
            Upload
          </Link>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-neutral-500">
          <Loader2 size={24} className="animate-spin mr-2" />
          Loading library…
        </div>
      ) : docs.length === 0 ? (
        <div className="text-center py-20 space-y-4">
          <FileText size={44} className="mx-auto text-neutral-600" />
          <p className="text-neutral-400">No documents uploaded yet.</p>
          <Link
            href="/expert/upload"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-teal-600 hover:bg-teal-500 text-white rounded-xl transition-colors"
          >
            <Plus size={16} />
            Upload your first document
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {docs.map((doc) => {
            const { Icon, color } = getMimeIcon(doc.mimeType);
            return (
              <Link
                key={doc.id}
                href={`/expert/library/${doc.id}`}
                className="flex items-center gap-4 bg-neutral-900/60 border border-white/10 hover:border-teal-500/30 rounded-2xl p-5 transition-all hover:bg-neutral-900/80 group"
              >
                {/* Icon */}
                <div className={`flex-shrink-0 w-10 h-10 rounded-xl bg-neutral-800 flex items-center justify-center ${color}`}>
                  <Icon size={20} />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-white font-medium truncate">
                      {doc.title || doc.filename}
                    </p>
                    <span className="flex-shrink-0 text-xs px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400 font-mono">
                      {getMimeLabel(doc.mimeType)}
                    </span>
                  </div>
                  {doc.title && (
                    <p className="text-neutral-500 text-xs truncate mt-0.5">{doc.filename}</p>
                  )}
                  <div className="flex items-center gap-4 mt-1.5 text-xs text-neutral-500">
                    {doc.author && (
                      <span className="flex items-center gap-1">
                        <User size={11} />
                        {doc.author}
                      </span>
                    )}
                    {doc.pageCount && (
                      <span className="flex items-center gap-1">
                        <Hash size={11} />
                        {doc.pageCount}p
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Calendar size={11} />
                      {fmtDate(doc.uploadedAt)}
                    </span>
                    <span>{formatBytes(doc.fileSize)}</span>
                  </div>
                </div>

                {/* Delete */}
                <button
                  onClick={(e) => { e.preventDefault(); handleDelete(doc.id, doc.filename); }}
                  disabled={deletingId === doc.id}
                  className="flex-shrink-0 p-2 rounded-lg text-neutral-600 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40"
                >
                  {deletingId === doc.id ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Trash2 size={16} />
                  )}
                </button>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
